import type { MatchPhase } from "@/types/database";
import {
  STYLE_PICK_SET_HEADER,
  STYLE_MUTED_NOTE,
  STYLE_LIST,
  STYLE_LIST_ITEM,
  escapeHtml,
} from "./widget-styles";

// ---------------------------------------------------------------------------
// {{missing-group-picks}} and {{missing-knockout-picks}} widgets — HTML.
//
// Both widgets share the same shape per pick set:
//
//   Pick Set Name             ← bold header
//   No missing picks          ← muted italic note  OR
//   Missing picks:            ← muted italic note
//   • Team A vs Team B        ← bullets with bold team names
//   • Team C vs Team D
//
// "Missing" is defined as:
//
//   Group phase:    every group match (#1–#72) where this pick set has
//                   no row in group_picks.
//
//   Knockout phase: every active knockout match for the pool where this
//                   pick set has no row in knockout_picks AND the match's
//                   two teams are both determinable. A team is "determinable"
//                   if either the slot is directly assigned (R32) OR the
//                   feeder match is completed (later rounds). We don't list
//                   matches that read "TBD vs TBD" because the player can't
//                   make a meaningful pick on them yet.
//
// IMPORTANT: the output is raw HTML and MUST NOT be HTML-escaped at
// splice time. participant-supplied content (team names, pick set
// names) is escaped here locally. See render-email-body.ts for how
// the substitution layer routes HTML- vs plain-text widget tokens.
// ---------------------------------------------------------------------------

// ---- Match-row shape used by the helpers --------------------------------
//
// Both widgets need a minimal projection of a match: id, phase, match
// number, the home/away team IDs, plus the actual result + status so we
// can resolve cascading slots in the knockout bracket.
//
// We accept this projection rather than the full MatchWithTeams shape so
// the action can pass straight from a select query without paying the
// joined-team-row cost.
export interface MissingPicksMatch {
  id: string;
  phase: MatchPhase;
  match_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  result: "home" | "draw" | "away" | null;
  status: "scheduled" | "in_progress" | "completed";
}

export interface MissingPicksTeam {
  id: string;
  name: string;
}

export interface MissingPicksPickSet {
  pick_set_id: string;
  pick_set_name: string;
  /** Set of match_ids this pick set has a group_picks row for. */
  groupPickedMatchIds: Set<string>;
  /** Set of match_ids this pick set has a knockout_picks row for. */
  knockoutPickedMatchIds: Set<string>;
}

// ---------------------------------------------------------------------------
// BRACKET_FEEDERS — duplicated here from src/lib/picks/bracket-wiring.ts
// rather than imported, so this email-side helper doesn't pull a chain of
// frontend-only types into the action's bundle. The map is small and
// stable; the centralised version in bracket-wiring.ts remains the source
// of truth for the rest of the app.
// ---------------------------------------------------------------------------
const BRACKET_FEEDERS: Record<number, [number, number]> = {
  // R16 fed by R32 pairs
  89: [73, 74], 90: [75, 76], 91: [77, 78], 92: [79, 80],
  93: [81, 82], 94: [83, 84], 95: [85, 86], 96: [87, 88],
  // QF fed by R16 pairs
  97: [89, 90], 98: [91, 92], 99: [93, 94], 100: [95, 96],
  // SF fed by QF pairs
  101: [97, 98], 102: [99, 100],
  // Final fed by SF
  103: [101, 102],
};

const CONSOLATION_MATCH_NUMBER = 104;
const CONSOLATION_FEEDERS: [number, number] = [101, 102];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the two team IDs that should be playing in a knockout match,
 * based on actual results that have happened so far. Returns null for a
 * slot that isn't determinable yet.
 *
 * This deliberately does NOT take player picks into account — it only
 * walks completed admin-entered results. The intent is "matches the
 * player CAN actually pick now" — and "can pick now" requires both
 * teams to be real, not a player's own speculation.
 */
function resolveKnockoutTeams(
  match: MissingPicksMatch,
  matchByNumber: Map<number, MissingPicksMatch>
): { home: string | null; away: string | null } {
  const home = match.home_team_id;
  const away = match.away_team_id;
  if (home && away) return { home, away };

  // Try to fill missing slots from feeder results.
  if (match.match_number == null) return { home, away };

  let resolvedHome = home;
  let resolvedAway = away;

  if (match.match_number === CONSOLATION_MATCH_NUMBER) {
    // Consolation slots come from semifinal LOSERS.
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
    // Standard championship advancement — feeder winners.
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

/**
 * Render a single missing-picks block for one pick set as HTML. Used
 * by both widgets — the only difference between them is the list of
 * matches being passed in.
 *
 * Layout:
 *
 *   Pick Set Name             ← bold header
 *   No missing picks          ← muted italic note  OR
 *   Missing picks:            ← muted italic note
 *   • Mexico vs South Africa  ← bullets with bold team names
 *   • United States vs Australia
 *
 * Output is HTML-trusted: it goes through the html token family in
 * render-email-body.ts and is NOT escaped at splice time. Anything
 * participant-supplied (team and pick set names) is escaped here
 * locally.
 */
function renderMissingBlock(
  pickSetName: string,
  missingMatches: { home: string; away: string }[]
): string {
  const header = `<p style="${STYLE_PICK_SET_HEADER}">${escapeHtml(pickSetName)}</p>`;

  if (missingMatches.length === 0) {
    return `${header}<p style="${STYLE_MUTED_NOTE}">No missing picks</p>`;
  }

  // "Missing picks:" intro line — same muted-italic treatment as
  // standings-summary's "Not yet started" rows so the widgets read as
  // a coherent family.
  const intro = `<p style="${STYLE_MUTED_NOTE}">Missing picks:</p>`;

  // Bullets with the team names bolded. Inline-styled <ul> + <li>
  // because email clients vary on default list spacing/indentation.
  const items = missingMatches
    .map(
      (m) =>
        `<li style="${STYLE_LIST_ITEM}"><strong>${escapeHtml(m.home)}</strong> vs <strong>${escapeHtml(m.away)}</strong></li>`
    )
    .join("");
  const list = `<ul style="${STYLE_LIST}">${items}</ul>`;

  return `${header}${intro}${list}`;
}

// ---------------------------------------------------------------------------
// Group-phase missing picks
// ---------------------------------------------------------------------------

export interface BuildMissingGroupInput {
  /** All group-phase matches for this pool. Order is preserved in output. */
  groupMatches: MissingPicksMatch[];
  /** Lookup from team_id → team for rendering "Mexico vs South Africa". */
  teamsById: Map<string, MissingPicksTeam>;
  /** Pick sets owned by THIS recipient, in display order. */
  participantPickSets: MissingPicksPickSet[];
}

/**
 * Build the {{missing-group-picks}} expansion for a single recipient.
 *
 * Returns an empty string if the recipient has no pick sets — caller
 * decides how to react. The returned blocks are concatenated without a
 * separator since each block carries its own margin via the styled
 * <p> headers.
 */
export function buildMissingGroupPicks(input: BuildMissingGroupInput): string {
  const { groupMatches, teamsById, participantPickSets } = input;

  if (participantPickSets.length === 0) return "";

  // Stable ordering: by match_number, then by id. Group matches all have a
  // match_number (1–72) so sorting on it produces the natural chronological
  // order. Fallback to id keeps the comparator total in the unlikely event
  // of a null match_number.
  const sortedGroupMatches = [...groupMatches].sort((a, b) => {
    const an = a.match_number ?? Number.MAX_SAFE_INTEGER;
    const bn = b.match_number ?? Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    return a.id.localeCompare(b.id);
  });

  const blocks: string[] = [];
  for (const ps of participantPickSets) {
    const missing: { home: string; away: string }[] = [];

    for (const m of sortedGroupMatches) {
      if (ps.groupPickedMatchIds.has(m.id)) continue;

      // Without team assignments we can't render a meaningful label.
      // Group matches always have both teams from the start of the
      // tournament, so this branch is mostly defensive.
      const home = m.home_team_id ? teamsById.get(m.home_team_id) : null;
      const away = m.away_team_id ? teamsById.get(m.away_team_id) : null;
      if (!home || !away) continue;

      missing.push({ home: home.name, away: away.name });
    }

    blocks.push(renderMissingBlock(ps.pick_set_name, missing));
  }

  return blocks.join("");
}

// ---------------------------------------------------------------------------
// Knockout-phase missing picks
// ---------------------------------------------------------------------------

export interface BuildMissingKnockoutInput {
  /**
   * All ACTIVE knockout matches for this pool. The caller is responsible
   * for filtering by pool.consolation_match_enabled before passing them in,
   * mirroring the convention used elsewhere in the app (the helper trusts
   * the caller's filter so the pool-aware decision stays in one place).
   */
  knockoutMatches: MissingPicksMatch[];
  teamsById: Map<string, MissingPicksTeam>;
  participantPickSets: MissingPicksPickSet[];
}

export function buildMissingKnockoutPicks(
  input: BuildMissingKnockoutInput
): string {
  const { knockoutMatches, teamsById, participantPickSets } = input;
  if (participantPickSets.length === 0) return "";

  // Build the lookup once — every pick set's loop will need it for slot
  // resolution.
  const matchByNumber = new Map<number, MissingPicksMatch>();
  for (const m of knockoutMatches) {
    if (m.match_number != null) matchByNumber.set(m.match_number, m);
  }

  // Sort by phase order, then by match_number. Phase order matches the
  // canonical KNOCKOUT_PHASE_ORDER from bracket-wiring (r32 → r16 → qf →
  // sf → final → consolation).
  const PHASE_INDEX: Record<MatchPhase, number> = {
    group: 0,
    r32: 1,
    r16: 2,
    qf: 3,
    sf: 4,
    final: 5,
    consolation: 6,
  };
  const sortedKnockoutMatches = [...knockoutMatches].sort((a, b) => {
    const pa = PHASE_INDEX[a.phase];
    const pb = PHASE_INDEX[b.phase];
    if (pa !== pb) return pa - pb;
    const an = a.match_number ?? Number.MAX_SAFE_INTEGER;
    const bn = b.match_number ?? Number.MAX_SAFE_INTEGER;
    return an - bn;
  });

  const blocks: string[] = [];
  for (const ps of participantPickSets) {
    const missing: { home: string; away: string }[] = [];

    for (const m of sortedKnockoutMatches) {
      if (ps.knockoutPickedMatchIds.has(m.id)) continue;

      const { home, away } = resolveKnockoutTeams(m, matchByNumber);
      // Only surface matches the player CAN actually pick — both teams
      // must be determined. "TBD vs TBD" in an email isn't actionable.
      if (!home || !away) continue;

      const homeTeam = teamsById.get(home);
      const awayTeam = teamsById.get(away);
      if (!homeTeam || !awayTeam) continue;

      missing.push({ home: homeTeam.name, away: awayTeam.name });
    }

    blocks.push(renderMissingBlock(ps.pick_set_name, missing));
  }

  return blocks.join("");
}

// ---------------------------------------------------------------------------
// Per-pick-set completion flags
//
// Used by the action to decide which pick sets count as "incomplete" for
// the recipient-list filtering. The thresholds are intentionally simple:
//
//   incomplete-group    : at least one group match in the pool is missing
//                         a group_picks row for this pick set.
//
//   incomplete-knockout : at least one active knockout match (subject to
//                         the pool's consolation flag) is missing a
//                         knockout_picks row for this pick set.
//
// "Determinable teams" filtering is NOT applied here — that filter is
// purely cosmetic for the widget output. For the purposes of "who
// counts as incomplete," any unfilled active knockout slot makes the
// pick set incomplete, regardless of whether the slot has known teams
// today. This matches the way the My Picks dashboard's progress bar
// counts an empty slot — see knockoutTotalCount() / bracket-wiring.ts.
// ---------------------------------------------------------------------------

export interface PickSetCompletionInput {
  groupMatchCount: number;
  knockoutMatchCount: number;
  groupPickedCount: number;
  knockoutPickedCount: number;
}

export function isPickSetGroupIncomplete(c: PickSetCompletionInput): boolean {
  return c.groupPickedCount < c.groupMatchCount;
}

export function isPickSetKnockoutIncomplete(
  c: PickSetCompletionInput
): boolean {
  return c.knockoutPickedCount < c.knockoutMatchCount;
}
