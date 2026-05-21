/**
 * Global tournament queries — counterpart to lib/tournament/queries.ts which
 * takes a Pool and decides between global vs pool-scoped data based on
 * pool.is_demo. The super-admin tournament management surface always works
 * on the canonical global rows, so we don't need (or want) a Pool here.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { TOURNAMENT_ID } from "@/lib/utils/constants";
import type { Team, Group, MatchWithTeams } from "@/types/database";

export async function getGlobalGroups(): Promise<Group[]> {
  const { data } = await supabaseAdmin
    .from("groups")
    .select("*")
    .eq("tournament_id", TOURNAMENT_ID)
    .is("pool_id", null)
    .order("letter");
  return (data ?? []) as Group[];
}

export async function getGlobalTeams(): Promise<Team[]> {
  const { data } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("tournament_id", TOURNAMENT_ID)
    .is("pool_id", null)
    .order("name");
  return (data ?? []) as Team[];
}

export async function getGlobalMatches(): Promise<MatchWithTeams[]> {
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
  return (data ?? []) as MatchWithTeams[];
}
