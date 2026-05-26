import type { Pool, MatchPhase } from "@/types/database";
import { DeadlineBadge } from "./deadline-badge";
// Date display uses the app-wide helper so the match-window ranges
// shown beside Stage 2 and Stage 4 render in the same DD/MM/YYYY format
// as the rest of the app. The DeadlineBadge component below has its
// own formatter for the date+time line; both flow from
// src/lib/utils/dates.ts.
import { formatPacificDate } from "@/lib/utils/dates";

interface AboutViewProps {
  pool: Pool;
  /** Earliest scheduled_at across all group-phase matches (ISO string). */
  groupRangeStart: string | null;
  /** Latest scheduled_at across all group-phase matches (ISO string). */
  groupRangeEnd: string | null;
  /** Earliest scheduled_at across all knockout matches (ISO string). */
  knockoutRangeStart: string | null;
  /** Latest scheduled_at across all knockout matches (ISO string). */
  knockoutRangeEnd: string | null;
  scoring: { phase: MatchPhase; label: string; points: number }[];
}

// ----------------------------------------------------------------------------
// Date range helper
// ----------------------------------------------------------------------------

/**
 * Render a match-window date range as "DD/MM/YYYY – DD/MM/YYYY" (or a
 * single date if both ends fall on the same calendar day, or
 * "Not yet scheduled" if either side is missing).
 *
 * The individual dates flow through the shared formatPacificDate so they
 * match every other date in the app.
 */
function formatDateRange(
  startIso: string | null,
  endIso: string | null
): string {
  const start = formatPacificDate(startIso);
  const end = formatPacificDate(endIso);
  if (!start || !end) return "Not yet scheduled";
  if (start === end) return start;
  return `${start} – ${end}`;
}

// ----------------------------------------------------------------------------
// Prose rendering helper
// ----------------------------------------------------------------------------

/**
 * Render an admin-authored block of prose. Splits on blank lines so
 * an admin can compose multi-paragraph copy inside a single textarea
 * and get visually separate <p> blocks on render. Leading/trailing
 * whitespace is trimmed and empty paragraphs are dropped so a
 * trailing newline doesn't produce a hanging blank paragraph.
 *
 * `className` is applied to each rendered paragraph so the caller
 * controls the tone (primary text vs secondary text vs muted footer).
 */
function ProseBlock({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  // Normalise Windows line endings, then split on one-or-more blank
  // lines. The non-empty filter handles input like "para\n\n\npara2"
  // gracefully.
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return null;

  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i} className={className}>
          {para}
        </p>
      ))}
    </>
  );
}

// ----------------------------------------------------------------------------
// View
// ----------------------------------------------------------------------------

export function AboutView({
  pool,
  groupRangeStart,
  groupRangeEnd,
  knockoutRangeStart,
  knockoutRangeEnd,
  scoring,
}: AboutViewProps) {
  // Match-schedule date ranges per stage. (Cutoff dates flow through
  // DeadlineBadge directly, so no helper-formatting needed here.)
  const groupGamesRange = formatDateRange(groupRangeStart, groupRangeEnd);
  const knockoutGamesRange = formatDateRange(
    knockoutRangeStart,
    knockoutRangeEnd
  );

  // Footer only renders when the admin has actually written copy.
  // Empty string is the migration default — no need for a separate
  // toggle column.
  const footerText = pool.about_footer_text.trim();
  // Same treatment for the Payout body: even if the section toggle
  // is on, render nothing if there's no copy to show. Guards against
  // a blank "Payout" header sitting alone on the page.
  const payoutText = pool.about_payout_text.trim();

  return (
    <div className="space-y-8">
      {/* -------------------------------------------------------------- */}
      {/* Header                                                          */}
      {/* -------------------------------------------------------------- */}
      <div>
        <h1 className="text-2xl font-display font-bold">About this pool</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {pool.name}
        </p>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Overview header text                                            */}
      {/* -------------------------------------------------------------- */}
      <section className="space-y-3">
        <ProseBlock
          text={pool.about_header_text}
          className="text-sm leading-relaxed text-[var(--color-text)]"
        />
      </section>

      {/* -------------------------------------------------------------- */}
      {/* Stages (toggleable)                                             */}
      {/* -------------------------------------------------------------- */}
      {pool.about_show_stages && (
        <section className="space-y-3">
          <h2 className="text-lg font-display font-bold">The four stages</h2>

          {/* Intro paragraph above the stage tiles. */}
          <ProseBlock
            text={pool.about_stages_intro_text}
            className="text-sm leading-relaxed text-[var(--color-text-secondary)]"
          />

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
            {/* Stage 1 — Group Phase picking. The hard cutoff is the only
                date shown; gets a prominent DeadlineBadge with countdown. */}
            <StageRow
              number={1}
              title="Group Phase picking"
              description={pool.about_stage1_text}
              badges={
                <DeadlineBadge
                  iso={pool.group_lock_at}
                  label="Picks lock"
                  pastLabel="Locked"
                />
              }
            />

            {/* Stage 2 — Group Phase matches. This is a date *window*, not a
                cutoff, so no countdown badge — just the calendar range. */}
            <StageRow
              number={2}
              title="Group Phase matches"
              dateLabel="Match dates"
              dateValue={groupGamesRange}
              description={pool.about_stage2_text}
            />

            {/* Stage 3 — Knockout Bracket picking. Two cutoffs to surface:
                when the picker opens AND when it locks. Two badges side by
                side; both get countdowns until they pass. */}
            <StageRow
              number={3}
              title="Knockout Bracket picking"
              description={pool.about_stage3_text}
              badges={
                <>
                  <DeadlineBadge
                    iso={pool.knockout_open_at}
                    label="Picking opens"
                    pastLabel="Open"
                  />
                  <DeadlineBadge
                    iso={pool.knockout_lock_at}
                    label="Picks lock"
                    pastLabel="Locked"
                  />
                </>
              }
            />

            {/* Stage 4 — Knockout Round matches. Same as Stage 2: a date
                window, not a cutoff. */}
            <StageRow
              number={4}
              title="Knockout Round matches"
              dateLabel="Match dates"
              dateValue={knockoutGamesRange}
              description={pool.about_stage4_text}
            />
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Scoring (toggleable)                                            */}
      {/* -------------------------------------------------------------- */}
      {pool.about_show_scoring && (
        <section className="space-y-3">
          <h2 className="text-lg font-display font-bold">Scoring</h2>

          <ProseBlock
            text={pool.about_scoring_text}
            className="text-sm leading-relaxed text-[var(--color-text-secondary)]"
          />

          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Points per correct pick by stage:
          </p>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Stage</th>
                  <th className="text-right px-4 py-2 font-medium">
                    Points per correct pick
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {scoring.map((row) => (
                  <tr key={row.phase}>
                    <td className="px-4 py-2">{row.label}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Payout (toggleable, also self-hides on empty copy)              */}
      {/* -------------------------------------------------------------- */}
      {pool.about_show_payout && payoutText.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-display font-bold">Payout</h2>
          <ProseBlock
            text={payoutText}
            className="text-sm leading-relaxed text-[var(--color-text-secondary)]"
          />
        </section>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Footer (renders only when admin has authored copy)              */}
      {/* -------------------------------------------------------------- */}
      {footerText.length > 0 && (
        <section className="space-y-3">
          <ProseBlock
            text={footerText}
            className="text-xs text-[var(--color-text-muted)] leading-relaxed"
          />
        </section>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Stage row
// ----------------------------------------------------------------------------
//
// Two flavours, picked by which props the caller passes:
//   - `badges`   → cutoff-based stage. Shows DeadlineBadge(s) prominently.
//   - `dateLabel + dateValue`  → window-based stage. Shows a small text
//     range in the corner like before.
//
// Either flavour can be used per row; the row layout falls back gracefully
// when neither is provided (description-only).
//
// `description` is now a plain string of admin-authored prose. It's
// rendered through ProseBlock so multi-paragraph copy splits on blank
// lines into separate <p>s, the same way the page-level header/intro
// blocks do.

function StageRow({
  number,
  title,
  dateLabel,
  dateValue,
  description,
  badges,
}: {
  number: number;
  title: string;
  dateLabel?: string;
  dateValue?: string;
  description: string;
  badges?: React.ReactNode;
}) {
  return (
    <div className="p-4 flex gap-4">
      {/* Numbered circle. Matches the "phase pill" colour palette used on
          the My Picks dashboard so the four stages here read as the same
          four phases referenced elsewhere in the app. */}
      <div
        className="shrink-0 w-8 h-8 rounded-full bg-pitch-100 text-pitch-700 font-bold text-sm flex items-center justify-center"
        aria-hidden="true"
      >
        {number}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Title row. For window-flavour stages, the small date-range text
            sits in the right corner here as before. Cutoff-flavour stages
            leave this corner empty and put their badges in the dedicated
            row below. */}
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="font-display font-semibold">{title}</h3>
          {dateLabel && dateValue && (
            <span className="text-xs text-[var(--color-text-muted)]">
              <span className="font-medium">{dateLabel}:</span> {dateValue}
            </span>
          )}
        </div>

        {/* Description prose. */}
        <ProseBlock
          text={description}
          className="text-sm text-[var(--color-text-secondary)] leading-relaxed"
        />

        {/* Cutoff badges, if any. flex-wrap so two badges in Stage 3 stack
            cleanly on narrow viewports. */}
        {badges && (
          <div className="flex flex-wrap gap-2 pt-1">{badges}</div>
        )}
      </div>
    </div>
  );
}
