"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import { fetchWorldCupOdds, matchOddsEventsToMatches } from "@/lib/lines/odds-api";
import type { AdminActionResult } from "./actions";
import type { Pool, Team } from "@/types/database";

// ---------------------------------------------------------------------------
// Manual edit — single match
// ---------------------------------------------------------------------------

/**
 * Validate a money-line input. Accepts:
 *   - Empty string → null (clears the line)
 *   - A number, optionally prefixed by `+` or `-`
 *
 * Range bounds mirror the CHECK constraint in migration 014:
 *   -100000 .. -100  OR  +100 .. +100000.
 * Zero and values inside ±100 are rejected.
 */
const moneyLineField = z
  .union([z.literal(""), z.string()])
  .transform((s) => (s === "" ? null : s))
  .refine(
    (v) => {
      if (v === null) return true;
      // Allow a leading `+` so the user can type "+330" naturally.
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
  poolSlug: z.string(),
  poolId: z.string().uuid(),
  homeMoneyLine: moneyLineField,
  drawMoneyLine: moneyLineField,
  awayMoneyLine: moneyLineField,
});

/**
 * Update the home/draw/away money lines on a single match.
 *
 * All three fields are independently nullable. Passing `null` (or empty
 * string in the form) clears that side.
 *
 * Auth: pool admin only. Auditable.
 */
export async function updateMatchLinesAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = updateLinesSchema.safeParse({
    matchId: formData.get("matchId"),
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    homeMoneyLine: formData.get("homeMoneyLine") ?? "",
    drawMoneyLine: formData.get("drawMoneyLine") ?? "",
    awayMoneyLine: formData.get("awayMoneyLine") ?? "",
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { matchId, poolSlug, poolId, homeMoneyLine, drawMoneyLine, awayMoneyLine } =
    parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Fetch existing values so the audit log has a diff. We deliberately
  // do not double-check the match's pool_id against poolId here: the
  // matches table holds both global (pool_id IS NULL) and demo-scoped
  // (pool_id = pool.id) rows, and real pools READ from the global rows
  // and WRITE results to them too — same pattern as score entry.
  const { data: oldMatch } = await supabaseAdmin
    .from("matches")
    .select("home_money_line, draw_money_line, away_money_line")
    .eq("id", matchId)
    .single();

  if (!oldMatch) {
    return { success: false, error: "Match not found." };
  }

  const { error } = await supabaseAdmin
    .from("matches")
    .update({
      home_money_line: homeMoneyLine,
      draw_money_line: drawMoneyLine,
      away_money_line: awayMoneyLine,
    })
    .eq("id", matchId);

  if (error) {
    return {
      success: false,
      error: `Failed to update lines: ${error.message}`,
    };
  }

  await logAdminAction(
    session,
    AuditAction.EDIT_MATCH_LINES,
    AuditEntity.MATCH,
    matchId,
    {
      home_money_line: oldMatch.home_money_line,
      draw_money_line: oldMatch.draw_money_line,
      away_money_line: oldMatch.away_money_line,
    },
    {
      home_money_line: homeMoneyLine,
      draw_money_line: drawMoneyLine,
      away_money_line: awayMoneyLine,
    }
  );

  revalidatePath(`/${poolSlug}/admin/matches`);
  revalidatePath(`/${poolSlug}/my-picks`, "layout");
  return { success: true, message: "Lines saved." };
}

// ---------------------------------------------------------------------------
// Bulk fetch — pull every World Cup match from the Odds API and persist
// matched lines in one round trip.
// ---------------------------------------------------------------------------

const fetchLinesSchema = z.object({
  poolSlug: z.string(),
  poolId: z.string().uuid(),
});

export type FetchLinesActionResult = AdminActionResult & {
  /** Number of API events that were matched to a pool match and saved. */
  matched?: number;
  /** Number of API events that could not be matched to a pool match. */
  unmatched?: number;
  /** Human-readable list of unmatched events for the admin to review. */
  unmatchedDetails?: string[];
  /** Bookmaker used (best-effort; reflects the first event in the response). */
  bookmaker?: string;
};

/**
 * Bulk-fetch World Cup money lines from The Odds API and write the
 * matched ones into the matches table.
 *
 * Guarded by the THE_ODDS_API_KEY env var — the admin button that
 * triggers this is hidden unless the var is set on the server, and the
 * action itself returns a friendly error if the var is missing (so an
 * accidental call from a stale UI doesn't 500).
 *
 * Auth: pool admin only. Auditable (one entry summarising the run).
 */
export async function fetchMatchLinesAction(
  _prev: FetchLinesActionResult,
  formData: FormData
): Promise<FetchLinesActionResult> {
  const parsed = fetchLinesSchema.safeParse({
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { poolSlug, poolId } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error:
        "The Odds API key is not configured on the server. Ask an operator to set THE_ODDS_API_KEY in .env.",
    };
  }

  // Need the pool to know whether it's a demo pool (separate matches/teams
  // scope) or a real pool (global tournament data).
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();
  if (!pool) {
    return { success: false, error: "Pool not found." };
  }
  const typedPool = pool as Pool;

  // Match this pool's view of the tournament: demo pools read from their
  // pool_id-scoped rows; real pools read from the global rows
  // (pool_id IS NULL). Same pattern as the rest of the app.
  const tournamentPoolFilter = typedPool.is_demo ? typedPool.id : null;

  const [teamsRes, matchesRes] = await Promise.all([
    tournamentPoolFilter
      ? supabaseAdmin
          .from("teams")
          .select("*")
          .eq("pool_id", tournamentPoolFilter)
      : supabaseAdmin.from("teams").select("*").is("pool_id", null),
    tournamentPoolFilter
      ? supabaseAdmin
          .from("matches")
          .select("id, home_team_id, away_team_id")
          .eq("pool_id", tournamentPoolFilter)
      : supabaseAdmin
          .from("matches")
          .select("id, home_team_id, away_team_id")
          .is("pool_id", null),
  ]);

  const teams = (teamsRes.data ?? []) as Team[];
  const matches = (matchesRes.data ?? []) as Array<{
    id: string;
    home_team_id: string | null;
    away_team_id: string | null;
  }>;

  // Hit the Odds API. Network/auth errors bubble back to the admin as the
  // action error message.
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
    };
  }

  const outcomes = matchOddsEventsToMatches(events, teams, matches);

  // Write the matched events. We loop one update per row rather than
  // bulk-upserting because each row already exists and we want to avoid
  // accidentally overwriting other columns. 50ish updates per fetch run
  // is fine for a free-tier admin tool.
  let matched = 0;
  const unmatchedDetails: string[] = [];
  for (const o of outcomes) {
    if (o.reason !== "matched" || !o.matchId) {
      unmatchedDetails.push(
        `${o.homeTeamName} vs ${o.awayTeamName} (${
          o.reason === "no_team_match" ? "team not in pool" : "ambiguous"
        })`
      );
      continue;
    }
    const { error } = await supabaseAdmin
      .from("matches")
      .update({
        home_money_line: o.homeMoneyLine,
        draw_money_line: o.drawMoneyLine,
        away_money_line: o.awayMoneyLine,
      })
      .eq("id", o.matchId);
    if (error) {
      unmatchedDetails.push(
        `${o.homeTeamName} vs ${o.awayTeamName} (DB write failed: ${error.message})`
      );
      continue;
    }
    matched++;
  }

  await logAdminAction(
    session,
    AuditAction.FETCH_MATCH_LINES,
    AuditEntity.MATCH,
    poolId,
    null,
    {
      events_returned: events.length,
      matched,
      unmatched: outcomes.length - matched,
      bookmaker: events[0]?.bookmaker ?? null,
    } as Record<string, unknown>
  );

  revalidatePath(`/${poolSlug}/admin/matches`);
  revalidatePath(`/${poolSlug}/my-picks`, "layout");

  return {
    success: true,
    message:
      matched === outcomes.length
        ? `Fetched ${matched} match line${matched === 1 ? "" : "s"}.`
        : `Fetched ${matched} of ${outcomes.length} match lines. ${
            outcomes.length - matched
          } unmatched.`,
    matched,
    unmatched: outcomes.length - matched,
    unmatchedDetails,
    bookmaker: events[0]?.bookmaker ?? undefined,
  };
}
