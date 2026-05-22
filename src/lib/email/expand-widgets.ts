import type { StandingsRow } from "@/types/database";
import {
  buildStandingsSummary,
  type SummaryPickSet,
} from "./standings-summary";
import {
  buildMissingGroupPicks,
  buildMissingKnockoutPicks,
  type MissingPicksMatch,
  type MissingPicksPickSet,
  type MissingPicksTeam,
} from "./missing-picks";

// ---------------------------------------------------------------------------
// Per-participant widget expansion pipeline.
//
// One function, three string outputs — the same three widgets the body
// templating layer substitutes. Both the preview pane (server-rendered on
// the email composer page) and the real send loop (in the broadcast
// action) flow through here so what the admin previews is exactly what
// recipients get.
//
// This module is pure: callers gather the pool-wide inputs once and then
// invoke expandWidgetsForParticipant() per participant. Per-call cost is
// just bucketing the participant's pick sets out of pre-built maps plus
// running the three widget builders, which are themselves linear in the
// number of pick sets / matches.
// ---------------------------------------------------------------------------

export interface ExpandWidgetsContext {
  /** Pool-wide ranked standings. */
  standings: StandingsRow[];
  /** Active group-phase matches for this pool. */
  groupMatches: MissingPicksMatch[];
  /**
   * Active knockout matches for this pool, ALREADY filtered by
   * pool.consolation_match_enabled. Callers should run their match list
   * through filterMatchesForPool() before passing it in.
   */
  knockoutMatches: MissingPicksMatch[];
  /** team_id → team name lookup for both widget builders. */
  teamsById: Map<string, MissingPicksTeam>;
  /**
   * Pool-wide flag: true when at least one knockout pick anywhere has
   * been graded. Drives the "Not yet started" branch of the standings
   * widget's Knockout Phase line.
   */
  knockoutPhaseStarted: boolean;
  /**
   * Pick sets the participant owns, in display order. Already filtered
   * to active rows; the helper does not re-filter from a pool-wide list.
   *
   * Each pick set carries its own picked-match-ids sets and per-phase
   * correct counts so the builders can render without further DB hits.
   */
  participantPickSets: ParticipantPickSetForExpansion[];
}

export interface ParticipantPickSetForExpansion {
  pick_set_id: string;
  pick_set_name: string;
  group_correct: number;
  knockout_correct: number;
  groupPickedMatchIds: Set<string>;
  knockoutPickedMatchIds: Set<string>;
}

export interface ExpandedWidgets {
  standingsSummary: string;
  missingGroupPicks: string;
  missingKnockoutPicks: string;
}

/**
 * Run the three widget builders for a single participant.
 *
 * Returns all three expansions as strings. Empty strings are returned
 * for participants with zero pick sets — applyBodyTokens() will then
 * leave a blank where the token was. That's deliberate: an email body
 * with a {{standings-summary}} for a player who has no pick sets just
 * has a blank line, not a placeholder explaining the absence.
 */
export function expandWidgetsForParticipant(
  ctx: ExpandWidgetsContext
): ExpandedWidgets {
  // Project the shared shape down to what each builder wants. The two
  // SummaryPickSet / MissingPicksPickSet interfaces have overlapping
  // fields; this projection makes that explicit and means we don't have
  // to thread two parallel lists from the caller.
  const standingsPickSets: SummaryPickSet[] = ctx.participantPickSets.map(
    (ps) => ({
      pick_set_id: ps.pick_set_id,
      pick_set_name: ps.pick_set_name,
      group_correct: ps.group_correct,
      knockout_correct: ps.knockout_correct,
    })
  );
  const widgetPickSets: MissingPicksPickSet[] = ctx.participantPickSets.map(
    (ps) => ({
      pick_set_id: ps.pick_set_id,
      pick_set_name: ps.pick_set_name,
      groupPickedMatchIds: ps.groupPickedMatchIds,
      knockoutPickedMatchIds: ps.knockoutPickedMatchIds,
    })
  );

  const standingsSummary = buildStandingsSummary({
    standings: ctx.standings,
    participantPickSets: standingsPickSets,
    knockoutPhaseStarted: ctx.knockoutPhaseStarted,
  });

  const missingGroupPicks = buildMissingGroupPicks({
    groupMatches: ctx.groupMatches,
    teamsById: ctx.teamsById,
    participantPickSets: widgetPickSets,
  });

  const missingKnockoutPicks = buildMissingKnockoutPicks({
    knockoutMatches: ctx.knockoutMatches,
    teamsById: ctx.teamsById,
    participantPickSets: widgetPickSets,
  });

  return { standingsSummary, missingGroupPicks, missingKnockoutPicks };
}
