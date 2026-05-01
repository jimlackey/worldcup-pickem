"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import type { MatchResult, MatchStatus } from "@/types/database";
// BRACKET_NEXT and SEMIFINAL_LOSER_ADVANCE are now sourced from
// bracket-wiring.ts so the picker, scoring engine, and admin auto-advance
// all consult the same map. SEMIFINAL_LOSER_ADVANCE handles the
// consolation match's loser-fed slots.
import {
  BRACKET_NEXT,
  SEMIFINAL_LOSER_ADVANCE,
} from "@/lib/picks/bracket-wiring";

// ---- Types ----
export type AdminActionResult = {
  success: boolean;
  error?: string;
  message?: string;
};

// ---- Match Result Entry ----

const matchResultSchema = z.object({
  matchId: z.string().uuid(),
  poolSlug: z.string(),
  poolId: z.string().uuid(),
  homeScore: z.coerce.number().int().min(0),
  awayScore: z.coerce.number().int().min(0),
});

const matchResetSchema = z.object({
  matchId: z.string().uuid(),
  poolSlug: z.string(),
  poolId: z.string().uuid(),
});

export async function updateMatchResultAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = matchResultSchema.safeParse({
    matchId: formData.get("matchId"),
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { matchId, poolSlug, poolId, homeScore, awayScore } = parsed.data;

  // Verify admin session
  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Fetch current match state — needed for phase check, audit, and knockout auto-advance
  const { data: oldMatch } = await supabaseAdmin
    .from("matches")
    .select("result, status, home_score, away_score, phase, match_number, home_team_id, away_team_id, pool_id")
    .eq("id", matchId)
    .single();

  if (!oldMatch) {
    return { success: false, error: "Match not found." };
  }

  // Derive result from scores
  const result: MatchResult =
    homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";

  // Knockout matches can't end in a draw — the admin must supply a final
  // score including ET/penalties.
  if (result === "draw" && oldMatch.phase !== "group") {
    return {
      success: false,
      error:
        "Knockout matches can't end in a draw. Enter the final score including extra time or penalties.",
    };
  }

  const isCorrection = oldMatch.result !== null;

  // Update match — always set status to "completed" when scores are saved.
  const { error: updateError } = await supabaseAdmin
    .from("matches")
    .update({
      result: result as MatchResult,
      home_score: homeScore,
      away_score: awayScore,
      status: "completed" as MatchStatus,
    })
    .eq("id", matchId);

  if (updateError) {
    return { success: false, error: `Failed to update match: ${updateError.message}` };
  }

  // Recalculate is_correct on all picks referencing this match.
  await recalculateGroupPickCorrectness(matchId, result);
  await recalculateKnockoutPickCorrectness(matchId);

  // Auto-advance the winner into the next bracket slot for knockout matches.
  // The Final and the Consolation match have no downstream slot, so they
  // bail out via BRACKET_NEXT having no entry for them.
  if (
    oldMatch.match_number &&
    oldMatch.phase !== "group" &&
    oldMatch.phase !== "final" &&
    oldMatch.phase !== "consolation"
  ) {
    const winnerId =
      result === "home" ? oldMatch.home_team_id : oldMatch.away_team_id;
    if (winnerId) {
      await advanceWinnerToNextRound(
        oldMatch.match_number,
        winnerId,
        oldMatch.pool_id
      );
    }

    // Semifinal results also feed the Consolation match — but with the
    // LOSER, not the winner. We do this in addition to the winner advance
    // (which sends them to the Final). Gated on whether the pool has the
    // consolation match enabled and on whether the SF has loser-advance
    // wiring (only #101 and #102 do).
    if (
      oldMatch.phase === "sf" &&
      SEMIFINAL_LOSER_ADVANCE[oldMatch.match_number]
    ) {
      const loserId =
        result === "home" ? oldMatch.away_team_id : oldMatch.home_team_id;
      if (loserId) {
        await advanceLoserToConsolation(
          oldMatch.match_number,
          loserId,
          oldMatch.pool_id
        );
      }
    }
  }

  // Audit log
  await logAdminAction(
    session,
    isCorrection ? AuditAction.CORRECT_MATCH_RESULT : AuditAction.ENTER_MATCH_RESULT,
    AuditEntity.MATCH,
    matchId,
    {
      result: oldMatch.result,
      status: oldMatch.status,
      home_score: oldMatch.home_score,
      away_score: oldMatch.away_score,
    } as Record<string, unknown>,
    { result, home_score: homeScore, away_score: awayScore, status: "completed" }
  );

  revalidatePath(`/${poolSlug}`);
  return {
    success: true,
    message: isCorrection
      ? "Result corrected. Standings recalculated."
      : "Result entered. Standings updated.",
  };
}

export async function resetMatchResultAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = matchResetSchema.safeParse({
    matchId: formData.get("matchId"),
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { matchId, poolSlug, poolId } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  const { data: oldMatch } = await supabaseAdmin
    .from("matches")
    .select("result, status, home_score, away_score, phase, match_number, pool_id")
    .eq("id", matchId)
    .single();

  if (!oldMatch) {
    return { success: false, error: "Match not found." };
  }

  if (oldMatch.result === null && oldMatch.status === "scheduled") {
    return { success: false, error: "Match is already unscored." };
  }

  // Clear scores, result, and status on the match itself.
  const { error: updateError } = await supabaseAdmin
    .from("matches")
    .update({
      result: null,
      home_score: null,
      away_score: null,
      status: "scheduled" as MatchStatus,
    })
    .eq("id", matchId);

  if (updateError) {
    return {
      success: false,
      error: `Failed to reset match: ${updateError.message}`,
    };
  }

  // Revert is_correct on dependent picks back to pending (null).
  await supabaseAdmin
    .from("group_picks")
    .update({ is_correct: null })
    .eq("match_id", matchId);
  await supabaseAdmin
    .from("knockout_picks")
    .update({ is_correct: null })
    .eq("match_id", matchId);

  // If this is a knockout match, clear the downstream slot we previously
  // auto-advanced into. We only clear one level — if the admin had also
  // entered results for further-downstream matches, those stay as-is and the
  // admin can re-enter them if needed. This keeps reset predictable.
  if (
    oldMatch.match_number &&
    oldMatch.phase !== "group" &&
    oldMatch.phase !== "final" &&
    oldMatch.phase !== "consolation"
  ) {
    await clearDownstreamKnockoutSlot(
      oldMatch.match_number,
      oldMatch.pool_id
    );

    // Also clear the consolation slot for SF resets, since we may have
    // dropped the loser into #104 when the SF was scored.
    if (
      oldMatch.phase === "sf" &&
      SEMIFINAL_LOSER_ADVANCE[oldMatch.match_number]
    ) {
      await clearDownstreamConsolationSlot(
        oldMatch.match_number,
        oldMatch.pool_id
      );
    }
  }

  await logAdminAction(
    session,
    AuditAction.RESET_MATCH_RESULT,
    AuditEntity.MATCH,
    matchId,
    {
      result: oldMatch.result,
      status: oldMatch.status,
      home_score: oldMatch.home_score,
      away_score: oldMatch.away_score,
    } as Record<string, unknown>,
    { result: null, status: "scheduled", home_score: null, away_score: null }
  );

  revalidatePath(`/${poolSlug}`);
  return {
    success: true,
    message: "Match reset. Picks are pending again.",
  };
}

/**
 * Recalculate is_correct for all group picks on a given match.
 */
async function recalculateGroupPickCorrectness(
  matchId: string,
  result: MatchResult
): Promise<void> {
  // Set correct picks
  await supabaseAdmin
    .from("group_picks")
    .update({ is_correct: true })
    .eq("match_id", matchId)
    .eq("pick", result);

  // Set incorrect picks
  await supabaseAdmin
    .from("group_picks")
    .update({ is_correct: false })
    .eq("match_id", matchId)
    .neq("pick", result);
}

/**
 * Recalculate is_correct for knockout picks on a given match.
 * A knockout pick is correct if the picked team won.
 */
async function recalculateKnockoutPickCorrectness(
  matchId: string
): Promise<void> {
  // Get the match to determine the winner
  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("result, home_team_id, away_team_id")
    .eq("id", matchId)
    .single();

  if (!match || !match.result || !match.home_team_id || !match.away_team_id) return;

  // Determine winning team ID (no draws in knockout)
  const winningTeamId =
    match.result === "home" ? match.home_team_id : match.away_team_id;

  // Set correct
  await supabaseAdmin
    .from("knockout_picks")
    .update({ is_correct: true })
    .eq("match_id", matchId)
    .eq("picked_team_id", winningTeamId);

  // Set incorrect
  await supabaseAdmin
    .from("knockout_picks")
    .update({ is_correct: false })
    .eq("match_id", matchId)
    .neq("picked_team_id", winningTeamId);
}

// ---- Knockout Team Assignment ----

const knockoutTeamSchema = z.object({
  matchId: z.string().uuid(),
  poolSlug: z.string(),
  poolId: z.string().uuid(),
  homeTeamId: z.string().uuid(),
  awayTeamId: z.string().uuid(),
});

export async function assignKnockoutTeamsAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = knockoutTeamSchema.safeParse({
    matchId: formData.get("matchId"),
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    homeTeamId: formData.get("homeTeamId"),
    awayTeamId: formData.get("awayTeamId"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { matchId, poolSlug, poolId, homeTeamId, awayTeamId } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  const { data: oldMatch } = await supabaseAdmin
    .from("matches")
    .select("home_team_id, away_team_id")
    .eq("id", matchId)
    .single();

  const { error } = await supabaseAdmin
    .from("matches")
    .update({ home_team_id: homeTeamId, away_team_id: awayTeamId })
    .eq("id", matchId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.ASSIGN_KNOCKOUT_TEAM,
    AuditEntity.MATCH,
    matchId,
    oldMatch as Record<string, unknown>,
    { home_team_id: homeTeamId, away_team_id: awayTeamId }
  );

  revalidatePath(`/${poolSlug}`);
  return { success: true, message: "Teams assigned." };
}

// ---- Pool Settings ----

const scoringSchema = z.object({
  poolSlug: z.string(),
  poolId: z.string().uuid(),
  group: z.coerce.number().int().min(0),
  r32: z.coerce.number().int().min(0),
  r16: z.coerce.number().int().min(0),
  qf: z.coerce.number().int().min(0),
  sf: z.coerce.number().int().min(0),
  final: z.coerce.number().int().min(0),
  // Consolation may be missing from older form posts — accept undefined and
  // fall back to leaving the existing scoring_config row untouched.
  consolation: z.coerce.number().int().min(0).optional(),
});

export async function updateScoringAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = scoringSchema.safeParse({
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    group: formData.get("group"),
    r32: formData.get("r32"),
    r16: formData.get("r16"),
    qf: formData.get("qf"),
    sf: formData.get("sf"),
    final: formData.get("final"),
    consolation: formData.get("consolation") ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { poolSlug, poolId, ...scores } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Get old scoring for audit
  const { data: oldScoring } = await supabaseAdmin
    .from("scoring_config")
    .select("phase, points")
    .eq("pool_id", poolId);

  const oldMap: Record<string, number> = {};
  for (const row of oldScoring ?? []) {
    oldMap[row.phase] = row.points;
  }

  // Upsert each phase. Consolation is included if the form supplied it;
  // older callers (or the toggle being off) just leave the row at whatever
  // initialize_pool_scoring set.
  const phases: Array<"group" | "r32" | "r16" | "qf" | "sf" | "final" | "consolation"> = [
    "group",
    "r32",
    "r16",
    "qf",
    "sf",
    "final",
  ];
  if (scores.consolation !== undefined) phases.push("consolation");

  for (const phase of phases) {
    const points = scores[phase as keyof typeof scores];
    if (points === undefined) continue;
    await supabaseAdmin
      .from("scoring_config")
      .upsert(
        { pool_id: poolId, phase, points },
        { onConflict: "pool_id,phase" }
      );
  }

  await logAdminAction(
    session,
    AuditAction.ADJUST_SCORING,
    AuditEntity.SCORING_CONFIG,
    poolId,
    oldMap as Record<string, unknown>,
    scores as Record<string, unknown>
  );

  revalidatePath(`/${poolSlug}`);
  return { success: true, message: "Scoring updated." };
}

// ---- Tournament Date Controls ----

const datesSchema = z.object({
  poolSlug: z.string(),
  poolId: z.string().uuid(),
  field: z.enum(["group_lock_at", "knockout_open_at", "knockout_lock_at"]),
  value: z.string(),
});

export async function updatePoolDateAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = datesSchema.safeParse({
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    field: formData.get("field"),
    value: formData.get("value"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { poolSlug, poolId, field, value } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select("group_lock_at, knockout_open_at, knockout_lock_at")
    .eq("id", poolId)
    .single();

  const dateValue = value ? new Date(value).toISOString() : null;

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ [field]: dateValue })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  const actionMap: Record<string, typeof AuditAction[keyof typeof AuditAction]> = {
    group_lock_at: AuditAction.SET_GROUP_LOCK,
    knockout_open_at: AuditAction.SET_KNOCKOUT_OPEN,
    knockout_lock_at: AuditAction.SET_KNOCKOUT_LOCK,
  };

  await logAdminAction(
    session,
    actionMap[field]!,
    AuditEntity.POOL,
    poolId,
    { [field]: oldPool?.[field as keyof typeof oldPool] },
    { [field]: dateValue }
  );

  revalidatePath(`/${poolSlug}`);
  return { success: true, message: "Date updated." };
}

// ---- Whitelist Management ----

export async function addWhitelistAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  if (!email || !z.string().email().safeParse(email).success) {
    return { success: false, error: "Please enter a valid email." };
  }

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabaseAdmin
    .from("pool_whitelist")
    .upsert({ pool_id: poolId, email }, { onConflict: "pool_id,email" });

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.ADD_TO_WHITELIST,
    AuditEntity.WHITELIST,
    null,
    null,
    { email }
  );

  revalidatePath(`/${poolSlug}/admin/settings`);
  return { success: true, message: `${email} added to whitelist.` };
}

export async function removeWhitelistAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const email = formData.get("email") as string;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  await supabaseAdmin
    .from("pool_whitelist")
    .delete()
    .eq("pool_id", poolId)
    .eq("email", email);

  await logAdminAction(
    session,
    AuditAction.REMOVE_FROM_WHITELIST,
    AuditEntity.WHITELIST,
    null,
    { email },
    null
  );

  revalidatePath(`/${poolSlug}/admin/settings`);
  return { success: true, message: `${email} removed.` };
}

// ---- Player Management ----

export async function deactivatePickSetAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const pickSetId = formData.get("pickSetId") as string;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabaseAdmin
    .from("pick_sets")
    .update({ is_active: false })
    .eq("id", pickSetId)
    .eq("pool_id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.DEACTIVATE_PICK_SET,
    AuditEntity.PICK_SET,
    pickSetId,
    { is_active: true },
    { is_active: false }
  );

  revalidatePath(`/${poolSlug}/admin/players`);
  return { success: true, message: "Pick set deactivated." };
}

export async function deactivateParticipantAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const participantId = formData.get("participantId") as string;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Deactivate membership
  const { error } = await supabaseAdmin
    .from("pool_memberships")
    .update({ is_active: false })
    .eq("pool_id", poolId)
    .eq("participant_id", participantId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Also deactivate all their pick sets in this pool
  await supabaseAdmin
    .from("pick_sets")
    .update({ is_active: false })
    .eq("pool_id", poolId)
    .eq("participant_id", participantId);

  await logAdminAction(
    session,
    AuditAction.DEACTIVATE_PARTICIPANT,
    AuditEntity.PARTICIPANT,
    participantId,
    { is_active: true },
    { is_active: false, pick_sets_deactivated: true }
  );

  revalidatePath(`/${poolSlug}/admin/players`);
  return { success: true, message: "Participant and all their pick sets deactivated." };
}

// ---- Pool Visibility Toggle ----

export async function togglePoolVisibilityAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const isListed = formData.get("isListed") === "true";

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ is_listed: isListed })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/${poolSlug}`);
  revalidatePath("/");
  return {
    success: true,
    message: isListed
      ? "Pool is now visible on the listing."
      : "Pool is now hidden from the listing.",
  };
}

// ---- Auto-advance helpers ----
//
// These call sites all use BRACKET_NEXT (championship advancement) and
// SEMIFINAL_LOSER_ADVANCE (consolation advancement) imported from
// bracket-wiring.ts. The local `BRACKET_NEXT` const that used to live in
// this file is gone — the import is the single source of truth.

async function advanceWinnerToNextRound(
  matchNumber: number,
  winnerId: string,
  poolId: string | null
): Promise<void> {
  const next = BRACKET_NEXT[matchNumber];
  if (!next) return; // Final has no next match

  // Find the next match by match_number and pool_id
  let query = supabaseAdmin
    .from("matches")
    .select("id")
    .eq("match_number", next.nextMatch);

  if (poolId) {
    query = query.eq("pool_id", poolId);
  } else {
    query = query.is("pool_id", null);
  }

  const { data: nextMatch } = await query.single();
  if (!nextMatch) return;

  // Place winner in the correct slot
  const updateField = next.slot === "home" ? "home_team_id" : "away_team_id";
  await supabaseAdmin
    .from("matches")
    .update({ [updateField]: winnerId })
    .eq("id", nextMatch.id);
}

/**
 * Drop the loser of a semifinal into the appropriate slot of the
 * Consolation match (#104). No-ops gracefully if the consolation row
 * doesn't exist for this pool — which can happen for older real pools
 * created before migration 013 was applied. We don't gate on the
 * consolation_match_enabled flag here: the row exists for every pool
 * post-migration, the flag is purely a UI gate.
 */
async function advanceLoserToConsolation(
  semifinalMatchNumber: number,
  loserId: string,
  poolId: string | null
): Promise<void> {
  const target = SEMIFINAL_LOSER_ADVANCE[semifinalMatchNumber];
  if (!target) return;

  let query = supabaseAdmin
    .from("matches")
    .select("id")
    .eq("match_number", target.nextMatch);

  if (poolId) {
    query = query.eq("pool_id", poolId);
  } else {
    query = query.is("pool_id", null);
  }

  const { data: consolationMatch } = await query.maybeSingle();
  if (!consolationMatch) return;

  const updateField = target.slot === "home" ? "home_team_id" : "away_team_id";
  await supabaseAdmin
    .from("matches")
    .update({ [updateField]: loserId })
    .eq("id", consolationMatch.id);
}

/**
 * When a knockout match is reset, the team we previously auto-advanced into
 * the downstream slot is now stale. Clear that single slot so the bracket
 * reflects the current state. We don't cascade further — the admin can
 * re-enter the upstream result and the downstream slot will be re-populated
 * automatically.
 */
async function clearDownstreamKnockoutSlot(
  matchNumber: number,
  poolId: string | null
): Promise<void> {
  const next = BRACKET_NEXT[matchNumber];
  if (!next) return;

  let query = supabaseAdmin
    .from("matches")
    .select("id")
    .eq("match_number", next.nextMatch);

  if (poolId) {
    query = query.eq("pool_id", poolId);
  } else {
    query = query.is("pool_id", null);
  }

  const { data: nextMatch } = await query.single();
  if (!nextMatch) return;

  const updateField = next.slot === "home" ? "home_team_id" : "away_team_id";
  await supabaseAdmin
    .from("matches")
    .update({ [updateField]: null })
    .eq("id", nextMatch.id);
}

/**
 * Counterpart to clearDownstreamKnockoutSlot for the loser-feeds-#104
 * relationship. Used when a semifinal is reset — the loser we previously
 * dropped into the consolation slot is no longer correct.
 */
async function clearDownstreamConsolationSlot(
  semifinalMatchNumber: number,
  poolId: string | null
): Promise<void> {
  const target = SEMIFINAL_LOSER_ADVANCE[semifinalMatchNumber];
  if (!target) return;

  let query = supabaseAdmin
    .from("matches")
    .select("id")
    .eq("match_number", target.nextMatch);

  if (poolId) {
    query = query.eq("pool_id", poolId);
  } else {
    query = query.is("pool_id", null);
  }

  const { data: consolationMatch } = await query.maybeSingle();
  if (!consolationMatch) return;

  const updateField = target.slot === "home" ? "home_team_id" : "away_team_id";
  await supabaseAdmin
    .from("matches")
    .update({ [updateField]: null })
    .eq("id", consolationMatch.id);
}

// ---- Admin Role Management ----

export async function promoteToAdminAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const participantId = formData.get("participantId") as string;

  if (!participantId) {
    return { success: false, error: "Participant ID required." };
  }

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Read current membership for audit log + sanity check
  const { data: membership } = await supabaseAdmin
    .from("pool_memberships")
    .select("id, role, is_active, participant:participants(email, display_name)")
    .eq("pool_id", poolId)
    .eq("participant_id", participantId)
    .single();

  if (!membership) {
    return { success: false, error: "That person is not a member of this pool." };
  }

  if (!membership.is_active) {
    return {
      success: false,
      error: "That member is deactivated. Reactivate them before promoting.",
    };
  }

  if (membership.role === "admin") {
    return { success: false, error: "That member is already an admin." };
  }

  const { error } = await supabaseAdmin
    .from("pool_memberships")
    .update({ role: "admin" })
    .eq("id", membership.id);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.PROMOTE_TO_ADMIN,
    AuditEntity.MEMBERSHIP,
    membership.id,
    { role: membership.role },
    { role: "admin" }
  );

  revalidatePath(`/${poolSlug}/admin/players`);
  const displayName =
    // @ts-expect-error Supabase returns nested as array|object depending on relation
    membership.participant?.display_name ?? membership.participant?.email ?? "Member";
  return { success: true, message: `${displayName} is now an admin.` };
}

export async function demoteToPlayerAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const participantId = formData.get("participantId") as string;

  if (!participantId) {
    return { success: false, error: "Participant ID required." };
  }

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Self-demotion guard — an admin cannot demote themselves.
  // This prevents accidental lockout.
  if (session.participantId === participantId) {
    return {
      success: false,
      error:
        "You can't demote yourself. Ask another admin to do it if you want to step down.",
    };
  }

  const { data: membership } = await supabaseAdmin
    .from("pool_memberships")
    .select("id, role, participant:participants(email, display_name)")
    .eq("pool_id", poolId)
    .eq("participant_id", participantId)
    .single();

  if (!membership) {
    return { success: false, error: "That person is not a member of this pool." };
  }

  if (membership.role !== "admin") {
    return { success: false, error: "That member is already a player." };
  }

  const { error } = await supabaseAdmin
    .from("pool_memberships")
    .update({ role: "player" })
    .eq("id", membership.id);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.DEMOTE_TO_PLAYER,
    AuditEntity.MEMBERSHIP,
    membership.id,
    { role: "admin" },
    { role: "player" }
  );

  revalidatePath(`/${poolSlug}/admin/players`);
  const displayName =
    // @ts-expect-error see promote action
    membership.participant?.display_name ?? membership.participant?.email ?? "Member";
  return { success: true, message: `${displayName} is now a player.` };
}

/**
 * Bulk-add whitelist entries.
 *
 * Input: free-form text from a <textarea> where emails may be separated by
 * commas, newlines, semicolons, or whitespace (any combination). Invalid
 * entries are counted and reported but don't block the valid ones.
 *
 * Returns a summary like:
 *   "Added 12. Skipped 3 duplicates. 1 invalid: 'not-an-email'."
 */
export async function bulkAddWhitelistAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const raw = (formData.get("emails") as string) ?? "";

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Split on commas, semicolons, and any whitespace (including newlines and tabs).
  // This way pasting from a spreadsheet column or a comma-separated list both work.
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) {
    return {
      success: false,
      error: "No emails to add. Paste a comma- or newline-separated list.",
    };
  }

  // Deduplicate within the input itself first.
  const uniqueTokens = Array.from(new Set(tokens));

  // Validate each.
  const valid: string[] = [];
  const invalid: string[] = [];
  const emailSchema = z.string().email();
  for (const token of uniqueTokens) {
    if (emailSchema.safeParse(token).success) {
      valid.push(token);
    } else {
      invalid.push(token);
    }
  }

  if (valid.length === 0) {
    return {
      success: false,
      error: `No valid emails found. Check: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`,
    };
  }

  // Fetch existing whitelist once so we can count how many are duplicates.
  // This is purely for the summary message — the upsert itself would handle
  // duplicates, but we want to tell the admin how many already existed.
  const { data: existing } = await supabaseAdmin
    .from("pool_whitelist")
    .select("email")
    .eq("pool_id", poolId)
    .in("email", valid);

  const existingSet = new Set((existing ?? []).map((r) => r.email.toLowerCase()));
  const toInsert = valid.filter((e) => !existingSet.has(e));
  const duplicateCount = valid.length - toInsert.length;

  // Upsert the new ones. We upsert (not just insert) to be safe against races.
  if (toInsert.length > 0) {
    const rows = toInsert.map((email) => ({ pool_id: poolId, email }));
    const { error } = await supabaseAdmin
      .from("pool_whitelist")
      .upsert(rows, { onConflict: "pool_id,email" });

    if (error) {
      return { success: false, error: error.message };
    }

    // Audit one log entry for the whole batch (so the log doesn't get flooded
    // when someone pastes 100 emails). Individual adds via addWhitelistAction
    // still log one-per-event as before.
    await logAdminAction(
      session,
      AuditAction.ADD_TO_WHITELIST,
      AuditEntity.WHITELIST,
      null,
      null,
      { emails: toInsert, count: toInsert.length, source: "bulk" }
    );
  }

  revalidatePath(`/${poolSlug}/admin/settings`);

  // Build a human summary.
  const parts: string[] = [];
  parts.push(
    `Added ${toInsert.length} email${toInsert.length === 1 ? "" : "s"}.`
  );
  if (duplicateCount > 0) {
    parts.push(
      `Skipped ${duplicateCount} already on the list.`
    );
  }
  if (invalid.length > 0) {
    const preview = invalid.slice(0, 3).join(", ");
    const more = invalid.length > 3 ? ` (+${invalid.length - 3} more)` : "";
    parts.push(
      `${invalid.length} invalid: ${preview}${more}.`
    );
  }

  // If the ONLY outcome was "everything was a duplicate" and nothing was added,
  // report as not-success so the UI can show it clearly, but keep the text
  // informative.
  if (toInsert.length === 0 && invalid.length === 0 && duplicateCount > 0) {
    return {
      success: false,
      error: `All ${duplicateCount} email${duplicateCount === 1 ? " was" : "s were"} already on the list.`,
    };
  }

  return { success: true, message: parts.join(" ") };
}
