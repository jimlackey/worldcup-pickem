"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSuperAdminSession } from "@/lib/auth/super-admin-session";
import { logAuditEvent, AuditAction, AuditEntity } from "@/lib/audit";
import type { MatchResult, MatchStatus } from "@/types/database";
import {
  BRACKET_NEXT,
  SEMIFINAL_LOSER_ADVANCE,
} from "@/lib/picks/bracket-wiring";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GlobalMatchActionResult = {
  success: boolean;
  error?: string;
  message?: string;
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const matchResultSchema = z.object({
  matchId: z.string().uuid(),
  homeScore: z.coerce.number().int().min(0),
  awayScore: z.coerce.number().int().min(0),
});

const matchResetSchema = z.object({
  matchId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Update match result
// ---------------------------------------------------------------------------

/**
 * Super-admin: enter or correct the score on a global match row, derive
 * the result, recalculate every pick referencing this match, and (for
 * knockout matches) auto-advance the winner downstream.
 *
 * The action is restricted to global rows (pool_id IS NULL). Demo pools
 * have their own per-pool actions that touch pool-scoped rows.
 *
 * Auth: super-admin session required.
 *
 * Pick recalculation here covers every pick set across every real pool
 * (which share the global match rows). Demo-pool pick sets reference
 * their pool's match rows, not these globals, so they're unaffected.
 */
export async function updateGlobalMatchResultAction(
  _prev: GlobalMatchActionResult,
  formData: FormData
): Promise<GlobalMatchActionResult> {
  const session = await getSuperAdminSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = matchResultSchema.safeParse({
    matchId: formData.get("matchId"),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { matchId, homeScore, awayScore } = parsed.data;

  // Load current state. Constrain to global rows so an action targeting a
  // demo-pool match id is rejected here. The same safeguard lives in the
  // pool-admin actions but flipped (demo-only).
  const { data: oldMatch } = await supabaseAdmin
    .from("matches")
    .select(
      "result, status, home_score, away_score, phase, match_number, home_team_id, away_team_id, pool_id"
    )
    .eq("id", matchId)
    .is("pool_id", null)
    .maybeSingle();

  if (!oldMatch) {
    return {
      success: false,
      error:
        "Global match not found. The match id may belong to a demo-pool row; demo pools manage their own results.",
    };
  }

  const result: MatchResult =
    homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";

  if (result === "draw" && oldMatch.phase !== "group") {
    return {
      success: false,
      error:
        "Knockout matches can't end in a draw. Enter the final score including extra time or penalties.",
    };
  }

  const isCorrection = oldMatch.result !== null;

  const { error: updateError } = await supabaseAdmin
    .from("matches")
    .update({
      result,
      home_score: homeScore,
      away_score: awayScore,
      status: "completed" as MatchStatus,
    })
    .eq("id", matchId)
    .is("pool_id", null);

  if (updateError) {
    return {
      success: false,
      error: `Failed to update match: ${updateError.message}`,
    };
  }

  // Recalculate is_correct on all picks against this global match. Picks
  // from every real pool reference this match_id, so one pass covers them all.
  await recalculateGroupPickCorrectness(matchId, result);
  await recalculateKnockoutPickCorrectness(matchId);

  // Knockout auto-advance — winner goes downstream, semifinal losers also
  // populate the consolation slot. Global rows only (pool_id NULL).
  if (
    oldMatch.match_number &&
    oldMatch.phase !== "group" &&
    oldMatch.phase !== "final" &&
    oldMatch.phase !== "consolation"
  ) {
    const winnerId =
      result === "home" ? oldMatch.home_team_id : oldMatch.away_team_id;
    if (winnerId) {
      await advanceWinnerToNextRound(oldMatch.match_number, winnerId);
    }

    if (
      oldMatch.phase === "sf" &&
      SEMIFINAL_LOSER_ADVANCE[oldMatch.match_number]
    ) {
      const loserId =
        result === "home" ? oldMatch.away_team_id : oldMatch.home_team_id;
      if (loserId) {
        await advanceLoserToConsolation(oldMatch.match_number, loserId);
      }
    }
  }

  await logAuditEvent({
    poolId: null,
    actor: { id: null, email: session.email, role: "super_admin" },
    action: AuditAction.GLOBAL_ENTER_MATCH_RESULT,
    entityType: AuditEntity.MATCH,
    entityId: matchId,
    oldValue: {
      result: oldMatch.result,
      status: oldMatch.status,
      home_score: oldMatch.home_score,
      away_score: oldMatch.away_score,
    },
    newValue: {
      result,
      home_score: homeScore,
      away_score: awayScore,
      status: "completed",
      is_correction: isCorrection,
    },
  });

  revalidatePath("/super-admin/tournament/matches");
  revalidatePath("/super-admin/tournament/knockout-setup");
  // Real pools pull their match data from these global rows, so updates
  // here invalidate everything pool-side too.
  revalidatePath("/", "layout");

  return {
    success: true,
    message: isCorrection
      ? "Result corrected. Standings recalculated across every real pool."
      : "Result entered. Standings updated across every real pool.",
  };
}

// ---------------------------------------------------------------------------
// Reset match result
// ---------------------------------------------------------------------------

/**
 * Clear a global match's score/result and revert any picks referencing it
 * back to pending. Also clears the downstream knockout slot we previously
 * auto-advanced into. Symmetric to updateGlobalMatchResultAction.
 */
export async function resetGlobalMatchResultAction(
  _prev: GlobalMatchActionResult,
  formData: FormData
): Promise<GlobalMatchActionResult> {
  const session = await getSuperAdminSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = matchResetSchema.safeParse({
    matchId: formData.get("matchId"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { matchId } = parsed.data;

  const { data: oldMatch } = await supabaseAdmin
    .from("matches")
    .select(
      "result, status, home_score, away_score, phase, match_number, pool_id"
    )
    .eq("id", matchId)
    .is("pool_id", null)
    .maybeSingle();

  if (!oldMatch) {
    return { success: false, error: "Global match not found." };
  }

  if (oldMatch.result === null && oldMatch.status === "scheduled") {
    return { success: false, error: "Match is already unscored." };
  }

  const { error: updateError } = await supabaseAdmin
    .from("matches")
    .update({
      result: null,
      home_score: null,
      away_score: null,
      status: "scheduled" as MatchStatus,
    })
    .eq("id", matchId)
    .is("pool_id", null);

  if (updateError) {
    return {
      success: false,
      error: `Failed to reset match: ${updateError.message}`,
    };
  }

  // Revert is_correct on every pick that referenced this match.
  await supabaseAdmin
    .from("group_picks")
    .update({ is_correct: null })
    .eq("match_id", matchId);
  await supabaseAdmin
    .from("knockout_picks")
    .update({ is_correct: null })
    .eq("match_id", matchId);

  // Clear the auto-advanced downstream slot for knockout matches.
  if (
    oldMatch.match_number &&
    oldMatch.phase !== "group" &&
    oldMatch.phase !== "final" &&
    oldMatch.phase !== "consolation"
  ) {
    await clearDownstreamKnockoutSlot(oldMatch.match_number);

    if (
      oldMatch.phase === "sf" &&
      SEMIFINAL_LOSER_ADVANCE[oldMatch.match_number]
    ) {
      await clearDownstreamConsolationSlot(oldMatch.match_number);
    }
  }

  await logAuditEvent({
    poolId: null,
    actor: { id: null, email: session.email, role: "super_admin" },
    action: AuditAction.GLOBAL_RESET_MATCH_RESULT,
    entityType: AuditEntity.MATCH,
    entityId: matchId,
    oldValue: {
      result: oldMatch.result,
      status: oldMatch.status,
      home_score: oldMatch.home_score,
      away_score: oldMatch.away_score,
    },
    newValue: { result: null, status: "scheduled" },
  });

  revalidatePath("/super-admin/tournament/matches");
  revalidatePath("/super-admin/tournament/knockout-setup");
  revalidatePath("/", "layout");

  return { success: true, message: "Match reset. Picks are pending again." };
}

// ---------------------------------------------------------------------------
// Pick recalculation helpers
// ---------------------------------------------------------------------------

async function recalculateGroupPickCorrectness(
  matchId: string,
  result: MatchResult
): Promise<void> {
  await supabaseAdmin
    .from("group_picks")
    .update({ is_correct: true })
    .eq("match_id", matchId)
    .eq("pick", result);
  await supabaseAdmin
    .from("group_picks")
    .update({ is_correct: false })
    .eq("match_id", matchId)
    .neq("pick", result);
}

async function recalculateKnockoutPickCorrectness(
  matchId: string
): Promise<void> {
  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("result, home_team_id, away_team_id")
    .eq("id", matchId)
    .single();
  if (!match || !match.result || !match.home_team_id || !match.away_team_id)
    return;
  const winningTeamId =
    match.result === "home" ? match.home_team_id : match.away_team_id;
  await supabaseAdmin
    .from("knockout_picks")
    .update({ is_correct: true })
    .eq("match_id", matchId)
    .eq("picked_team_id", winningTeamId);
  await supabaseAdmin
    .from("knockout_picks")
    .update({ is_correct: false })
    .eq("match_id", matchId)
    .neq("picked_team_id", winningTeamId);
}

// ---------------------------------------------------------------------------
// Bracket advancement (globals only)
// ---------------------------------------------------------------------------

async function advanceWinnerToNextRound(
  matchNumber: number,
  winnerId: string
): Promise<void> {
  const next = BRACKET_NEXT[matchNumber];
  if (!next) return;

  const { data: nextMatch } = await supabaseAdmin
    .from("matches")
    .select("id")
    .eq("match_number", next.nextMatch)
    .is("pool_id", null)
    .maybeSingle();

  if (!nextMatch) return;

  const updateField = next.slot === "home" ? "home_team_id" : "away_team_id";
  await supabaseAdmin
    .from("matches")
    .update({ [updateField]: winnerId })
    .eq("id", nextMatch.id);
}

async function advanceLoserToConsolation(
  semifinalMatchNumber: number,
  loserId: string
): Promise<void> {
  const target = SEMIFINAL_LOSER_ADVANCE[semifinalMatchNumber];
  if (!target) return;

  const { data: consolationMatch } = await supabaseAdmin
    .from("matches")
    .select("id")
    .eq("match_number", target.nextMatch)
    .is("pool_id", null)
    .maybeSingle();

  if (!consolationMatch) return;

  const updateField = target.slot === "home" ? "home_team_id" : "away_team_id";
  await supabaseAdmin
    .from("matches")
    .update({ [updateField]: loserId })
    .eq("id", consolationMatch.id);
}

async function clearDownstreamKnockoutSlot(matchNumber: number): Promise<void> {
  const next = BRACKET_NEXT[matchNumber];
  if (!next) return;

  const { data: nextMatch } = await supabaseAdmin
    .from("matches")
    .select("id")
    .eq("match_number", next.nextMatch)
    .is("pool_id", null)
    .maybeSingle();

  if (!nextMatch) return;

  const updateField = next.slot === "home" ? "home_team_id" : "away_team_id";
  await supabaseAdmin
    .from("matches")
    .update({ [updateField]: null })
    .eq("id", nextMatch.id);
}

async function clearDownstreamConsolationSlot(
  semifinalMatchNumber: number
): Promise<void> {
  const target = SEMIFINAL_LOSER_ADVANCE[semifinalMatchNumber];
  if (!target) return;

  const { data: consolationMatch } = await supabaseAdmin
    .from("matches")
    .select("id")
    .eq("match_number", target.nextMatch)
    .is("pool_id", null)
    .maybeSingle();

  if (!consolationMatch) return;

  const updateField = target.slot === "home" ? "home_team_id" : "away_team_id";
  await supabaseAdmin
    .from("matches")
    .update({ [updateField]: null })
    .eq("id", consolationMatch.id);
}

// ---------------------------------------------------------------------------
// Knockout team assignment (used by /super-admin/tournament/knockout-setup)
// ---------------------------------------------------------------------------

// Each team slot may be a real team UUID or left blank ("TBD"). A blank
// select submits an empty string; we normalise that (and any whitespace) to
// null so the DB stores a genuine "no team yet" rather than rejecting the
// save. Mirrors the pool-admin knockout assign action.
const optionalGlobalTeamId = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().uuid().nullable()
);

const knockoutTeamSchema = z.object({
  matchId: z.string().uuid(),
  homeTeamId: optionalGlobalTeamId,
  awayTeamId: optionalGlobalTeamId,
});

/**
 * Assign teams to a global knockout match slot. Used by the super-admin
 * knockout-setup page once group-stage results are entered and the bracket
 * pairings are known.
 *
 * Restricted to global rows. Demo pools have their own knockout-setup
 * page that writes to pool-scoped rows.
 */
export async function assignGlobalKnockoutTeamsAction(
  _prev: GlobalMatchActionResult,
  formData: FormData
): Promise<GlobalMatchActionResult> {
  const session = await getSuperAdminSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = knockoutTeamSchema.safeParse({
    matchId: formData.get("matchId"),
    homeTeamId: formData.get("homeTeamId"),
    awayTeamId: formData.get("awayTeamId"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { matchId, homeTeamId, awayTeamId } = parsed.data;

  // A team can't play itself.
  if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) {
    return {
      success: false,
      error: "A match can't have the same country on both sides.",
    };
  }

  const { data: oldMatch } = await supabaseAdmin
    .from("matches")
    .select("home_team_id, away_team_id, phase, tournament_id")
    .eq("id", matchId)
    .is("pool_id", null)
    .maybeSingle();

  if (!oldMatch) {
    return { success: false, error: "Global match not found." };
  }
  if (oldMatch.phase === "group") {
    return {
      success: false,
      error:
        "This action edits knockout slot assignments only. Group matches have fixed pairings.",
    };
  }

  // ---- Duplicate-country guard across the editable round ----
  //
  // Each team plays exactly one match in the hand-assigned round, so a
  // country must not occupy a slot in more than one match of that round.
  // Scoped to global rows (pool_id IS NULL) in the same tournament + phase,
  // which is exactly the set this page renders. Deeper rounds (filled by
  // advancing winners) are a different phase and excluded. Mirrors the
  // pool-admin assign action.
  const submittedTeamIds = [homeTeamId, awayTeamId].filter(
    (id): id is string => !!id
  );

  if (submittedTeamIds.length > 0) {
    const { data: siblings } = await supabaseAdmin
      .from("matches")
      .select("id, match_number, home_team_id, away_team_id")
      .eq("tournament_id", oldMatch.tournament_id)
      .eq("phase", oldMatch.phase)
      .is("pool_id", null)
      .neq("id", matchId)
      .or(
        submittedTeamIds
          .map((id) => `home_team_id.eq.${id},away_team_id.eq.${id}`)
          .join(",")
      );

    if (siblings && siblings.length > 0) {
      const clashingTeamId = submittedTeamIds.find((id) =>
        siblings.some((s) => s.home_team_id === id || s.away_team_id === id)
      );

      let teamName = "That country";
      if (clashingTeamId) {
        const { data: team } = await supabaseAdmin
          .from("teams")
          .select("name")
          .eq("id", clashingTeamId)
          .single();
        if (team?.name) teamName = team.name;
      }

      const clashMatch = siblings.find(
        (s) =>
          s.home_team_id === clashingTeamId ||
          s.away_team_id === clashingTeamId
      );
      const where =
        clashMatch?.match_number != null
          ? ` (match #${clashMatch.match_number})`
          : "";

      return {
        success: false,
        error: `${teamName} is already assigned to another match${where}. A country can only appear once in the bracket setup.`,
      };
    }
  }

  const { error } = await supabaseAdmin
    .from("matches")
    .update({ home_team_id: homeTeamId, away_team_id: awayTeamId })
    .eq("id", matchId)
    .is("pool_id", null);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    poolId: null,
    actor: { id: null, email: session.email, role: "super_admin" },
    action: AuditAction.GLOBAL_ASSIGN_KNOCKOUT_TEAM,
    entityType: AuditEntity.MATCH,
    entityId: matchId,
    oldValue: {
      home_team_id: oldMatch.home_team_id,
      away_team_id: oldMatch.away_team_id,
    },
    newValue: { home_team_id: homeTeamId, away_team_id: awayTeamId },
  });

  revalidatePath("/super-admin/tournament/knockout-setup");
  revalidatePath("/super-admin/tournament/matches");
  revalidatePath("/", "layout");

  return { success: true, message: "Teams assigned." };
}
