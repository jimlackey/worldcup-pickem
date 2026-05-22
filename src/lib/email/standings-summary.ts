import type { StandingsRow } from "@/types/database";

// ---------------------------------------------------------------------------
// Per-recipient {{standings-summary}} widget.
//
// Given a participant and a snapshot of the pool's ranked standings plus
// per-pick-set correct counts, produce the plain-text block that gets
// inlined wherever the admin used the {{standings-summary}} magic string
// in their email body.
//
// Example output for one recipient with two pick sets:
//
//   Jim 1
//   Standing: 23 of 57 (65 points)
//   Group Phase:  19 correct (38 points)
//   Knockout Phase: Not yet started
//
//   Jim 2
//   Standing: 7 of 57 (88 points)
//   Group Phase:  25 correct (50 points)
//   Knockout Phase: Not yet started
//
// The "Knockout Phase" line reads "Not yet started" when no knockout
// match has been graded for ANYONE in the pool — that's the global gate
// the admin meant by phase 1/2 in the spec. Once at least one knockout
// pick has been graded for the pool, we switch to a per-pick-set count.
// ---------------------------------------------------------------------------

export interface SummaryPickSet {
  pick_set_id: string;
  pick_set_name: string;
  group_correct: number;
  knockout_correct: number;
}

export interface SummaryInput {
  /**
   * The full ranked standings for the pool. Used to look up each pick
   * set's rank, total points, and per-phase point totals, and the
   * "of N" denominator for the standing line.
   */
  standings: StandingsRow[];
  /**
   * Pick sets owned by THIS participant. Already filtered down — the
   * helper does not re-filter from a pool-wide list.
   */
  participantPickSets: SummaryPickSet[];
  /**
   * True when ANY knockout pick anywhere in the pool has been graded
   * (is_correct is not null). When false, every pick set's Knockout
   * Phase line reads "Not yet started" regardless of their own counts.
   */
  knockoutPhaseStarted: boolean;
}

/**
 * Build the standings-summary text block for a single recipient.
 * Returns an empty string if the recipient has no pick sets — the
 * caller decides how to handle that (we just leave a blank widget so
 * the rest of the email body still renders).
 */
export function buildStandingsSummary(input: SummaryInput): string {
  const { standings, participantPickSets, knockoutPhaseStarted } = input;

  if (participantPickSets.length === 0) {
    return "";
  }

  const totalPickSets = standings.length;
  const standingsById = new Map<string, StandingsRow>();
  for (const row of standings) {
    standingsById.set(row.pick_set_id, row);
  }

  // Preserve the order the caller passed pick sets in. Callers typically
  // sort by created_at so "Jim 1" precedes "Jim 2".
  const blocks: string[] = [];

  for (const ps of participantPickSets) {
    const row = standingsById.get(ps.pick_set_id);

    // Defensive: a pick set that's somehow missing from standings still
    // renders its name + a clear placeholder so the admin notices the
    // anomaly rather than getting silently dropped from the email.
    if (!row) {
      blocks.push(
        [
          ps.pick_set_name,
          "Standing: not available",
          `Group Phase:  ${ps.group_correct} correct`,
          knockoutPhaseStarted
            ? `Knockout Phase: ${ps.knockout_correct} correct`
            : "Knockout Phase: Not yet started",
        ].join("\n")
      );
      continue;
    }

    const rank = row.rank ?? 0;
    const totalPoints = Number(row.total_points ?? 0);
    const groupPoints = Number(row.group_points ?? 0);
    const knockoutPoints = Number(row.knockout_points ?? 0);

    const lines = [
      ps.pick_set_name,
      `Standing: ${rank} of ${totalPickSets} (${totalPoints} points)`,
      `Group Phase:  ${ps.group_correct} correct (${groupPoints} points)`,
      knockoutPhaseStarted
        ? `Knockout Phase: ${ps.knockout_correct} correct (${knockoutPoints} points)`
        : "Knockout Phase: Not yet started",
    ];

    blocks.push(lines.join("\n"));
  }

  // Blank line between each pick set's block. Matches the spacing in
  // the spec where two pick sets are separated by an empty line.
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Token substitution
//
// Each "widget" is a magic string the admin pastes into the body. The
// only widget today is {{standings-summary}}, but the substitution layer
// is structured as a token → replacement map so adding more later (e.g.
// {{first-name}}, {{pool-name}}) is just another entry.
// ---------------------------------------------------------------------------

export interface BodyTokens {
  "standings-summary": string;
  "missing-group-picks": string;
  "missing-knockout-picks": string;
  // Future widgets go here.
  [key: string]: string;
}

/**
 * Replace every {{token}} occurrence in `body` with the matching string
 * from `tokens`. Tokens not in the map are left as-is so a typo like
 * {{standings_summary}} (underscore vs. dash) still produces a visible
 * artifact in the email rather than disappearing silently.
 */
export function applyBodyTokens(body: string, tokens: BodyTokens): string {
  return body.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(tokens, name)) {
      return tokens[name];
    }
    return match;
  });
}
