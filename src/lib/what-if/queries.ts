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

export async function getWhatIfData(pool: Pool): Promise<WhatIfData> {
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

  const { data: pickSetRows } = await supabaseAdmin
    .from("pick_sets")
    .select(
      "id, name, participant_id, participant:participants(email, display_name)"
    )
    .eq("pool_id", pool.id)
    .eq("is_active", true);

  const pickSets: PickSetInfo[] = (pickSetRows ?? []).map((ps: any) => {
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

  const pickSetIds = pickSets.map((ps) => ps.id);
  let groupPicks: GroupPickInfo[] = [];
  let knockoutPicks: KnockoutPickInfo[] = [];

  if (pickSetIds.length > 0) {
    groupPicks = await fetchPaginated<GroupPickInfo>((from, to) =>
      supabaseAdmin
        .from("group_picks")
        .select("pick_set_id, match_id, pick")
        .in("pick_set_id", pickSetIds)
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

  const { data: scoringRows } = await supabaseAdmin
    .from("scoring_config")
    .select("phase, points")
    .eq("pool_id", pool.id);

  const scoring: Record<string, number> = {
    group: 1, r32: 2, r16: 3, qf: 5, sf: 8, final: 13,
  };
  for (const row of (scoringRows ?? []) as any[]) {
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
