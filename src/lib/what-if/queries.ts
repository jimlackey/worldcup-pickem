import { supabaseAdmin } from "@/lib/supabase/server";
import { TOURNAMENT_ID } from "@/lib/utils/constants";
import type { MatchPhase, MatchResult, Pool } from "@/types/database";
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

const PAGE_SIZE = 1000;

// The Supabase query builder is a thenable that resolves to { data, error }.
// We only care about the data field here; the caller is responsible for
// narrowing the row type via a cast since our generic `Row` is decoupled
// from the builder's internal generics.
async function fetchPaginated<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown }>
): Promise<Row[]> {
  const all: Row[] = [];
  let from = 0;
  const MAX_ROWS = 1_000_000;
  while (from < MAX_ROWS) {
    const to = from + PAGE_SIZE - 1;
    const { data } = await build(from, to);
    const rows = (data as Row[] | null) ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

// Narrow shape returned by the lean matches query below. Mirrors MatchInfo
// field-for-field, but with the DB column names (`status`, `result`) rather
// than the scoring-engine's renamed ones — we project to MatchInfo at the
// callsite.
interface MatchRow {
  id: string;
  phase: MatchPhase;
  match_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  result: MatchResult | null;
  status: "scheduled" | "in_progress" | "completed";
}

/**
 * Lean match fetch for the scoring engine.
 *
 * The general-purpose getMatches() in lib/tournament/queries selects
 *   *, home_team(*), away_team(*), group(*)
 * which is ~100KB of joined data for 103 matches that the What-If scoring
 * engine throws away immediately (it only needs 7 scalar columns). The
 * joined payload is used by the pickers — but those get their team/group
 * data via getTeams() / getGroups() on the page, not via this function.
 *
 * So we do a direct, no-join query here. Removes a chunk of DB work (two
 * server-side lookups per match) and a lot of serialization overhead.
 */
async function getMatchesForScoring(pool: Pool): Promise<MatchInfo[]> {
  const poolFilter = pool.is_demo ? pool.id : null;

  let query = supabaseAdmin
    .from("matches")
    .select(
      "id, phase, match_number, home_team_id, away_team_id, result, status"
    )
    .eq("tournament_id", TOURNAMENT_ID)
    .order("match_number");

  if (poolFilter) {
    query = query.eq("pool_id", poolFilter);
  } else {
    query = query.is("pool_id", null);
  }

  const { data } = await query;
  const rows = (data ?? []) as MatchRow[];
  return rows.map((m) => ({
    id: m.id,
    phase: m.phase,
    match_number: m.match_number,
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    actual_result: m.result,
    actual_status: m.status,
  }));
}

// Row shape as it comes back from the pick_sets join query. The Supabase
// client types the nested `participant:` relation loosely, so we re-declare
// the narrowing here rather than casting through `any` at each site.
interface PickSetRow {
  id: string;
  name: string;
  participant_id: string;
  participant: { email: string; display_name: string | null } | null;
}

async function getPickSets(poolId: string): Promise<PickSetInfo[]> {
  // Paginated because very large pools can have >1000 active pick sets and
  // the supabase-js default range caps at 1000. Uses the same fetchPaginated
  // helper as the picks queries for consistency.
  const rows = await fetchPaginated<PickSetRow>((from, to) =>
    supabaseAdmin
      .from("pick_sets")
      .select(
        "id, name, participant_id, participant:participants(email, display_name)"
      )
      .eq("pool_id", poolId)
      .eq("is_active", true)
      .order("id")
      .range(from, to)
  );

  return rows.map((ps) => ({
    id: ps.id,
    name: ps.name,
    participant_id: ps.participant_id,
    participant_email: ps.participant?.email ?? "",
    display_name: ps.participant?.display_name ?? null,
  }));
}

async function getScoring(
  poolId: string
): Promise<Record<MatchPhase, number>> {
  const { data: scoringRows } = await supabaseAdmin
    .from("scoring_config")
    .select("phase, points")
    .eq("pool_id", poolId);

  const scoring: Record<string, number> = {
    group: 1, r32: 2, r16: 3, qf: 5, sf: 8, final: 13,
  };
  for (const row of (scoringRows ?? []) as Array<{
    phase: string;
    points: number;
  }>) {
    scoring[row.phase] = row.points;
  }
  return scoring as Record<MatchPhase, number>;
}

export async function getWhatIfData(pool: Pool): Promise<WhatIfData> {
  // Fire the three independent queries concurrently. Previously these ran
  // serially: matches → pick_sets → (picks in parallel) → scoring. With the
  // parallel kickoff, matches/pick_sets/scoring all go out at once and the
  // picks round-trip is the only thing that has to wait (because it depends
  // on pick set IDs).
  const [matches, pickSets, scoring] = await Promise.all([
    getMatchesForScoring(pool),
    getPickSets(pool.id),
    getScoring(pool.id),
  ]);

  const pickSetIds = pickSets.map((ps) => ps.id);
  let groupPicks: GroupPickInfo[] = [];
  let knockoutPicks: KnockoutPickInfo[] = [];

  if (pickSetIds.length > 0) {
    // group_picks and knockout_picks are independent — fire them in parallel.
    [groupPicks, knockoutPicks] = await Promise.all([
      fetchPaginated<GroupPickInfo>((from, to) =>
        supabaseAdmin
          .from("group_picks")
          .select("pick_set_id, match_id, pick")
          .in("pick_set_id", pickSetIds)
          .order("pick_set_id")
          .order("match_id")
          .range(from, to)
      ),
      fetchPaginated<KnockoutPickInfo>((from, to) =>
        supabaseAdmin
          .from("knockout_picks")
          .select("pick_set_id, match_id, picked_team_id")
          .in("pick_set_id", pickSetIds)
          .order("pick_set_id")
          .order("match_id")
          .range(from, to)
      ),
    ]);
  }

  return {
    matches,
    pickSets,
    groupPicks,
    knockoutPicks,
    scoring,
  };
}
