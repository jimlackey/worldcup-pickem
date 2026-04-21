"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import type { MatchResult, MatchStatus } from "@/types/database";

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
  result: z.enum(["home", "draw", "away"]),
  homeScore: z.coerce.number().int().min(0),
  awayScore: z.coerce.number().int().min(0),
  status: z.enum(["scheduled", "in_progress", "completed"]),
});

export async function updateMatchResultAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = matchResultSchema.safeParse({
    matchId: formData.get("matchId"),
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    result: formData.get("result"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { matchId, poolSlug, poolId, result, homeScore, awayScore, status } = parsed.data;

  // Verify admin session
  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Get current match state for audit log
  const { data: oldMatch } = await supabaseAdmin
    .from("matches")
    .select("result, status, home_score, away_score")
    .eq("id", matchId)
    .single();

  const isCorrection = oldMatch?.result !== null;

  // Update match
  const { error: updateError } = await supabaseAdmin
    .from("matches")
    .update({
      result: result as MatchResult,
      home_score: homeScore,
      away_score: awayScore,
      status: status as MatchStatus,
    })
    .eq("id", matchId);

  if (updateError) {
    return { success: false, error: `Failed to update match: ${updateError.message}` };
  }

  // Recalculate is_correct for all group picks on this match
  if (status === "completed") {
    await recalculateGroupPickCorrectness(matchId, result as MatchResult);
    await recalculateKnockoutPickCorrectness(matchId);

    // Auto-advance: if this is a knockout match, place the winner in the next round
    const { data: completedMatch } = await supabaseAdmin
      .from("matches")
      .select("match_number, home_team_id, away_team_id, phase, pool_id")
      .eq("id", matchId)
      .single();

    if (completedMatch?.match_number && completedMatch.phase !== "group" && completedMatch.phase !== "final") {
      const winnerId = result === "home" ? completedMatch.home_team_id : completedMatch.away_team_id;
      if (winnerId) {
        await advanceWinnerToNextRound(completedMatch.match_number, winnerId, completedMatch.pool_id);
      }
    }
  }

  // Audit log
  await logAdminAction(
    session,
    isCorrection ? AuditAction.CORRECT_MATCH_RESULT : AuditAction.ENTER_MATCH_RESULT,
    AuditEntity.MATCH,
    matchId,
    oldMatch as Record<string, unknown>,
    { result, home_score: homeScore, away_score: awayScore, status }
  );

  revalidatePath(`/${poolSlug}`);
  return {
    success: true,
    message: isCorrection ? "Result corrected. Standings recalculated." : "Result entered. Standings updated.",
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

  // Upsert each phase
  const phases = ["group", "r32", "r16", "qf", "sf", "final"] as const;
  for (const phase of phases) {
    await supabaseAdmin
      .from("scoring_config")
      .upsert(
        { pool_id: poolId, phase, points: scores[phase] },
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
    message: isListed ? "Pool is now visible on the listing." : "Pool is now hidden from the listing.",
  };
}

// ---- Auto-advance knockout winner to next round ----

// Bracket wiring: match_number → next match, and which slot (home or away)
const BRACKET_NEXT: Record<number, { nextMatch: number; slot: "home" | "away" }> = {
  // R32 → R16
  73: { nextMatch: 89, slot: "home" }, 74: { nextMatch: 89, slot: "away" },
  75: { nextMatch: 90, slot: "home" }, 76: { nextMatch: 90, slot: "away" },
  77: { nextMatch: 91, slot: "home" }, 78: { nextMatch: 91, slot: "away" },
  79: { nextMatch: 92, slot: "home" }, 80: { nextMatch: 92, slot: "away" },
  81: { nextMatch: 93, slot: "home" }, 82: { nextMatch: 93, slot: "away" },
  83: { nextMatch: 94, slot: "home" }, 84: { nextMatch: 94, slot: "away" },
  85: { nextMatch: 95, slot: "home" }, 86: { nextMatch: 95, slot: "away" },
  87: { nextMatch: 96, slot: "home" }, 88: { nextMatch: 96, slot: "away" },
  // R16 → QF
  89: { nextMatch: 97, slot: "home" }, 90: { nextMatch: 97, slot: "away" },
  91: { nextMatch: 98, slot: "home" }, 92: { nextMatch: 98, slot: "away" },
  93: { nextMatch: 99, slot: "home" }, 94: { nextMatch: 99, slot: "away" },
  95: { nextMatch: 100, slot: "home" }, 96: { nextMatch: 100, slot: "away" },
  // QF → SF
  97: { nextMatch: 101, slot: "home" }, 98: { nextMatch: 101, slot: "away" },
  99: { nextMatch: 102, slot: "home" }, 100: { nextMatch: 102, slot: "away" },
  // SF → Final
  101: { nextMatch: 103, slot: "home" }, 102: { nextMatch: 103, slot: "away" },
};

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
