import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatches } from "@/lib/tournament/queries";
import type { MatchPhase, Pool } from "@/types/database";
import type {
  GroupPickInfo,
  KnockoutPickInfo,
  MatchInfo,
  PickSetInfo,
} from "./scoring-engine";

export interface WhatIfData {
  matches: MatchInfo[];
  pickSets: PickSetInfo[];
  groupPicks: GroupPickInfo[];
  knockoutPicks: KnockoutPickInfo[];
  scoring: Record<MatchPhase, number>;
}

/**
 * Supabase / PostgREST defaults to a max of 1000 rows per response. For a pool
 * with 250 pick sets × 72 group picks = 18,000 rows, a plain `.in()` query
 * silently truncates to the first 1000 rows — which in turn causes most pick
 * sets to appear to have zero picks in the client-side scoring engine.
 *
 * This helper pages through the full result set using `.range(start, end)`.
 */
const PAGE_SIZE = 1000;

async function fetchPaginated<Row>(
  build: (from: number, to: number) => Promise<{ data: Row[] | null }>
): Promise<Row[]> {
  const all: Row[] = [];
  let from = 0;
  // Safety cap so a malformed query can't loop forever. 1,000,000 rows is
  // orders of magnitude more than this app would ever produce.
  const MAX_ROWS = 1_000_000;
  while (from < MAX_ROWS) {
    const to = from + PAGE_SIZE - 1;
    const { data } = await build(from, to);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
  }
  return all;
}

/**
 * Load all data the What-If engine needs for a pool. One page load, one payload.
 *
 * Matches are returned in the shape the engine expects (with actual_result /
 * actual_status preserved separately from home/away_team_id).
 */
export async function getWhatIfData(pool: Pool): Promise<WhatIfData> {
  // Load matches with full relations (we reuse MatchWithTeams and then strip).
  const matchesWithTeams = await getMatches(pool);

  const matches: MatchInfo[] = matchesWithTeams.map((m) => ({
    id: m.id,
    phase: m.phase,
    match_number: m.match_number,
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    actual_result: m.result,
    actual_status: m.status,
  }));

  // Pick sets + participant details
  const { data: pickSetRows } = await supabaseAdmin
    .from("pick_sets")
    .select(
      "id, name, participant_id, participant:participants(email, display_name)"
    )
    .eq("pool_id", pool.id)
    .eq("is_active", true);

  const pickSets: PickSetInfo[] = (pickSetRows ?? []).map((ps) => {
    // Supabase PostgREST embed returns nested as object when single FK.
    const participant = (ps as unknown as {
      participant: { email: string; display_name: string | null } | null;
    }).participant;
    return {
      id: ps.id,
      name: ps.name,
      participant_id: ps.participant_id,
      participant_email: participant?.email ?? "",
      display_name: participant?.display_name ?? null,
    };
  });

  // All group + knockout picks for the pool. Paginated — see fetchPaginated
  // comment above for why.
  const pickSetIds = pickSets.map((ps) => ps.id);
  let groupPicks: GroupPickInfo[] = [];
  let knockoutPicks: KnockoutPickInfo[] = [];

  if (pickSetIds.length > 0) {
    groupPicks = await fetchPaginated<GroupPickInfo>((from, to) =>
      supabaseAdmin
        .from("group_picks")
        .select("pick_set_id, match_id, pick")
        .in("pick_set_id", pickSetIds)
        // Explicit order + range so pagination is stable across pages.
        .order("pick_set_id")
        .order("match_id")
        .range(from, to)
    );

    knockoutPicks = await fetchPaginated<KnockoutPickInfo>((from, to) =>
      supabaseAdmin
        .from("knockout_picks")
        .select("pick_set_id, match_id, picked_team_id")
        .in("pick_set_id", pickSetIds)
        .order("pick_set_id")
        .order("match_id")
        .range(from, to)
    );
  }

  // Scoring config
  const { data: scoringRows } = await supabaseAdmin
    .from("scoring_config")
    .select("phase, points")
    .eq("pool_id", pool.id);

  const scoring: Record<string, number> = {
    group: 1,
    r32: 2,
    r16: 3,
    qf: 5,
    sf: 8,
    final: 13,
  };
  for (const row of scoringRows ?? []) {
    scoring[row.phase] = row.points;
  }

  return {
    matches,
    pickSets,
    groupPicks,
    knockoutPicks,
    scoring: scoring as Record<MatchPhase, number>,
  };
}
