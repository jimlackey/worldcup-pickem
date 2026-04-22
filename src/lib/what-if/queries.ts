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

  // All group picks for the pool
  const pickSetIds = pickSets.map((ps) => ps.id);
  let groupPicks: GroupPickInfo[] = [];
  let knockoutPicks: KnockoutPickInfo[] = [];

  if (pickSetIds.length > 0) {
    const { data: gp } = await supabaseAdmin
      .from("group_picks")
      .select("pick_set_id, match_id, pick")
      .in("pick_set_id", pickSetIds);
    groupPicks = (gp ?? []) as GroupPickInfo[];

    const { data: kp } = await supabaseAdmin
      .from("knockout_picks")
      .select("pick_set_id, match_id, picked_team_id")
      .in("pick_set_id", pickSetIds);
    knockoutPicks = (kp ?? []) as KnockoutPickInfo[];
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
