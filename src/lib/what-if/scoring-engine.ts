import type {
  MatchPhase,
  MatchResult,
  PickValue,
  StandingsRow,
} from "@/types/database";

// ---- Input shapes ----

export interface MatchInfo {
  id: string;
  phase: MatchPhase;
  match_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  /** Real result from the database, if the match is completed. */
  actual_result: MatchResult | null;
  actual_status: "scheduled" | "in_progress" | "completed";
}

export interface PickSetInfo {
  id: string;
  name: string;
  participant_id: string;
  participant_email: string;
  display_name: string | null;
}

export interface GroupPickInfo {
  pick_set_id: string;
  match_id: string;
  pick: PickValue;
}

export interface KnockoutPickInfo {
  pick_set_id: string;
  match_id: string;
  picked_team_id: string;
}

/** What-If overrides, keyed by match_id. */
export interface WhatIfOverrides {
  /** Group match hypothetical results (home/draw/away). */
  groupResults: Record<string, MatchResult>;
  /**
   * Knockout match hypothetical winners — team_id.
   * This is the _winner_ of the match, not which slot they were in.
   */
  knockoutWinners: Record<string, string>;
}

export interface ScoringEngineInput {
  matches: MatchInfo[];
  pickSets: PickSetInfo[];
  groupPicks: GroupPickInfo[];
  knockoutPicks: KnockoutPickInfo[];
  scoring: Record<MatchPhase, number>;
  overrides: WhatIfOverrides;
}

// ---- Output ----

export interface ScoredRow extends StandingsRow {
  /** Rank under real results only (for diff rendering). */
  actual_rank: number;
  /** Total points under real results only. */
  actual_total_points: number;
  /**
   * Rank change: positive = moved up (better), negative = moved down.
   * Null if no change or no actual rank available.
   */
  rank_delta: number | null;
}

// ============================================================================
// Core scoring
// ============================================================================

/**
 * Bucket a flat array of picks by pick_set_id. Previously the scoring loop
 * walked the full array and filtered by id per pick set, which is O(N * M)
 * for N pick sets and M total picks — catastrophic once N*M reaches the
 * tens of millions (easy on a medium pool). Bucketing once is O(M), after
 * which each pick set's scan is only over its own picks.
 */
function bucketByPickSet<P extends { pick_set_id: string }>(
  picks: P[]
): Map<string, P[]> {
  const map = new Map<string, P[]>();
  for (const p of picks) {
    const existing = map.get(p.pick_set_id);
    if (existing) {
      existing.push(p);
    } else {
      map.set(p.pick_set_id, [p]);
    }
  }
  return map;
}

/**
 * Score one pick set against both result worlds (actuals-only and
 * with-overrides) in a single walk over its picks.
 *
 * Merging the two passes means each pick is read once, the match-phase
 * lookup happens once, and we still end up with both totals. For the
 * common case where the overrides map is empty, the two totals come out
 * identical — no wasted work.
 */
function scorePickSetBothWays(
  groupPicks: GroupPickInfo[] | undefined,
  knockoutPicks: KnockoutPickInfo[] | undefined,
  effectiveGroup: Map<string, MatchResult>,
  effectiveKnockout: Map<string, string>,
  actualsGroup: Map<string, MatchResult>,
  actualsKnockout: Map<string, string>,
  matchPhaseById: Map<string, MatchPhase>,
  scoring: Record<MatchPhase, number>
): {
  withOverrides: { group: number; knockout: number };
  actualsOnly: { group: number; knockout: number };
} {
  let woGroup = 0;
  let woKnockout = 0;
  let aoGroup = 0;
  let aoKnockout = 0;

  const groupPointValue = scoring.group ?? 0;

  if (groupPicks) {
    for (const gp of groupPicks) {
      // With-overrides world
      const effResult = effectiveGroup.get(gp.match_id);
      if (effResult && gp.pick === effResult) {
        woGroup += groupPointValue;
      }
      // Actuals-only world
      const actResult = actualsGroup.get(gp.match_id);
      if (actResult && gp.pick === actResult) {
        aoGroup += groupPointValue;
      }
    }
  }

  if (knockoutPicks) {
    for (const kp of knockoutPicks) {
      const phase = matchPhaseById.get(kp.match_id);
      // Knockout picks on non-knockout phases shouldn't exist, but guard anyway.
      if (!phase || phase === "group") continue;
      const phasePoints = scoring[phase] ?? 0;

      const effWinner = effectiveKnockout.get(kp.match_id);
      if (effWinner && kp.picked_team_id === effWinner) {
        woKnockout += phasePoints;
      }
      const actWinner = actualsKnockout.get(kp.match_id);
      if (actWinner && kp.picked_team_id === actWinner) {
        aoKnockout += phasePoints;
      }
    }
  }

  return {
    withOverrides: { group: woGroup, knockout: woKnockout },
    actualsOnly: { group: aoGroup, knockout: aoKnockout },
  };
}

/**
 * Given the full input (including overrides), produce scored+ranked rows
 * alongside the actual-results rank so callers can show a diff.
 */
export function computeStandingsWithOverrides(
  input: ScoringEngineInput
): ScoredRow[] {
  // Build helper maps once.
  const matchPhaseById = new Map<string, MatchPhase>();
  for (const m of input.matches) {
    matchPhaseById.set(m.id, m.phase);
  }

  // ---- Effective results with overrides applied ----

  // Group: map<match_id, result>
  const effectiveGroup = new Map<string, MatchResult>();
  // Knockout: map<match_id, winner_team_id>
  // Real winner: derived from match.result + home/away_team_id on completed matches.
  const effectiveKnockout = new Map<string, string>();
  // "actuals only" (no overrides) for diff rendering
  const actualsGroup = new Map<string, MatchResult>();
  const actualsKnockout = new Map<string, string>();

  // Single pass over matches populates all four maps — each of the originals
  // walked the matches array independently.
  for (const m of input.matches) {
    const isCompleted = m.actual_status === "completed" && !!m.actual_result;
    if (m.phase === "group") {
      if (isCompleted) {
        effectiveGroup.set(m.id, m.actual_result as MatchResult);
        actualsGroup.set(m.id, m.actual_result as MatchResult);
      } else if (input.overrides.groupResults[m.id]) {
        effectiveGroup.set(m.id, input.overrides.groupResults[m.id]);
      }
    } else {
      if (isCompleted) {
        const winnerId =
          m.actual_result === "home" ? m.home_team_id : m.away_team_id;
        if (winnerId) {
          effectiveKnockout.set(m.id, winnerId);
          actualsKnockout.set(m.id, winnerId);
        }
      } else if (input.overrides.knockoutWinners[m.id]) {
        effectiveKnockout.set(m.id, input.overrides.knockoutWinners[m.id]);
      }
    }
  }

  // Bucket picks by pick_set_id so each pick set's scoring walk only touches
  // its own picks, not every pick in the pool. This is the big perf win on
  // medium-to-large pools.
  const groupPicksBy = bucketByPickSet(input.groupPicks);
  const knockoutPicksBy = bucketByPickSet(input.knockoutPicks);

  // ---- Score every pick set: fused two-world walk ----
  const rows: ScoredRow[] = input.pickSets.map((ps) => {
    const { withOverrides, actualsOnly } = scorePickSetBothWays(
      groupPicksBy.get(ps.id),
      knockoutPicksBy.get(ps.id),
      effectiveGroup,
      effectiveKnockout,
      actualsGroup,
      actualsKnockout,
      matchPhaseById,
      input.scoring
    );

    return {
      pick_set_id: ps.id,
      pick_set_name: ps.name,
      participant_id: ps.participant_id,
      participant_email: ps.participant_email,
      display_name: ps.display_name,
      group_points: withOverrides.group,
      knockout_points: withOverrides.knockout,
      total_points: withOverrides.group + withOverrides.knockout,
      actual_total_points: actualsOnly.group + actualsOnly.knockout,
      // Ranks populated below
      rank: undefined,
      actual_rank: 0,
      rank_delta: null,
    };
  });

  // ---- Rank with overrides ----
  rows.sort(
    (a, b) =>
      b.total_points - a.total_points ||
      b.group_points - a.group_points ||
      a.pick_set_name.localeCompare(b.pick_set_name)
  );
  {
    let currentRank = 1;
    for (let i = 0; i < rows.length; i++) {
      if (i > 0 && rows[i].total_points < rows[i - 1].total_points) {
        currentRank = i + 1;
      }
      rows[i].rank = currentRank;
    }
  }

  // ---- Rank actuals-only (on a copy, sorted independently) ----
  const actualOrder = [...rows].sort(
    (a, b) =>
      b.actual_total_points - a.actual_total_points ||
      a.pick_set_name.localeCompare(b.pick_set_name)
  );
  const actualRankByPickSet = new Map<string, number>();
  {
    let currentRank = 1;
    for (let i = 0; i < actualOrder.length; i++) {
      if (
        i > 0 &&
        actualOrder[i].actual_total_points < actualOrder[i - 1].actual_total_points
      ) {
        currentRank = i + 1;
      }
      actualRankByPickSet.set(actualOrder[i].pick_set_id, currentRank);
    }
  }

  for (const row of rows) {
    const actualRank = actualRankByPickSet.get(row.pick_set_id) ?? 0;
    row.actual_rank = actualRank;
    if (row.rank && actualRank) {
      // Positive delta = moved UP (e.g. from rank 5 → rank 2 = +3)
      const delta = actualRank - row.rank;
      row.rank_delta = delta === 0 ? null : delta;
    }
  }

  return rows;
}
