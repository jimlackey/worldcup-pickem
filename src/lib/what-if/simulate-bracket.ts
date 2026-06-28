import { BRACKET_FEEDERS } from "@/lib/picks/bracket-wiring";
import type { Team } from "@/types/database";
import type { MatchInfo, WhatIfOverrides } from "./scoring-engine";

/**
 * Knockout-phase analogue of the group-phase "Fill from pick set" simulate.
 *
 * Given a chosen pick set's knockout picks, walk the bracket from the
 * earliest round (R32) forward and fill in a hypothetical winner for every
 * UNDECIDED knockout match, producing a `knockoutWinners` override map the
 * scoring engine + bracket picker already understand.
 *
 * Resolution per undecided match, in priority order:
 *
 *   1. The pick set's picked winner for that match — but ONLY if that team
 *      is actually present in the match's resolved slot (i.e. the team is
 *      still alive: it really won, or our own simulation advanced it). A
 *      pick for a team that has since been knocked out can't be honored.
 *
 *   2. Otherwise, fall back to the BEST FIFA-ranked of the two teams now
 *      occupying the slot (lower fifa_ranking number = better). A team with
 *      a recorded ranking always beats a team with none; ties / both-null
 *      fall back to the home side.
 *
 * Walking in feeder order matters: a later match's slots depend on which
 * teams the earlier rounds advanced, so each round must be resolved before
 * the round it feeds. We seed slot occupancy from real completed results
 * and from any existing what-if overrides already on the board, then layer
 * the simulation on top — so a player can hand-pick a few upsets and then
 * "fill the rest from a pick set".
 */

// Knockout match numbers in strict feeder order (earliest round first). A
// match must appear AFTER both of its feeders so slot occupancy is known by
// the time we resolve it. The Final (#103) is fed by the two SFs and so
// comes last. The consolation match (#104) is intentionally excluded — it
// is fed by feeder LOSERS, not winners, and is gated/optional per pool; the
// what-if bracket picker doesn't expose it either.
const KNOCKOUT_ORDER: number[] = [
  // R32
  73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
  // R16
  89, 90, 91, 92, 93, 94, 95, 96,
  // QF
  97, 98, 99, 100,
  // SF
  101, 102,
  // Final
  103,
];

/**
 * Pick the better FIFA-ranked of two teams. Lower fifa_ranking = better.
 * A team with a recorded ranking always beats one with none. If both lack
 * a ranking (or rankings tie, which shouldn't happen for distinct teams),
 * the home/feederA side wins the tiebreak so the result is deterministic.
 */
function bestByFifaRank(a: Team | null, b: Team | null): Team | null {
  if (!a) return b;
  if (!b) return a;
  const ra = a.fifa_ranking;
  const rb = b.fifa_ranking;
  if (ra == null && rb == null) return a;
  if (ra == null) return b;
  if (rb == null) return a;
  return ra <= rb ? a : b;
}

export interface SimulateBracketArgs {
  matches: MatchInfo[];
  teams: Team[];
  /** The chosen pick set's knockout picks: match_id → picked_team_id. */
  pickedWinnerByMatchId: Map<string, string>;
  /** Existing overrides to build on (manual what-if picks already made). */
  existing: WhatIfOverrides;
}

/**
 * Returns a NEW WhatIfOverrides with `knockoutWinners` filled in for every
 * undecided knockout match, per the resolution rules above. `groupResults`
 * is passed through untouched. Completed matches are never overridden.
 */
export function simulateBracketFromPickSet({
  matches,
  teams,
  pickedWinnerByMatchId,
  existing,
}: SimulateBracketArgs): WhatIfOverrides {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const matchByNumber = new Map<number, MatchInfo>();
  for (const m of matches) {
    if (m.match_number) matchByNumber.set(m.match_number, m);
  }

  // The winner we land on for each match, by match_number. Seeded from real
  // completed results so feeder resolution can see settled rounds; the
  // simulation fills in the rest as it walks forward.
  const resolvedWinnerByNumber = new Map<number, string>();

  // Output winners keyed by match_id (what the scoring engine / picker want).
  // Start from any existing knockout overrides so hand-picked upsets survive.
  const nextWinners: Record<string, string> = { ...existing.knockoutWinners };

  // Seed resolvedWinnerByNumber from real completed results AND from existing
  // overrides, so both feed slot occupancy as we walk.
  for (const m of matches) {
    if (!m.match_number) continue;
    if (m.actual_status === "completed" && m.actual_result) {
      const winnerId =
        m.actual_result === "home" ? m.home_team_id : m.away_team_id;
      if (winnerId) resolvedWinnerByNumber.set(m.match_number, winnerId);
    } else if (existing.knockoutWinners[m.id]) {
      resolvedWinnerByNumber.set(m.match_number, existing.knockoutWinners[m.id]);
    }
  }

  // Resolve the two teams occupying a match's slots, using real results /
  // already-resolved winners for feeders. Mirrors getMatchTeams() in the
  // what-if bracket picker but driven off resolvedWinnerByNumber.
  const slotTeams = (matchNumber: number): { home: Team | null; away: Team | null } => {
    const match = matchByNumber.get(matchNumber);
    if (!match) return { home: null, away: null };

    const feeders = BRACKET_FEEDERS[matchNumber];
    if (!feeders) {
      // R32 — teams are admin-assigned directly on the match.
      const home = match.home_team_id ? teamMap.get(match.home_team_id) ?? null : null;
      const away = match.away_team_id ? teamMap.get(match.away_team_id) ?? null : null;
      return { home, away };
    }

    const [feederA, feederB] = feeders;
    const resolveSide = (feederNumber: number): Team | null => {
      const wid = resolvedWinnerByNumber.get(feederNumber);
      return wid ? teamMap.get(wid) ?? null : null;
    };
    return { home: resolveSide(feederA), away: resolveSide(feederB) };
  };

  for (const matchNumber of KNOCKOUT_ORDER) {
    const match = matchByNumber.get(matchNumber);
    if (!match) continue;

    // Completed matches keep their real result — already seeded above.
    if (match.actual_status === "completed" && match.actual_result) continue;

    const { home, away } = slotTeams(matchNumber);

    // Slot not fully populated yet (an upstream feeder is still undecided and
    // we have no pick/override for it) — can't simulate this match.
    if (!home && !away) continue;

    // If an existing override already settled this match, honor it and move on
    // (resolvedWinnerByNumber was already seeded from it above).
    if (existing.knockoutWinners[match.id]) continue;

    const slotIds = new Set<string>();
    if (home) slotIds.add(home.id);
    if (away) slotIds.add(away.id);

    const picked = pickedWinnerByMatchId.get(match.id);
    let winnerId: string | null = null;

    if (picked && slotIds.has(picked)) {
      // The pick set's winner is still alive in this slot — honor it.
      winnerId = picked;
    } else {
      // Picked team is gone (or no pick) — fall back to best FIFA rank.
      const best = bestByFifaRank(home, away);
      winnerId = best?.id ?? null;
    }

    if (winnerId) {
      nextWinners[match.id] = winnerId;
      resolvedWinnerByNumber.set(matchNumber, winnerId);
    }
  }

  return { groupResults: existing.groupResults, knockoutWinners: nextWinners };
}
