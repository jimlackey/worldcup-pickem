import { supabaseAdmin } from "@/lib/supabase/server";
import { TOURNAMENT_ID } from "@/lib/utils/constants";
import type {
  Team,
  Group,
  Match,
  MatchWithTeams,
  MatchPhase,
  Pool,
} from "@/types/database";

/**
 * Determine the correct pool_id filter for tournament data.
 * Demo pools use their own data; real pools use global (NULL).
 */
function tournamentPoolFilter(pool: Pool): string | null {
  return pool.is_demo ? pool.id : null;
}

/**
 * Fetch all groups for a pool's tournament data.
 */
export async function getGroups(pool: Pool): Promise<Group[]> {
  const poolFilter = tournamentPoolFilter(pool);

  let query = supabaseAdmin
    .from("groups")
    .select("*")
    .eq("tournament_id", TOURNAMENT_ID)
    .order("letter");

  if (poolFilter) {
    query = query.eq("pool_id", poolFilter);
  } else {
    query = query.is("pool_id", null);
  }

  const { data } = await query;
  return (data ?? []) as Group[];
}

/**
 * Fetch all teams for a pool's tournament data.
 */
export async function getTeams(pool: Pool): Promise<Team[]> {
  const poolFilter = tournamentPoolFilter(pool);

  let query = supabaseAdmin
    .from("teams")
    .select("*")
    .eq("tournament_id", TOURNAMENT_ID)
    .order("name");

  if (poolFilter) {
    query = query.eq("pool_id", poolFilter);
  } else {
    query = query.is("pool_id", null);
  }

  const { data } = await query;
  return (data ?? []) as Team[];
}

/**
 * Fetch all matches with joined team + group data.
 * Optionally filter by phase.
 */
export async function getMatches(
  pool: Pool,
  phase?: MatchPhase
): Promise<MatchWithTeams[]> {
  const poolFilter = tournamentPoolFilter(pool);

  let query = supabaseAdmin
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
    .order("match_number");

  if (poolFilter) {
    query = query.eq("pool_id", poolFilter);
  } else {
    query = query.is("pool_id", null);
  }

  if (phase) {
    query = query.eq("phase", phase);
  }

  const { data } = await query;
  return (data ?? []) as MatchWithTeams[];
}

/**
 * Fetch a single match with team data.
 */
export async function getMatchById(
  matchId: string
): Promise<MatchWithTeams | null> {
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
    .eq("id", matchId)
    .single();

  return data as MatchWithTeams | null;
}

/**
 * Fetch teams by group for display.
 */
export async function getTeamsByGroup(
  pool: Pool
): Promise<Map<string, Team[]>> {
  const teams = await getTeams(pool);
  const map = new Map<string, Team[]>();

  for (const team of teams) {
    if (!team.group_id) continue;
    const existing = map.get(team.group_id) ?? [];
    existing.push(team);
    map.set(team.group_id, existing);
  }

  return map;
}

/**
 * Get scoring config for a pool.
 */
export async function getScoringConfig(
  poolId: string
): Promise<Record<MatchPhase, number>> {
  const { data } = await supabaseAdmin
    .from("scoring_config")
    .select("phase, points")
    .eq("pool_id", poolId);

  const config: Record<string, number> = {};
  for (const row of data ?? []) {
    config[row.phase] = row.points;
  }

  return config as Record<MatchPhase, number>;
}
