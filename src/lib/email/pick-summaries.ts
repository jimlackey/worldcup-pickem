import type { MatchPhase } from "@/types/database";

// ---------------------------------------------------------------------------
// Pick-summary widgets — HTML output.
//
// Both widgets render full per-pick-set summaries: every group match for
// the group widget, every determinable-team knockout match for the
// knockout widget. The output is inline-styled HTML tables because the
// alternative — ASCII columns in plain text — alignment-breaks across
// every monospaced/proportional client.
//
// IMPORTANT: these widget outputs are inserted into the email body
// AFTER the body has been HTML-escaped (see lib/email/resend-broadcast.ts).
// They are HTML-trusted — meaning the substitution layer must NOT escape
// them. Anything user-supplied (team names, pick set names) is escaped
// here, locally, before it lands in the output string.
//
// Inline styles are required: most email clients strip <style> blocks,
// and class-based styling never reaches the rendered mail. Every visual
// rule has to ride on the element it targets.
// ---------------------------------------------------------------------------

// ---- Shared shapes --------------------------------------------------------
//
// We re-use the same projection shapes the missing-picks widgets use so
// the load-context loader produces one set of inputs for both feature
// families. Importing across modules here would create a circular link
// through expand-widgets — so the shapes are duplicated.

export interface PickSummaryMatch {
  id: string;
  phase: MatchPhase;
  match_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  result: "home" | "draw" | "away" | null;
  status: "scheduled" | "in_progress" | "completed";
}

export interface PickSummaryTeam {
  id: string;
  name: string;
}

/**
 * A pick set's picks projected as match_id → pick result, with the
 * "no pick" case represented by absence (not a sentinel). Mirrors the
 * shape load-context produces for missing-picks.
 */
export interface PickSummaryPickSet {
  pick_set_id: string;
  pick_set_name: string;
  /** match_id → "home" | "draw" | "away" for picks the player made. */
  groupPicksByMatchId: Map<string, "home" | "draw" | "away">;
  /**
   * match_id → "home" | "away" for picks the player made. Knockout has
   * no draws (the bracket-picker doesn't allow them), so the value set
   * is narrower than group's.
   */
  knockoutPicksByMatchId: Map<string, "home" | "away">;
}

// ---- Bracket wiring duplicate ---------------------------------------------
//
// Same rationale as missing-picks: we duplicate the feeder map locally so
// this email-side helper doesn't pull a chain of frontend-only types into
// the action's bundle. The canonical version lives in
// src/lib/picks/bracket-wiring.ts.
const BRACKET_FEEDERS: Record<number, [number, number]> = {
  89: [73, 74], 90: [75, 76], 91: [77, 78], 92: [79, 80],
  93: [81, 82], 94: [83, 84], 95: [85, 86], 96: [87, 88],
  97: [89, 90], 98: [91, 92], 99: [93, 94], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  103: [101, 102],
};

const CONSOLATION_MATCH_NUMBER = 104;
const CONSOLATION_FEEDERS: [number, number] = [101, 102];

const KNOCKOUT_PHASE_LABELS: Record<MatchPhase, string> = {
  group: "Group",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarterfinals",
  sf: "Semifinals",
  final: "Final",
  consolation: "Third Place",
};

const KNOCKOUT_PHASE_ORDER: MatchPhase[] = [
  "r32",
  "r16",
  "qf",
  "sf",
  "final",
  "consolation",
];

// ---- Slot resolution ------------------------------------------------------
//
// Identical to the resolveKnockoutTeams in missing-picks.ts — repeated
// here because pulling it through expand-widgets / a shared file would
// have created cross-file plumbing for what's a 20-line helper. The two
// copies should stay in sync; if a third widget needs it, fold it out
// to lib/email/knockout-resolve.ts.
function resolveKnockoutTeams(
  match: PickSummaryMatch,
  matchByNumber: Map<number, PickSummaryMatch>
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

// ---- HTML helpers ---------------------------------------------------------

// ---- HTML helpers ---------------------------------------------------------
//
// escapeHtml and the shared style constants live in widget-styles.ts so
// all five HTML widgets share one source of truth for the visual
// language. The STYLE_PHASE_HEADER alias below points at STYLE_SUB_HEADER
// because that's what the round labels are visually — kept under the
// local name to minimise the rename diff in this file's body.

import {
  STYLE_TABLE,
  STYLE_TH_LEFT,
  STYLE_TH_RIGHT,
  STYLE_TD_LEFT,
  STYLE_TD_RIGHT,
  STYLE_PICK_SET_HEADER,
  STYLE_SUB_HEADER as STYLE_PHASE_HEADER,
  STYLE_MUTED,
  STYLE_MUTED_NOTE,
  escapeHtml,
} from "./widget-styles";

/**
 * Render a single pick label as upper-case team name, "DRAW", or
 * "NOT PICKED". Matches the wording in the spec example.
 *
 * Caller passes the pick value (or null for un-picked) and a resolver
 * that maps "home"/"away" to the actual team name string. We always
 * uppercase via toLocaleUpperCase to handle accented characters
 * correctly (e.g. "Côte d'Ivoire" → "CÔTE D'IVOIRE").
 */
function renderPickCell(
  pick: "home" | "draw" | "away" | null,
  homeName: string | null,
  awayName: string | null
): string {
  if (pick === null) return "NOT PICKED";
  if (pick === "draw") return "DRAW";
  const name = pick === "home" ? homeName : awayName;
  if (!name) return "NOT PICKED"; // defensive
  return name.toLocaleUpperCase();
}

/**
 * Wrap "NOT PICKED" cells in a muted grey so the active picks stand
 * out. Real team names + "DRAW" use the normal text colour.
 */
function pickCellHtml(label: string): string {
  if (label === "NOT PICKED") {
    return `<span style="${STYLE_MUTED}">${label}</span>`;
  }
  return label;
}

// ===========================================================================
// {{group-phase-picks}}
// ===========================================================================

export interface BuildGroupPicksInput {
  /** All group-phase matches for this pool, in any order. */
  groupMatches: PickSummaryMatch[];
  teamsById: Map<string, PickSummaryTeam>;
  participantPickSets: PickSummaryPickSet[];
}

/**
 * Render the {{group-phase-picks}} widget for one recipient.
 *
 * Each pick set produces a header line and a two-column table
 * (Match | Pick) covering all 72 group matches. Pick sets are stacked
 * vertically with margin. Returns an empty string for a recipient
 * with no pick sets so the body renderer leaves a clean blank.
 */
export function buildGroupPhasePicks(input: BuildGroupPicksInput): string {
  const { groupMatches, teamsById, participantPickSets } = input;
  if (participantPickSets.length === 0) return "";

  // Stable ordering: by match_number. Group matches always have one
  // (1–72), so the comparator is total even without a tiebreaker.
  const sorted = [...groupMatches].sort((a, b) => {
    const an = a.match_number ?? Number.MAX_SAFE_INTEGER;
    const bn = b.match_number ?? Number.MAX_SAFE_INTEGER;
    return an - bn;
  });

  const blocks: string[] = [];
  for (const ps of participantPickSets) {
    const rows: string[] = [];
    for (const m of sorted) {
      const home = m.home_team_id ? teamsById.get(m.home_team_id) : null;
      const away = m.away_team_id ? teamsById.get(m.away_team_id) : null;
      // Without team names we'd produce a misleading row; skip.
      if (!home || !away) continue;

      const pick = ps.groupPicksByMatchId.get(m.id) ?? null;
      const pickLabel = renderPickCell(pick, home.name, away.name);

      rows.push(
        `<tr><td style="${STYLE_TD_LEFT}">${escapeHtml(home.name)} vs ${escapeHtml(away.name)}</td><td style="${STYLE_TD_RIGHT}">${pickCellHtml(escapeHtml(pickLabel))}</td></tr>`
      );
    }

    const header = `<p style="${STYLE_PICK_SET_HEADER}">${escapeHtml(ps.pick_set_name)}</p>`;
    const table = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="${STYLE_TABLE}"><thead><tr><th style="${STYLE_TH_LEFT}">Match</th><th style="${STYLE_TH_RIGHT}">Pick</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
    blocks.push(header + table);
  }

  return blocks.join("");
}

// ===========================================================================
// {{knockout-round-picks}}
// ===========================================================================

export interface BuildKnockoutPicksInput {
  /**
   * All ACTIVE knockout matches for this pool, ALREADY filtered by
   * pool.consolation_match_enabled. Same contract as missing-picks —
   * the caller owns the pool-aware decision.
   */
  knockoutMatches: PickSummaryMatch[];
  teamsById: Map<string, PickSummaryTeam>;
  participantPickSets: PickSummaryPickSet[];
}

/**
 * Render the {{knockout-round-picks}} widget for one recipient.
 *
 * Each pick set produces a header line and one table PER ROUND
 * (R32 → R16 → QF → SF → Final → optional Third Place). Only matches
 * where both teams are determinable (via direct assignment or via
 * completed feeder results) are listed — "TBD vs TBD" entries aren't
 * actionable picks and would clutter the email. This matches the
 * convention used by {{missing-knockout-picks}}.
 *
 * Returns an empty string for a recipient with no pick sets.
 */
export function buildKnockoutRoundPicks(
  input: BuildKnockoutPicksInput
): string {
  const { knockoutMatches, teamsById, participantPickSets } = input;
  if (participantPickSets.length === 0) return "";

  const matchByNumber = new Map<number, PickSummaryMatch>();
  for (const m of knockoutMatches) {
    if (m.match_number != null) matchByNumber.set(m.match_number, m);
  }

  // Group active knockout matches by phase, preserving match_number
  // order within each phase.
  const byPhase = new Map<MatchPhase, PickSummaryMatch[]>();
  for (const m of knockoutMatches) {
    const bucket = byPhase.get(m.phase) ?? [];
    bucket.push(m);
    byPhase.set(m.phase, bucket);
  }
  for (const bucket of byPhase.values()) {
    bucket.sort((a, b) => {
      const an = a.match_number ?? Number.MAX_SAFE_INTEGER;
      const bn = b.match_number ?? Number.MAX_SAFE_INTEGER;
      return an - bn;
    });
  }

  const blocks: string[] = [];
  for (const ps of participantPickSets) {
    const sections: string[] = [];

    for (const phase of KNOCKOUT_PHASE_ORDER) {
      const matches = byPhase.get(phase);
      if (!matches || matches.length === 0) continue;

      const rows: string[] = [];
      for (const m of matches) {
        const { home, away } = resolveKnockoutTeams(m, matchByNumber);
        // Only surface matches the player COULD pick — both teams
        // must be determined. TBD-vs-TBD entries aren't useful here.
        if (!home || !away) continue;

        const homeTeam = teamsById.get(home);
        const awayTeam = teamsById.get(away);
        if (!homeTeam || !awayTeam) continue;

        const pick = ps.knockoutPicksByMatchId.get(m.id) ?? null;
        const pickLabel = renderPickCell(pick, homeTeam.name, awayTeam.name);

        rows.push(
          `<tr><td style="${STYLE_TD_LEFT}">${escapeHtml(homeTeam.name)} vs ${escapeHtml(awayTeam.name)}</td><td style="${STYLE_TD_RIGHT}">${pickCellHtml(escapeHtml(pickLabel))}</td></tr>`
        );
      }

      if (rows.length === 0) continue;

      const phaseHeader = `<p style="${STYLE_PHASE_HEADER}">${escapeHtml(KNOCKOUT_PHASE_LABELS[phase])}</p>`;
      const table = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="${STYLE_TABLE}"><thead><tr><th style="${STYLE_TH_LEFT}">Match</th><th style="${STYLE_TH_RIGHT}">Pick</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
      sections.push(phaseHeader + table);
    }

    const psHeader = `<p style="${STYLE_PICK_SET_HEADER}">${escapeHtml(ps.pick_set_name)}</p>`;
    // Pick sets where the player has made zero determinable knockout
    // picks AND no rounds have determinable teams yet produce no
    // section content — still show the header so the admin can see the
    // pick set exists; follow with a muted note.
    const body =
      sections.length > 0
        ? sections.join("")
        : `<p style="${STYLE_MUTED_NOTE}">No knockout matches are available to pick yet.</p>`;
    blocks.push(psHeader + body);
  }

  return blocks.join("");
}
