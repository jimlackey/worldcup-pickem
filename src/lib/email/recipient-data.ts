// ---------------------------------------------------------------------------
// Recipient data builder.
//
// Projects the pool-wide EmailContext into the per-recipient data shape
// that custom widget templates render against. This is the "data
// contract" exposed to template authors — every field shape and name
// below is something an admin can write `{{path.to.field}}` against.
//
// Adding fields here is backwards-compatible (existing templates ignore
// new fields). Renaming or removing fields is a breaking change for
// any saved templates that referenced them.
//
// IMPORTANT: this builder runs ALONGSIDE the existing built-in widget
// code paths during the staged rollout. The five built-in widgets
// (standings-summary, missing-group-picks, missing-knockout-picks,
// group-phase-picks, knockout-round-picks) still emit HTML via
// expand-widgets.ts. A custom widget whose template uses the data
// fields below gets rendered through the template engine using the
// data this module produces. Both paths coexist.
//
// Once the five built-ins are migrated to templates in the next phase,
// expand-widgets.ts and its helpers will be deleted and this module
// becomes the single per-recipient data source.
// ---------------------------------------------------------------------------

import type { EmailContext, EmailContextPickSet } from "./load-context";
import {
  BRACKET_FEEDERS,
  CONSOLATION_FEEDERS,
  CONSOLATION_MATCH_NUMBER,
  KNOCKOUT_PHASE_ORDER,
} from "@/lib/picks/bracket-wiring";
import type { MatchPhase, StandingsRow } from "@/types/database";

// ---------------------------------------------------------------------------
// Public data shape — DOCUMENTED CONTRACT for template authors.
//
// Anything renamed, retyped, or removed below is a breaking change to
// admin-authored templates. Adding new fields is fine.
// ---------------------------------------------------------------------------

/** Top-level data passed to a custom widget template. */
export interface RecipientTemplateData {
  recipient: RecipientInfo;
  pool: PoolInfo;
  /** Pick sets owned by the recipient, in display order. */
  pickSets: PickSetData[];
}

export interface RecipientInfo {
  /** Display name when set, otherwise the email address. Never null. */
  name: string;
  email: string;
}

export interface PoolInfo {
  name: string;
  /** True when at least one knockout pick anywhere in the pool has been
   *  graded. Drives the "Not yet started" branch in the standings UX. */
  knockoutPhaseStarted: boolean;
  /** Total number of pick sets in the pool. Used as the "of N"
   *  denominator on per-pick-set rank displays. */
  totalPickSets: number;
}

export interface PickSetData {
  /** Pick set display name (e.g. "Jim 1"). */
  name: string;

  /** 1-based rank in the pool standings. Zero when the pick set is
   *  missing from standings (defensive — shouldn't happen). */
  rank: number;
  /** Total points across all phases. */
  totalPoints: number;
  /** Group-phase points. */
  groupPoints: number;
  /** Knockout-phase points. */
  knockoutPoints: number;

  /** Count of correctly-graded group picks. */
  groupCorrect: number;
  /** Count of correctly-graded knockout picks. */
  knockoutCorrect: number;

  /** Number of group matches this pick set has actually picked. */
  groupCompleteCount: number;
  /** Total group matches that COULD be picked (pre-lock pool size). */
  groupPickableCount: number;
  /** Number of knockout matches with determinable teams the pick set
   *  has actually picked. */
  knockoutCompleteCount: number;
  /** Total knockout matches with determinable teams. */
  knockoutPickableCount: number;

  /** Group matches the pick set has NOT picked, in match order. */
  missingGroupMatches: MissingMatchInfo[];
  /** Knockout matches with determinable teams the pick set has NOT
   *  picked, in match order. TBDs are excluded. */
  missingKnockoutMatches: MissingMatchInfo[];

  /** Every group match × this pick set's pick. Match-number order. */
  groupPickRows: PickRow[];
  /** Knockout matches grouped by round, only including matches with
   *  determinable teams. Rounds in phase order. */
  knockoutRounds: KnockoutRound[];
}

export interface MissingMatchInfo {
  matchNumber: number | null;
  /** Display name of the home team. Never null for group matches; for
   *  knockout this is null only on undetermined slots (in which case
   *  the match wouldn't be in this list). */
  home: string;
  away: string;
  /** Knockout phase ("r32", "qf", ...). Group matches set "group". */
  phase: MatchPhase;
}

export interface PickRow {
  matchNumber: number | null;
  /** Display name of the home team, or null when undetermined. */
  home: string | null;
  away: string | null;
  /**
   * What the participant picked, normalised:
   *   - "home" / "draw" / "away" for group rows
   *   - "home" / "away" for knockout rows
   *   - null when no pick exists yet
   */
  picked: "home" | "draw" | "away" | null;
  /** Pre-rendered label — team name (uppercased), "DRAW", or "NOT PICKED". */
  pickedLabel: string;
  /**
   * True when the participant has a usable pick on this match — i.e.
   * pickedLabel is something other than "NOT PICKED". False when the
   * pick is missing OR when the picked side's team isn't determinable
   * yet (rare; mostly a knockout-bracket edge case). Templates branch
   * on this to apply the muted styling for missing picks.
   */
  isPicked: boolean;
  /**
   * The actual result if the match has been completed and graded,
   * same normalisation as `picked`. Null when not yet known.
   */
  result: "home" | "draw" | "away" | null;
  /**
   * Pre-rendered label for the result — team name (uppercased),
   * "DRAW", or "" when not yet known.
   */
  resultLabel: string;
  /** Match status flag. */
  status: "scheduled" | "in_progress" | "completed";
  /** Per-pick correctness. Null until result is known. */
  isCorrect: boolean | null;
}

export interface KnockoutRound {
  phase: MatchPhase;
  /** Human-readable phase label, e.g. "Round of 32". */
  label: string;
  matches: PickRow[];
}

// ---------------------------------------------------------------------------
// Phase label table — same constants the legacy pick-summaries widget
// uses, duplicated here so this module doesn't depend on a sibling
// that's slated for deletion in the next phase.
// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<MatchPhase, string> = {
  group: "Group",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarterfinals",
  sf: "Semifinals",
  final: "Final",
  consolation: "Third Place",
};

// ---------------------------------------------------------------------------
// Resolver helpers
//
// Knockout matches don't carry team_ids until the feeding match is
// graded. To render the bracket pre-grading, we walk the feeder map and
// stop at the first slot that's still TBD. Same algorithm as the
// legacy widgets — duplicated rather than imported because the legacy
// helpers are going away in the next phase and we don't want a
// short-lived cross-import.
// ---------------------------------------------------------------------------

interface MatchLike {
  id: string;
  phase: MatchPhase;
  match_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  result: "home" | "draw" | "away" | null;
  status: "scheduled" | "in_progress" | "completed";
}

interface TeamLike {
  id: string;
  name: string;
}

function resolveKnockoutTeams(
  match: MatchLike,
  matchByNumber: Map<number, MatchLike>
): { home: string | null; away: string | null } {
  const home = match.home_team_id;
  const away = match.away_team_id;
  if (home && away) return { home, away };
  if (match.match_number == null) return { home, away };

  let resolvedHome = home;
  let resolvedAway = away;

  if (match.match_number === CONSOLATION_MATCH_NUMBER) {
    const [fa, fb] = CONSOLATION_FEEDERS;
    const feederA = matchByNumber.get(fa);
    const feederB = matchByNumber.get(fb);
    if (!resolvedHome && feederA?.status === "completed" && feederA.result) {
      resolvedHome =
        feederA.result === "home" ? feederA.away_team_id : feederA.home_team_id;
    }
    if (!resolvedAway && feederB?.status === "completed" && feederB.result) {
      resolvedAway =
        feederB.result === "home" ? feederB.away_team_id : feederB.home_team_id;
    }
  } else {
    const feeders = BRACKET_FEEDERS[match.match_number];
    if (feeders) {
      const [fa, fb] = feeders;
      const feederA = matchByNumber.get(fa);
      const feederB = matchByNumber.get(fb);
      if (!resolvedHome && feederA?.status === "completed" && feederA.result) {
        resolvedHome =
          feederA.result === "home"
            ? feederA.home_team_id
            : feederA.away_team_id;
      }
      if (!resolvedAway && feederB?.status === "completed" && feederB.result) {
        resolvedAway =
          feederB.result === "home"
            ? feederB.home_team_id
            : feederB.away_team_id;
      }
    }
  }

  return { home: resolvedHome, away: resolvedAway };
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function pickedLabelOf(
  pick: "home" | "draw" | "away" | null,
  homeName: string | null,
  awayName: string | null
): string {
  if (pick === null) return "NOT PICKED";
  if (pick === "draw") return "DRAW";
  const name = pick === "home" ? homeName : awayName;
  if (!name) return "NOT PICKED";
  return name.toLocaleUpperCase();
}

function resultLabelOf(
  result: "home" | "draw" | "away" | null,
  homeName: string | null,
  awayName: string | null
): string {
  if (result === null) return "";
  if (result === "draw") return "DRAW";
  const name = result === "home" ? homeName : awayName;
  if (!name) return "";
  return name.toLocaleUpperCase();
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

interface BuildArgs {
  /** Pool-wide context as loaded by loadEmailContext. */
  ctx: EmailContext;
  /** The participant whose data we're projecting. Caller already
   *  verified active membership. */
  participantId: string;
  /** Participant rollup — caller has it on hand, no need to re-look-up. */
  rollup: {
    pickSets: EmailContextPickSet[];
  };
  /** Participant display name and email, pre-computed by caller. */
  recipientName: string;
  recipientEmail: string;
  /** Pool name from the Pool row. */
  poolName: string;
}

/**
 * Build the per-recipient template data object. Linear in (pick sets ×
 * matches), same complexity as the legacy expandWidgetsForParticipant.
 */
export function buildRecipientTemplateData(
  args: BuildArgs
): RecipientTemplateData {
  const { ctx, rollup, recipientName, recipientEmail, poolName } = args;

  // Standings projection: rank by pick_set_id.
  const standingsById = new Map<string, StandingsRow>();
  for (const r of ctx.standings) standingsById.set(r.pick_set_id, r);

  // Team lookup by id — used for label resolution. The context's
  // teamsById uses { id, name } entries; we just pull `name`.
  const teamNameById = new Map<string, string>();
  for (const [id, t] of ctx.teamsById) {
    teamNameById.set(id, t.name);
  }

  // Match index by number — needed to walk feeders for undetermined
  // knockout slots.
  const matchByNumber = new Map<number, MatchLike>();
  for (const m of ctx.knockoutMatches) {
    if (m.match_number != null) {
      matchByNumber.set(m.match_number, m as MatchLike);
    }
  }
  // Group matches don't have feeders but include them for completeness;
  // resolveKnockoutTeams never looks at group matches anyway.
  for (const m of ctx.groupMatches) {
    if (m.match_number != null) {
      matchByNumber.set(m.match_number, m as MatchLike);
    }
  }

  // ---- Pre-compute pickable knockout matches ---------------------------
  // For "knockoutPickableCount" + missingKnockoutMatches we need to know
  // which knockout matches have BOTH teams determinable for THIS pool
  // right now. That's whatever resolveKnockoutTeams returns with both
  // home and away non-null.
  const sortedKnockoutMatches = [...ctx.knockoutMatches].sort((a, b) => {
    const an = a.match_number ?? Number.MAX_SAFE_INTEGER;
    const bn = b.match_number ?? Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    return a.id.localeCompare(b.id);
  });

  const knockoutResolvedTeams = new Map<
    string,
    { homeName: string | null; awayName: string | null }
  >();
  for (const m of sortedKnockoutMatches) {
    const { home, away } = resolveKnockoutTeams(m as MatchLike, matchByNumber);
    knockoutResolvedTeams.set(m.id, {
      homeName: home ? teamNameById.get(home) ?? null : null,
      awayName: away ? teamNameById.get(away) ?? null : null,
    });
  }

  // Determinable matches: both teams resolved.
  const determinableKnockoutMatchIds = new Set(
    sortedKnockoutMatches
      .filter((m) => {
        const r = knockoutResolvedTeams.get(m.id);
        return r && r.homeName && r.awayName;
      })
      .map((m) => m.id)
  );

  // ---- Sorted group matches --------------------------------------------
  const sortedGroupMatches = [...ctx.groupMatches].sort((a, b) => {
    const an = a.match_number ?? Number.MAX_SAFE_INTEGER;
    const bn = b.match_number ?? Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    return a.id.localeCompare(b.id);
  });

  const groupPickableCount = sortedGroupMatches.length;
  const knockoutPickableCount = determinableKnockoutMatchIds.size;

  // ---- Per-pick-set projection ----------------------------------------
  const pickSets: PickSetData[] = rollup.pickSets.map((ps) => {
    const sRow = standingsById.get(ps.pick_set_id);

    // missingGroupMatches: walk every group match, include those not in
    // the pick set's groupPickedMatchIds.
    const missingGroupMatches: MissingMatchInfo[] = [];
    for (const m of sortedGroupMatches) {
      if (ps.groupPickedMatchIds.has(m.id)) continue;
      const home = m.home_team_id ? teamNameById.get(m.home_team_id) : null;
      const away = m.away_team_id ? teamNameById.get(m.away_team_id) : null;
      if (!home || !away) continue; // defensive — group matches should always have teams
      missingGroupMatches.push({
        matchNumber: m.match_number,
        home,
        away,
        phase: "group",
      });
    }

    // missingKnockoutMatches: only matches with determinable teams.
    const missingKnockoutMatches: MissingMatchInfo[] = [];
    for (const m of sortedKnockoutMatches) {
      if (!determinableKnockoutMatchIds.has(m.id)) continue;
      if (ps.knockoutPickedMatchIds.has(m.id)) continue;
      const resolved = knockoutResolvedTeams.get(m.id);
      if (!resolved?.homeName || !resolved.awayName) continue;
      missingKnockoutMatches.push({
        matchNumber: m.match_number,
        home: resolved.homeName,
        away: resolved.awayName,
        phase: m.phase,
      });
    }

    // groupPickRows: every group match × this pick set's pick (or null).
    const groupPickRows: PickRow[] = sortedGroupMatches.map((m) => {
      const home = m.home_team_id ? teamNameById.get(m.home_team_id) ?? null : null;
      const away = m.away_team_id ? teamNameById.get(m.away_team_id) ?? null : null;
      const picked = ps.groupPicksByMatchId.get(m.id) ?? null;
      const result = m.result ?? null;
      // Per-pick correctness is null until graded. The rollup already
      // tracks group_correct as an aggregate, but we recompute per-row
      // here so admins can author templates that highlight per-match
      // correctness.
      let isCorrect: boolean | null = null;
      if (m.status === "completed" && picked !== null && result !== null) {
        isCorrect = picked === result;
      }
      const pickedLabel = pickedLabelOf(picked, home, away);
      return {
        matchNumber: m.match_number,
        home,
        away,
        picked,
        pickedLabel,
        isPicked: pickedLabel !== "NOT PICKED",
        result,
        resultLabel: resultLabelOf(result, home, away),
        status: m.status,
        isCorrect,
      };
    });

    // knockoutRounds: group determinable matches by phase, in phase order.
    // Determinable-only because un-determinable matches can't even be
    // labelled meaningfully.
    const knockoutByPhase = new Map<MatchPhase, PickRow[]>();
    for (const m of sortedKnockoutMatches) {
      if (!determinableKnockoutMatchIds.has(m.id)) continue;
      const resolved = knockoutResolvedTeams.get(m.id);
      const home = resolved?.homeName ?? null;
      const away = resolved?.awayName ?? null;
      const pickedRaw = ps.knockoutPicksByMatchId.get(m.id) ?? null;
      // Normalise knockout pick to the same "home"/"away" shape; group
      // can include "draw" but knockout can't.
      const picked: "home" | "draw" | "away" | null = pickedRaw;
      const result = m.result ?? null;
      let isCorrect: boolean | null = null;
      if (m.status === "completed" && picked !== null && result !== null) {
        isCorrect = picked === result;
      }
      const pickedLabel = pickedLabelOf(picked, home, away);
      const row: PickRow = {
        matchNumber: m.match_number,
        home,
        away,
        picked,
        pickedLabel,
        isPicked: pickedLabel !== "NOT PICKED",
        result,
        resultLabel: resultLabelOf(result, home, away),
        status: m.status,
        isCorrect,
      };
      const bucket = knockoutByPhase.get(m.phase);
      if (bucket) {
        bucket.push(row);
      } else {
        knockoutByPhase.set(m.phase, [row]);
      }
    }

    const knockoutRounds: KnockoutRound[] = [];
    for (const phase of KNOCKOUT_PHASE_ORDER) {
      const matches = knockoutByPhase.get(phase);
      if (!matches || matches.length === 0) continue;
      knockoutRounds.push({
        phase,
        label: PHASE_LABEL[phase],
        matches,
      });
    }

    // Completion counts: how many picks the pick set has made among
    // pickable matches.
    let groupCompleteCount = 0;
    for (const m of sortedGroupMatches) {
      if (ps.groupPickedMatchIds.has(m.id)) groupCompleteCount += 1;
    }
    let knockoutCompleteCount = 0;
    for (const mid of determinableKnockoutMatchIds) {
      if (ps.knockoutPickedMatchIds.has(mid)) knockoutCompleteCount += 1;
    }

    return {
      name: ps.pick_set_name,
      rank: sRow?.rank ?? 0,
      totalPoints: Number(sRow?.total_points ?? 0),
      groupPoints: Number(sRow?.group_points ?? 0),
      knockoutPoints: Number(sRow?.knockout_points ?? 0),
      groupCorrect: ps.group_correct,
      knockoutCorrect: ps.knockout_correct,
      groupCompleteCount,
      groupPickableCount,
      knockoutCompleteCount,
      knockoutPickableCount,
      missingGroupMatches,
      missingKnockoutMatches,
      groupPickRows,
      knockoutRounds,
    };
  });

  return {
    recipient: {
      name: recipientName,
      email: recipientEmail,
    },
    pool: {
      name: poolName,
      knockoutPhaseStarted: ctx.knockoutPhaseStarted,
      totalPickSets: ctx.standings.length,
    },
    pickSets,
  };
}
