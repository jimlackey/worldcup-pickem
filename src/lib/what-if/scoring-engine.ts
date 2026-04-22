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
 * Compute per-pick-set points given a set of effective results.
 *
 * effectiveResults supplies:
 *   - For group matches: the actual result when known, else the override, else null
 *   - For knockout matches: the winning team_id when known, else the override, else null
 */
function scorePickSet(
  pickSetId: string,
  groupPicks: GroupPickInfo[],
  knockoutPicks: KnockoutPickInfo[],
  effectiveGroupResults: Map<string, MatchResult>,
  effectiveKnockoutWinners: Map<string, string>,
  matchPhaseById: Map<string, MatchPhase>,
  scoring: Record<MatchPhase, number>
): { group: number; knockout: number } {
  let group = 0;
  let knockout = 0;

  for (const gp of groupPicks) {
    if (gp.pick_set_id !== pickSetId) continue;
    const result = effectiveGroupResults.get(gp.match_id);
    if (!result) continue;
    if (gp.pick === result) {
      group += scoring.group ?? 0;
    }
  }

  for (const kp of knockoutPicks) {
    if (kp.pick_set_id !== pickSetId) continue;
    const winner = effectiveKnockoutWinners.get(kp.match_id);
    if (!winner) continue;
    if (kp.picked_team_id === winner) {
      const phase = matchPhaseById.get(kp.match_id);
      if (phase && phase !== "group") {
        knockout += scoring[phase] ?? 0;
      }
    }
  }

  return { group, knockout };
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
  for (const m of input.matches) {
    if (m.phase !== "group") continue;
    if (m.actual_status === "completed" && m.actual_result) {
      effectiveGroup.set(m.id, m.actual_result);
    } else if (input.overrides.groupResults[m.id]) {
      effectiveGroup.set(m.id, input.overrides.groupResults[m.id]);
    }
  }

  // Knockout: map<match_id, winner_team_id>
  // Real winner: derived from match.result + home/away_team_id on completed matches.
  const effectiveKnockout = new Map<string, string>();
  for (const m of input.matches) {
    if (m.phase === "group") continue;
    if (m.actual_status === "completed" && m.actual_result) {
      const winnerId =
        m.actual_result === "home" ? m.home_team_id : m.away_team_id;
      if (winnerId) effectiveKnockout.set(m.id, winnerId);
    } else if (input.overrides.knockoutWinners[m.id]) {
      effectiveKnockout.set(m.id, input.overrides.knockoutWinners[m.id]);
    }
  }

  // ---- Also compute "actuals only" (no overrides) for diff rendering ----
  const actualsGroup = new Map<string, MatchResult>();
  const actualsKnockout = new Map<string, string>();
  for (const m of input.matches) {
    if (m.actual_status !== "completed" || !m.actual_result) continue;
    if (m.phase === "group") {
      actualsGroup.set(m.id, m.actual_result);
    } else {
      const winnerId =
        m.actual_result === "home" ? m.home_team_id : m.away_team_id;
      if (winnerId) actualsKnockout.set(m.id, winnerId);
    }
  }

  // ---- Score every pick set twice: with overrides, and actuals-only ----
  const rows: ScoredRow[] = input.pickSets.map((ps) => {
    const withOverrides = scorePickSet(
      ps.id,
      input.groupPicks,
      input.knockoutPicks,
      effectiveGroup,
      effectiveKnockout,
      matchPhaseById,
      input.scoring
    );
    const actualsOnly = scorePickSet(
      ps.id,
      input.groupPicks,
      input.knockoutPicks,
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
