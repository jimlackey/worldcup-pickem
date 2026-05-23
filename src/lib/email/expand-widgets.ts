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
import {
  buildGroupPhasePicks,
  buildKnockoutRoundPicks,
  type PickSummaryMatch,
  type PickSummaryPickSet,
  type PickSummaryTeam,
} from "./pick-summaries";

// ---------------------------------------------------------------------------
// Per-participant widget expansion pipeline.
//
// One function, five string outputs — the same widgets the body
// templating layer substitutes. Both the preview pane (server-rendered on
// the email composer page) and the real send loop (in the broadcast
// action) flow through here so what the admin previews is exactly what
// recipients get.
//
// Widget surface today (token → output type):
//
//   {{standings-summary}}       HTML  (label/value table, NOT escaped)
//   {{missing-group-picks}}     HTML  (bulleted list, NOT escaped)
//   {{missing-knockout-picks}}  HTML  (bulleted list, NOT escaped)
//   {{group-phase-picks}}       HTML  (full pick table, NOT escaped)
//   {{knockout-round-picks}}    HTML  (round-by-round tables, NOT escaped)
//
// All five widgets are HTML-trusted: the substitution layer splices
// their output into the email body AFTER the admin's freeform text has
// been HTML-escaped, and does NOT escape the widget output itself.
// Anything participant-supplied inside a widget (team names, pick set
// names) is escaped locally inside the builders before it lands in the
// output string. See render-email-body.ts for the full pipeline.
//
// This module is pure: callers gather the pool-wide inputs once and
// then invoke expandWidgetsForParticipant() per participant. Per-call
// cost is just bucketing the participant's pick sets out of pre-built
// maps plus running the widget builders, which are themselves linear in
// the number of pick sets / matches.
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
  /** team_id → team name lookup. */
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
   */
  participantPickSets: ParticipantPickSetForExpansion[];
}

export interface ParticipantPickSetForExpansion {
  pick_set_id: string;
  pick_set_name: string;
  group_correct: number;
  knockout_correct: number;
  /**
   * Set of match_ids the participant has picked. Used by the
   * missing-picks widgets — they only need to know whether a pick row
   * exists, not what it is.
   */
  groupPickedMatchIds: Set<string>;
  knockoutPickedMatchIds: Set<string>;
  /**
   * match_id → pick value. Used by the pick-summaries widgets — they
   * need to RENDER the pick, so the value matters. Group can be home,
   * draw, or away; knockout can be home or away only.
   */
  groupPicksByMatchId: Map<string, "home" | "draw" | "away">;
  knockoutPicksByMatchId: Map<string, "home" | "away">;
}

export interface ExpandedWidgets {
  /** HTML — label/value table per pick set. NOT to be escaped. */
  standingsSummary: string;
  /** HTML — bulleted list per pick set. NOT to be escaped. */
  missingGroupPicks: string;
  /** HTML — bulleted list per pick set. NOT to be escaped. */
  missingKnockoutPicks: string;
  /** HTML — full pick table per pick set. NOT to be escaped. */
  groupPhasePicks: string;
  /** HTML — round-by-round tables per pick set. NOT to be escaped. */
  knockoutRoundPicks: string;
}

// PickSummaryMatch and MissingPicksMatch are structurally identical
// today — we accept either for the same kinds of calls. The aliases
// below make the projection from one to the other explicit so a future
// drift in either shape lights up at the call site instead of failing
// silently.
type MaybePickSummaryMatch = MissingPicksMatch & PickSummaryMatch;
type MaybePickSummaryTeam = MissingPicksTeam & PickSummaryTeam;

/**
 * Run the widget builders for a single participant.
 *
 * Returns all expansions as strings. Empty strings are returned for
 * participants with zero pick sets — the body renderer will then leave
 * a blank where the token was. That's deliberate: an email body with a
 * {{standings-summary}} for a player who has no pick sets just has a
 * blank line, not a placeholder explaining the absence.
 */
export function expandWidgetsForParticipant(
  ctx: ExpandWidgetsContext
): ExpandedWidgets {
  // Project the shared shape down to what each builder wants. The four
  // *PickSet interfaces (SummaryPickSet, MissingPicksPickSet,
  // PickSummaryPickSet) carry overlapping subsets of the fields; this
  // projection makes that explicit and means we don't have to thread
  // multiple parallel lists from the caller.
  const standingsPickSets: SummaryPickSet[] = ctx.participantPickSets.map(
    (ps) => ({
      pick_set_id: ps.pick_set_id,
      pick_set_name: ps.pick_set_name,
      group_correct: ps.group_correct,
      knockout_correct: ps.knockout_correct,
    })
  );
  const missingPickSets: MissingPicksPickSet[] = ctx.participantPickSets.map(
    (ps) => ({
      pick_set_id: ps.pick_set_id,
      pick_set_name: ps.pick_set_name,
      groupPickedMatchIds: ps.groupPickedMatchIds,
      knockoutPickedMatchIds: ps.knockoutPickedMatchIds,
    })
  );
  const summaryPickSets: PickSummaryPickSet[] = ctx.participantPickSets.map(
    (ps) => ({
      pick_set_id: ps.pick_set_id,
      pick_set_name: ps.pick_set_name,
      groupPicksByMatchId: ps.groupPicksByMatchId,
      knockoutPicksByMatchId: ps.knockoutPicksByMatchId,
    })
  );

  // The match / team shapes are structurally compatible — re-assert as
  // the wider type so both families of builders accept the same arrays.
  const groupMatches = ctx.groupMatches as MaybePickSummaryMatch[];
  const knockoutMatches = ctx.knockoutMatches as MaybePickSummaryMatch[];
  const teamsById = ctx.teamsById as Map<string, MaybePickSummaryTeam>;

  const standingsSummary = buildStandingsSummary({
    standings: ctx.standings,
    participantPickSets: standingsPickSets,
    knockoutPhaseStarted: ctx.knockoutPhaseStarted,
  });

  const missingGroupPicks = buildMissingGroupPicks({
    groupMatches,
    teamsById,
    participantPickSets: missingPickSets,
  });

  const missingKnockoutPicks = buildMissingKnockoutPicks({
    knockoutMatches,
    teamsById,
    participantPickSets: missingPickSets,
  });

  const groupPhasePicks = buildGroupPhasePicks({
    groupMatches,
    teamsById,
    participantPickSets: summaryPickSets,
  });

  const knockoutRoundPicks = buildKnockoutRoundPicks({
    knockoutMatches,
    teamsById,
    participantPickSets: summaryPickSets,
  });

  return {
    standingsSummary,
    missingGroupPicks,
    missingKnockoutPicks,
    groupPhasePicks,
    knockoutRoundPicks,
  };
}
