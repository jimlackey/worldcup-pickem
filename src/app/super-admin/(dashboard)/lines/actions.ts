"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSuperAdminSession } from "@/lib/auth/super-admin-session";
import { logAuditEvent, AuditAction, AuditEntity } from "@/lib/audit";
import { TOURNAMENT_ID } from "@/lib/utils/constants";
import { fetchWorldCupOdds, matchOddsEventsToMatches } from "@/lib/lines/odds-api";
import { writeLinesGlobalAndDemos } from "@/lib/lines/sync";
import type { Team } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinesActionResult = {
  success: boolean;
  error?: string;
  message?: string;
};

export type FetchLinesActionResult = LinesActionResult & {
  /** How many global match rows had lines applied. */
  matched?: number;
  /** How many Odds API events couldn't be aligned to a global match. */
  unmatched?: number;
  /** Per-event reasons for any unmatched events. */
  unmatchedDetails?: string[];
  /** Bookmaker name (best-effort) for the run. */
  bookmaker?: string;
  /** Total demo-pool match rows the run propagated values into. */
  demoPropagated?: number;
};

// ---------------------------------------------------------------------------
// Schema for manual edit
// ---------------------------------------------------------------------------

/**
 * Same money-line validation rules as the original pool-admin action.
 * Accepts an empty string (clears the line → NULL) or a signed integer
 * outside the ±99 range, capped at ±100,000. The CHECK constraint in
 * migration 014 enforces the same bounds at the DB level.
 */
const moneyLineField = z
  .union([z.literal(""), z.string()])
  .transform((s) => (s === "" ? null : s))
  .refine(
    (v) => {
      if (v === null) return true;
      const cleaned = v.replace(/^\+/, "");
      const n = Number(cleaned);
      return Number.isInteger(n) && n !== 0;
    },
    { message: "Money lines must be whole numbers (with sign), e.g. -190 or 330." }
  )
  .transform((v) => (v === null ? null : Number(v.replace(/^\+/, ""))))
  .refine(
    (n) =>
      n === null ||
      (n >= -100000 && n <= -100) ||
      (n >= 100 && n <= 100000),
    { message: "Lines must be ≤ -100 or ≥ +100 and within ±100,000." }
  );

const updateLinesSchema = z.object({
  matchId: z.string().uuid(),
  homeMoneyLine: moneyLineField,
  drawMoneyLine: moneyLineField,
  awayMoneyLine: moneyLineField,
});

// ---------------------------------------------------------------------------
// Manual edit — single global match
// ---------------------------------------------------------------------------

/**
 * Super-admin update of the three money-line columns on a single global
 * match row. Writes to the global row (matches.pool_id IS NULL) and
 * propagates the same values to every demo-pool copy of the match. The
 * sync helper does the propagation.
 *
 * Auth: super-admin session required. Auditable (one EDIT_MATCH_LINES
 * event per save, with the global match id as the entity_id and the
 * propagated demo count in new_value for forensic traceability).
 */
export async function updateMatchLinesAction(
  _prev: LinesActionResult,
  formData: FormData
): Promise<LinesActionResult> {
  const session = await getSuperAdminSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = updateLinesSchema.safeParse({
    matchId: formData.get("matchId"),
    homeMoneyLine: formData.get("homeMoneyLine") ?? "",
    drawMoneyLine: formData.get("drawMoneyLine") ?? "",
    awayMoneyLine: formData.get("awayMoneyLine") ?? "",
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { matchId, homeMoneyLine, drawMoneyLine, awayMoneyLine } = parsed.data;

  // Read the previous values so the audit log captures both sides.
  const { data: oldMatch } = await supabaseAdmin
    .from("matches")
    .select("home_money_line, draw_money_line, away_money_line, match_number")
    .eq("id", matchId)
    .is("pool_id", null)
    .maybeSingle();

  if (!oldMatch) {
    return {
      success: false,
      error: "Global match not found. The id may belong to a demo-pool match row, which the super-admin page doesn't edit directly.",
    };
  }

  // Write global + propagate to demo pools.
  let writeResult;
  try {
    writeResult = await writeLinesGlobalAndDemos(matchId, {
      home_money_line: homeMoneyLine,
      draw_money_line: drawMoneyLine,
      away_money_line: awayMoneyLine,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }

  await logAuditEvent({
    poolId: null,
    actor: { id: null, email: session.email, role: "super_admin" },
    action: AuditAction.EDIT_MATCH_LINES,
    entityType: AuditEntity.MATCH,
    entityId: matchId,
    oldValue: {
      home_money_line: oldMatch.home_money_line,
      draw_money_line: oldMatch.draw_money_line,
      away_money_line: oldMatch.away_money_line,
    },
    newValue: {
      home_money_line: homeMoneyLine,
      draw_money_line: drawMoneyLine,
      away_money_line: awayMoneyLine,
      match_number: oldMatch.match_number,
      demo_pools_propagated: writeResult.demoUpdated,
    },
  });

  revalidatePath("/super-admin/lines");
  // Real pools and demo pools both read matches in their /my-picks
  // forms — revalidate broadly so the next page render reflects the
  // new values without a hard reload.
  revalidatePath("/", "layout");

  return {
    success: true,
    message:
      writeResult.demoUpdated > 0
        ? `Saved. Propagated to ${writeResult.demoUpdated} demo-pool match row${writeResult.demoUpdated === 1 ? "" : "s"}.`
        : "Lines saved.",
  };
}

// ---------------------------------------------------------------------------
// Bulk fetch from The Odds API
// ---------------------------------------------------------------------------

/**
 * Bulk-fetch World Cup money lines from The Odds API, apply each matched
 * event to its global match row, and propagate to demo pools.
 *
 * Activation is gated by the THE_ODDS_API_KEY env var — the button that
 * triggers this is hidden when the var is unset, and the action also
 * checks defensively in case the button is somehow reachable without the
 * key being configured.
 *
 * Auth: super-admin session required. Auditable: one FETCH_MATCH_LINES
 * summary event per run; no per-match EDIT events to keep audit noise
 * bounded.
 */
export async function fetchMatchLinesAction(
  _prev: FetchLinesActionResult,
  _formData: FormData
): Promise<FetchLinesActionResult> {
  const session = await getSuperAdminSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error:
        "The Odds API key is not configured on the server. Set THE_ODDS_API_KEY in .env.",
    };
  }

  // Load global teams and matches — that's what the matcher works against.
  // We pull both with pool_id IS NULL so the matcher only ever resolves
  // global team ids. Demo-pool team rows have different ids than their
  // global counterparts, which is why we propagate after matching.
  const [teamsRes, matchesRes] = await Promise.all([
    supabaseAdmin.from("teams").select("*").is("pool_id", null),
    supabaseAdmin
      .from("matches")
      .select("id, home_team_id, away_team_id")
      .is("pool_id", null),
  ]);

  const teams = (teamsRes.data ?? []) as Team[];
  const globalMatches = (matchesRes.data ?? []) as Array<{
    id: string;
    home_team_id: string | null;
    away_team_id: string | null;
  }>;

  if (teams.length === 0 || globalMatches.length === 0) {
    return {
      success: false,
      error: "No global teams/matches found. Seed tournament data first.",
    };
  }

  // Fetch.
  let events;
  try {
    events = await fetchWorldCupOdds(apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }

  if (events.length === 0) {
    return {
      success: true,
      message:
        "The Odds API returned no events. The World Cup may be out of season — check back closer to the tournament.",
      matched: 0,
      unmatched: 0,
      demoPropagated: 0,
    };
  }

  const outcomes = matchOddsEventsToMatches(events, teams, globalMatches);

  // For each matched event, write global + propagate. Counts are
  // accumulated for the summary message.
  let matched = 0;
  let demoPropagated = 0;
  const unmatchedDetails: string[] = [];

  for (const o of outcomes) {
    if (o.reason !== "matched" || !o.matchId) {
      unmatchedDetails.push(
        `${o.homeTeamName} vs ${o.awayTeamName} (${
          o.reason === "no_team_match" ? "team not in roster" : "ambiguous"
        })`
      );
      continue;
    }

    try {
      const result = await writeLinesGlobalAndDemos(o.matchId, {
        home_money_line: o.homeMoneyLine,
        draw_money_line: o.drawMoneyLine,
        away_money_line: o.awayMoneyLine,
      });
      if (result.globalUpdated === 0) {
        unmatchedDetails.push(
          `${o.homeTeamName} vs ${o.awayTeamName} (global match not found)`
        );
        continue;
      }
      matched++;
      demoPropagated += result.demoUpdated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      unmatchedDetails.push(`${o.homeTeamName} vs ${o.awayTeamName} (${msg})`);
    }
  }

  await logAuditEvent({
    poolId: null,
    actor: { id: null, email: session.email, role: "super_admin" },
    action: AuditAction.FETCH_MATCH_LINES,
    entityType: AuditEntity.MATCH,
    entityId: null,
    oldValue: null,
    newValue: {
      events_returned: events.length,
      matched,
      unmatched: outcomes.length - matched,
      demo_rows_propagated: demoPropagated,
      bookmaker: events[0]?.bookmaker ?? null,
    } as Record<string, unknown>,
  });

  revalidatePath("/super-admin/lines");
  revalidatePath("/", "layout");

  // Build the result message with context about WHY the count isn't 103.
  // Two distinct reasons a tournament match may not appear in the fetch:
  //
  //   1. "Awaiting teams" — knockout slots whose home/away teams aren't
  //      decided yet. No bookmaker can post a line until both teams are
  //      known, so these are expected gaps and aren't actionable from
  //      this page.
  //
  //   2. "Not yet listed" — matches with both teams assigned (typically
  //      group-stage matches in later matchdays) that the bookmaker
  //      simply hasn't posted lines for yet. Bookmakers tend to release
  //      lines 7-14 days before kickoff, so the early group matches show
  //      up first and later matches appear progressively.
  //
  // Without this breakdown the message read as "we fetched all the lines"
  // even when 50 of 103 matches were silently absent — confusing.
  const fetchableMatchCount = globalMatches.filter(
    (m) => m.home_team_id != null && m.away_team_id != null
  ).length;
  const awaitingTeams = globalMatches.length - fetchableMatchCount;
  const notYetListed = fetchableMatchCount - matched;

  const propagationSuffix =
    demoPropagated > 0
      ? ` Propagated to ${demoPropagated} demo-pool row${demoPropagated === 1 ? "" : "s"}.`
      : "";

  let message: string;
  if (matched === 0) {
    message = `No matches updated.${propagationSuffix}`;
  } else {
    const head = `Fetched ${matched} match line${matched === 1 ? "" : "s"}.`;
    const gapParts: string[] = [];
    if (notYetListed > 0) {
      gapParts.push(
        `${notYetListed} match${notYetListed === 1 ? "" : "es"} with both teams assigned don't yet have lines posted — re-run closer to kickoff`
      );
    }
    if (awaitingTeams > 0) {
      gapParts.push(
        `${awaitingTeams} knockout match${awaitingTeams === 1 ? "" : "es"} awaiting team assignments`
      );
    }
    const gapSuffix = gapParts.length > 0 ? ` ${gapParts.join("; ")}.` : "";
    message = `${head}${propagationSuffix}${gapSuffix}`;
  }

  return {
    success: true,
    message,
    matched,
    unmatched: outcomes.length - matched,
    unmatchedDetails,
    bookmaker: events[0]?.bookmaker ?? undefined,
    demoPropagated,
  };
}

// ---------------------------------------------------------------------------
// Helper for the page: load all global matches with team data
// ---------------------------------------------------------------------------

export async function getGlobalMatchesForLines() {
  // Single query joining home/away/group, scoped to global tournament rows.
  // Mirrors the shape returned by lib/tournament/queries.getMatches() but
  // doesn't require a pool — used by the super-admin lines page server
  // component.
  const { data } = await supabaseAdmin
    .from("matches")
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*),
      group:groups(*)
    `
    )
    .eq("tournament_id", TOURNAMENT_ID)
    .is("pool_id", null)
    .order("match_number");

  return data ?? [];
}
