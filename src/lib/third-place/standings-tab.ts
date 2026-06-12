import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatches } from "@/lib/tournament/queries";
import { ALL_R32_MATCH_NUMBERS } from "@/lib/picks/bracket-wiring";
import type { Pool, MatchWithTeams } from "@/types/database";

/**
 * Data + derivation for the Standings page "3rd Place" tab (the
 * side-pick tracker added on top of migration 024).
 *
 * The tab lists ONLY the pick sets that have made the optional
 * pre-tournament 3rd-place pick, and is ordered independently of the
 * overall standings:
 *
 *   1. Teams still alive in the tournament first; eliminated teams sink
 *      to the bottom.
 *   2. Within each of those two buckets, by the picked team's FIFA
 *      ranking ascending (1 = best in the world on top). Teams with no
 *      recorded ranking sort last within their bucket.
 *   3. Pick set name as the final tiebreaker so the order is stable.
 *
 * Privacy: this tab is only surfaced once the group phase has locked
 * (the page gates it on `!groupPicksOpen`), so the team identities here
 * are already public. The caller is responsible for that gate; this
 * helper just reads the data.
 */

export interface ThirdPlaceTabRow {
  pickSetId: string;
  /** Pick set label (always shown, mirrors the rest of standings). */
  pickSetName: string;
  /** Optional participant display name, gated by show_player_names. */
  displayName: string | null;
  /** Picked team. */
  teamId: string;
  teamName: string;
  teamCode: string;
  flagCode: string;
  /** FIFA ranking of the picked team; null when none is on file. */
  fifaRanking: number | null;
  /** Whether the picked team is still alive in the tournament. */
  isAlive: boolean;
}

/**
 * Compute the set of team IDs that have been ELIMINATED from the
 * tournament, derived purely from completed match data.
 *
 * A team is eliminated when either:
 *
 *   (a) it was the losing side of any completed knockout match
 *       (phase != "group"), mirroring the eliminatedTeamIds derivation
 *       in pick-set-bracket-view.tsx; or
 *
 *   (b) the group stage is fully complete and the team did not qualify
 *       — i.e. it does not appear in any populated R32 match slot.
 *       Only 8 of the 12 third-placed teams advance, so a 3rd-place
 *       pick that finished its group but missed the cut is eliminated
 *       even though it never lost a knockout match.
 *
 * Before the group stage completes, no team is eliminated (every pick
 * is still alive), so the returned set is empty.
 */
function deriveEliminatedTeamIds(matches: MatchWithTeams[]): Set<string> {
  const eliminated = new Set<string>();

  // (a) Knockout losers from completed matches.
  for (const m of matches) {
    if (m.phase === "group") continue;
    if (m.status !== "completed" || !m.result) continue;
    const loserId = m.result === "home" ? m.away_team_id : m.home_team_id;
    if (loserId) eliminated.add(loserId);
  }

  // (b) Group non-qualifiers, but only once every group match has a
  // completed result. Until then, group standings aren't final and we
  // must not pre-emptively eliminate anyone.
  const groupMatches = matches.filter((m) => m.phase === "group");
  const allGroupsComplete =
    groupMatches.length > 0 &&
    groupMatches.every((m) => m.status === "completed");

  if (allGroupsComplete) {
    // Teams that appear in any populated R32 slot = qualified/alive.
    const r32Numbers = new Set<number>(ALL_R32_MATCH_NUMBERS);
    const qualifiedTeamIds = new Set<string>();
    for (const m of matches) {
      if (m.match_number == null) continue;
      if (!r32Numbers.has(m.match_number)) continue;
      if (m.home_team_id) qualifiedTeamIds.add(m.home_team_id);
      if (m.away_team_id) qualifiedTeamIds.add(m.away_team_id);
    }

    // Any team that played in the group stage but isn't in an R32 slot
    // failed to advance. We enumerate group participants from the group
    // matches themselves so we don't depend on a separate teams fetch.
    for (const m of groupMatches) {
      if (m.home_team_id && !qualifiedTeamIds.has(m.home_team_id)) {
        eliminated.add(m.home_team_id);
      }
      if (m.away_team_id && !qualifiedTeamIds.has(m.away_team_id)) {
        eliminated.add(m.away_team_id);
      }
    }
  }

  return eliminated;
}

/**
 * Fetch and order the rows for the 3rd Place standings tab.
 *
 * Returns only pick sets that have actually made a 3rd-place pick,
 * already sorted in display order (alive-first, then FIFA rank asc).
 */
export async function getThirdPlaceTabRows(
  pool: Pool,
  pickSetIds: string[]
): Promise<ThirdPlaceTabRow[]> {
  if (pickSetIds.length === 0) return [];

  // 1. Third-place picks joined to team data + FIFA ranking, plus the
  //    owning pick set's name and participant display name.
  const { data: pickRows } = await supabaseAdmin
    .from("third_place_picks")
    .select(
      `
      pick_set_id,
      picked_team_id,
      team:teams(name, short_code, flag_code, fifa_ranking),
      pick_set:pick_sets(name, participant:participants(display_name))
    `
    )
    .in("pick_set_id", pickSetIds);

  const rawRows = (pickRows ?? []) as Array<{
    pick_set_id: string;
    picked_team_id: string;
    team:
      | {
          name: string;
          short_code: string;
          flag_code: string;
          fifa_ranking: number | null;
        }
      | {
          name: string;
          short_code: string;
          flag_code: string;
          fifa_ranking: number | null;
        }[]
      | null;
    pick_set:
      | {
          name: string;
          participant:
            | { display_name: string | null }
            | { display_name: string | null }[]
            | null;
        }
      | {
          name: string;
          participant:
            | { display_name: string | null }
            | { display_name: string | null }[]
            | null;
        }[]
      | null;
  }>;

  if (rawRows.length === 0) return [];

  // 2. Derive elimination from match data once for the whole pool.
  const matches = await getMatches(pool);
  const eliminatedTeamIds = deriveEliminatedTeamIds(matches);

  // 3. Normalise the (possibly array-wrapped) nested relations — same
  //    defensive unwrap pattern used across the codebase for to-one FKs.
  const rows: ThirdPlaceTabRow[] = [];
  for (const r of rawRows) {
    const team = Array.isArray(r.team) ? r.team[0] : r.team;
    if (!team) continue;

    const pickSet = Array.isArray(r.pick_set) ? r.pick_set[0] : r.pick_set;
    const participant = pickSet
      ? Array.isArray(pickSet.participant)
        ? pickSet.participant[0]
        : pickSet.participant
      : null;

    rows.push({
      pickSetId: r.pick_set_id,
      pickSetName: pickSet?.name ?? "—",
      displayName: participant?.display_name ?? null,
      teamId: r.picked_team_id,
      teamName: team.name,
      teamCode: team.short_code,
      flagCode: team.flag_code,
      fifaRanking: team.fifa_ranking ?? null,
      isAlive: !eliminatedTeamIds.has(r.picked_team_id),
    });
  }

  // 4. Three-tier ordering:
  //      1. Alive teams first; eliminated teams sink to the bottom.
  //      2. Picked team's FIFA rank ascending (1 = best on top); teams
  //         with no recorded ranking sort last within their bucket.
  //      3. When multiple players picked the SAME country, list them
  //         alphabetically by pick set name. We group by team name
  //         before the player tiebreak so that two different teams that
  //         happen to share a rank bucket (e.g. both unranked) don't
  //         interleave their players — same-country picks stay together.
  rows.sort((a, b) => {
    if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;

    const ra = a.fifaRanking;
    const rb = b.fifaRanking;
    if (ra !== rb) {
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    }

    // Same rank bucket — keep identical countries grouped together.
    if (a.teamName !== b.teamName) {
      return a.teamName.localeCompare(b.teamName);
    }

    // Same country — players alphabetically by pick set name.
    return a.pickSetName.localeCompare(b.pickSetName);
  });

  return rows;
}
