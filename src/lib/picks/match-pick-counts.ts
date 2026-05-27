import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Per-match pick distribution aggregator for the /matches page (added
 * on top of the original public match browser).
 *
 * The /matches view shows every match in the tournament. Beneath each
 * row, when the relevant phase has locked, it surfaces the count and
 * percentage of pick sets that picked each outcome — useful for
 * "consensus" reads ("87% picked Brazil") and for spotting upsets
 * post-hoc ("only 12% picked Morocco, who won").
 *
 * The two phases store picks differently:
 *
 *   - group_picks(match_id, pick: 'home' | 'draw' | 'away')
 *   - knockout_picks(match_id, picked_team_id)
 *
 * This module returns a normalised shape — `{ home, draw, away }`
 * counts per match — so the rendering layer can treat both
 * uniformly. For knockout matches, `draw` is always 0 (no draws in
 * knockout); the home/away split is computed by comparing
 * picked_team_id against the match's home/away team ids.
 *
 * PRIVACY
 * -------
 * This helper does not enforce the privacy gate itself. The CALLER
 * (the page) is responsible for only invoking this when picks for
 * the relevant phase have locked. Calling pre-lock would expose
 * which outcomes other players chose — the same leak the existing
 * /match/{matchId} drilldown explicitly guards against. Both gates
 * live at the page layer for consistency.
 *
 * SCALE
 * -----
 * With 200 players × ~250 pick sets × 72 group matches a full count
 * is ~18,000 group_picks rows. We use the pagination pattern from
 * countPicksByPickSet to step past Supabase's default 1000-row cap.
 * Knockout is bounded at 250 × 31 = ~7,750 rows.
 *
 * The query is pool-scoped via a join through pick_sets so the
 * counts only reflect this pool's players (a global match row can
 * be shared across pools, but pick_sets are pool-scoped).
 */

const PAGE_SIZE = 1000;
const MAX_ROWS = 1_000_000;

export interface MatchPickDistribution {
  /** Number of pick sets that picked the home team. */
  home: number;
  /** Number of pick sets that picked a draw. Knockout: always 0. */
  draw: number;
  /** Number of pick sets that picked the away team. */
  away: number;
  /** home + draw + away. Useful denominator when rendering %s. */
  total: number;
}

/**
 * Aggregate group-phase picks for a pool, returning a map
 * match_id → { home, draw, away, total }.
 *
 * Only active pick sets are counted (pick_sets.is_active = true) so
 * deactivated entries don't inflate the totals. A pool with no
 * active pick sets returns an empty map.
 */
export async function getGroupPickDistribution(
  poolId: string
): Promise<Map<string, MatchPickDistribution>> {
  const out = new Map<string, MatchPickDistribution>();

  // Page through group_picks joined with the pick_sets pool filter.
  // We rely on the PostgREST inner-join syntax (`!inner`) to push the
  // pool_id filter into the SQL rather than fetching everyone's picks
  // and filtering client-side.
  let from = 0;
  while (from < MAX_ROWS) {
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabaseAdmin
      .from("group_picks")
      .select("match_id, pick, pick_set:pick_sets!inner(pool_id, is_active)")
      .eq("pick_set.pool_id", poolId)
      .eq("pick_set.is_active", true)
      .range(from, to);

    const rows = (data ?? []) as Array<{
      match_id: string;
      pick: "home" | "draw" | "away";
    }>;
    for (const row of rows) {
      const bucket = out.get(row.match_id) ?? {
        home: 0,
        draw: 0,
        away: 0,
        total: 0,
      };
      bucket[row.pick] += 1;
      bucket.total += 1;
      out.set(row.match_id, bucket);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return out;
}

/**
 * Aggregate knockout-phase picks for a pool. Same shape as the group
 * helper, but `draw` is always 0 (knockout matches don't allow draws).
 *
 * To split picks into home/away, we need each match's home/away team
 * ids. The caller passes those in via `matchTeams` rather than us
 * re-fetching matches — the /matches page already has the full
 * MatchWithTeams list in memory.
 *
 * Picked teams that match neither the home nor away id (e.g. stale
 * picks against an old bracket wiring) are silently dropped — they'd
 * be uninterpretable in the home/away column shape anyway.
 */
export async function getKnockoutPickDistribution(
  poolId: string,
  matchTeams: Map<string, { home_team_id: string | null; away_team_id: string | null }>
): Promise<Map<string, MatchPickDistribution>> {
  const out = new Map<string, MatchPickDistribution>();

  let from = 0;
  while (from < MAX_ROWS) {
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabaseAdmin
      .from("knockout_picks")
      .select(
        "match_id, picked_team_id, pick_set:pick_sets!inner(pool_id, is_active)"
      )
      .eq("pick_set.pool_id", poolId)
      .eq("pick_set.is_active", true)
      .range(from, to);

    const rows = (data ?? []) as Array<{
      match_id: string;
      picked_team_id: string;
    }>;

    for (const row of rows) {
      const teams = matchTeams.get(row.match_id);
      if (!teams) continue;
      const isHome = row.picked_team_id === teams.home_team_id;
      const isAway = row.picked_team_id === teams.away_team_id;
      if (!isHome && !isAway) continue; // stale pick against an old wiring

      const bucket = out.get(row.match_id) ?? {
        home: 0,
        draw: 0,
        away: 0,
        total: 0,
      };
      if (isHome) bucket.home += 1;
      else bucket.away += 1;
      bucket.total += 1;
      out.set(row.match_id, bucket);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return out;
}
