import type { StandingsRow } from "@/types/database";
import {
  STYLE_PICK_SET_HEADER,
  STYLE_LABEL_VALUE_TABLE,
  STYLE_LABEL_CELL,
  STYLE_VALUE_CELL,
  STYLE_MUTED,
  escapeHtml,
} from "./widget-styles";

// ---------------------------------------------------------------------------
// Per-recipient {{standings-summary}} widget — HTML output.
//
// Given a participant and a snapshot of the pool's ranked standings plus
// per-pick-set correct counts, produce inline-styled HTML that gets
// spliced into the email body wherever the admin used the
// {{standings-summary}} magic string.
//
// Visual structure for each pick set:
//
//   ┌─────────────────────────────────────────────┐
//   │ Jim 1                                       │  ← bold header
//   │ Standing       23 of 57 (65 points)         │  ← label/value table
//   │ Group Phase    19 correct (38 points)       │
//   │ Knockout Phase Not yet started              │
//   └─────────────────────────────────────────────┘
//
// The "Knockout Phase" line reads "Not yet started" (muted italic) when
// no knockout match has been graded for ANYONE in the pool — that's the
// global gate the admin meant by phase 1/2 in the spec. Once at least
// one knockout pick has been graded for the pool, we switch to a
// per-pick-set count.
//
// IMPORTANT: the output is raw HTML and MUST NOT be HTML-escaped at
// splice time. participant-supplied content (pick set name, etc.) is
// escaped here locally. See render-email-body.ts for how the
// substitution layer routes HTML- vs plain-text widget tokens.
//
// Inline styles are required: most email clients strip <style> blocks,
// so every visual rule rides on the element it targets.
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

// ---------------------------------------------------------------------------
// Inline cell helpers
//
// The standings layout is "label | bold-value (muted-context)". Pulling
// the cell shaping out into small helpers keeps the assembly loop below
// readable.
// ---------------------------------------------------------------------------

/** Italic muted "not available" cell — used when a pick set is missing
 *  from standings (very rare; defensive). */
const NOT_AVAILABLE = `<span style="${STYLE_MUTED};font-style:italic">not available</span>`;

/** Italic muted "Not yet started" cell — used when knockout grading
 *  hasn't begun pool-wide. */
const NOT_YET_STARTED = `<span style="${STYLE_MUTED};font-style:italic">Not yet started</span>`;

/**
 * Render a "X of N (P points)" style value cell with the leading number
 * bold and the rest in a muted shade. Keeps the value visually punchy
 * without overwhelming the row.
 */
function valueCell(primary: string | number, context: string): string {
  return `<strong>${escapeHtml(String(primary))}</strong> <span style="${STYLE_MUTED}">${escapeHtml(context)}</span>`;
}

/** Build a single <tr> in the label/value table. */
function row(label: string, valueHtml: string): string {
  return `<tr><td style="${STYLE_LABEL_CELL}">${escapeHtml(label)}</td><td style="${STYLE_VALUE_CELL}">${valueHtml}</td></tr>`;
}

/**
 * Build the standings-summary HTML block for a single recipient.
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
  for (const r of standings) {
    standingsById.set(r.pick_set_id, r);
  }

  // Preserve the order the caller passed pick sets in. Callers typically
  // sort by created_at so "Jim 1" precedes "Jim 2".
  const blocks: string[] = [];

  for (const ps of participantPickSets) {
    const standingsRow = standingsById.get(ps.pick_set_id);

    const header = `<p style="${STYLE_PICK_SET_HEADER}">${escapeHtml(ps.pick_set_name)}</p>`;

    // Defensive: a pick set somehow missing from standings still renders
    // its name + clear placeholders so the admin notices the anomaly
    // rather than getting silently dropped from the email.
    if (!standingsRow) {
      const rows = [
        row("Standing", NOT_AVAILABLE),
        row(
          "Group Phase",
          valueCell(ps.group_correct, "correct")
        ),
        row(
          "Knockout Phase",
          knockoutPhaseStarted
            ? valueCell(ps.knockout_correct, "correct")
            : NOT_YET_STARTED
        ),
      ];
      blocks.push(
        `${header}<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="${STYLE_LABEL_VALUE_TABLE}"><tbody>${rows.join("")}</tbody></table>`
      );
      continue;
    }

    const rank = standingsRow.rank ?? 0;
    const totalPoints = Number(standingsRow.total_points ?? 0);
    const groupPoints = Number(standingsRow.group_points ?? 0);
    const knockoutPoints = Number(standingsRow.knockout_points ?? 0);

    const rows = [
      row(
        "Standing",
        valueCell(rank, `of ${totalPickSets} (${totalPoints} points)`)
      ),
      row(
        "Group Phase",
        valueCell(
          ps.group_correct,
          `correct (${groupPoints} points)`
        )
      ),
      row(
        "Knockout Phase",
        knockoutPhaseStarted
          ? valueCell(
              ps.knockout_correct,
              `correct (${knockoutPoints} points)`
            )
          : NOT_YET_STARTED
      ),
    ];

    blocks.push(
      `${header}<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="${STYLE_LABEL_VALUE_TABLE}"><tbody>${rows.join("")}</tbody></table>`
    );
  }

  return blocks.join("");
}
