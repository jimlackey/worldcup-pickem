import type { Pool, MatchPhase } from "@/types/database";
import type { PaymentConfig } from "@/lib/payments/config-queries";
import { formatCents } from "@/lib/utils/money";
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
  /**
   * The pool's Payment Config (migration 025) — entry/consolation fees
   * plus the payout schedule (places + percents). Drives the new
   * payout grid inside the Payout section.
   */
  paymentConfig: PaymentConfig;
  /**
   * Number of paid pick sets in the pool (pool_payments.is_paid = TRUE).
   * The Payout grid's total pot is paidPickSetCount * entry_fee_cents.
   */
  paidPickSetCount: number;
  /**
   * Number of pick sets the admin has marked as having paid the
   * optional 3rd-place buy-in (pool_payments.is_third_place_paid =
   * TRUE). Drives the consolation pot in the Payout section when
   * consolation_mode = 'preseason_pick'. Mirrors paidPickSetCount's
   * paid-only basis so the two pots are computed consistently. (Name
   * predates the switch from counting selections to counting paid
   * status.)
   */
  consolationPickCount: number;
  /**
   * True once the group phase has locked. Until then, the Payout grid
   * shows only the place + percent columns and leaves the amount
   * column blank (per spec); the consolation row is hidden entirely.
   */
  groupLocked: boolean;
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
 * Render an admin-authored block of content for the About page.
 *
 * About copy is authored ONLY by a pool's own admin (the
 * /{slug}/admin/about form is gated to session.role === "admin"), so
 * the content is trusted — this renderer intentionally allows raw HTML,
 * the same trust model the email widgets already use for admin-authored
 * templates. It is NOT user-generated content from arbitrary players.
 *
 * Rendering rules (chosen so existing plain-prose copy keeps rendering
 * exactly as before, while HTML now works too):
 *
 *   1. Split on blank lines into blocks, same as the previous
 *      implementation — an admin can still compose multi-paragraph copy
 *      in a single textarea and get separate paragraphs.
 *   2. A block that "looks like a block-level HTML element" (starts with
 *      "<" and ends with ">" after trimming — e.g. a pasted
 *      <ul>…</ul>, <table>…</table>, or <div>…</div>) is emitted RAW,
 *      with no <p> wrapper. Wrapping a <table> in a <p> would be invalid
 *      HTML, and the admin controls their own block styling in that case.
 *   3. Any other block is wrapped in a <p className={className}> so it
 *      inherits the caller's tone (primary / secondary / muted), with
 *      single newlines converted to <br>. Inline HTML inside it
 *      (<strong>, <em>, <a>, …) renders because the content is injected
 *      via dangerouslySetInnerHTML rather than escaped.
 *
 * Empty blocks are dropped so a trailing newline doesn't leave a hanging
 * blank paragraph; an all-empty input renders nothing.
 *
 * `className` is applied to each wrapped paragraph so the caller controls
 * the tone (primary text vs secondary text vs muted footer).
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
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block, i) => {
        // Block-level HTML (e.g. a list or table): emit raw, no <p>
        // wrapper. We render it inside a plain <div> carrying
        // dangerouslySetInnerHTML so React can mount the markup.
        const isHtmlBlock = block.startsWith("<") && block.endsWith(">");
        if (isHtmlBlock) {
          return (
            <div
              key={i}
              className="about-html-block"
              dangerouslySetInnerHTML={{ __html: block }}
            />
          );
        }

        // Plain / inline-HTML paragraph: keep the caller's tone class,
        // convert single newlines to <br>, and inject as HTML so inline
        // tags render.
        const withBreaks = block.replace(/\n/g, "<br>");
        return (
          <p
            key={i}
            className={className}
            dangerouslySetInnerHTML={{ __html: withBreaks }}
          />
        );
      })}
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
  paymentConfig,
  paidPickSetCount,
  consolationPickCount,
  groupLocked,
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
    <div className="space-y-8 about-content">
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
      {/* The Payout section now renders when EITHER:                    */}
      {/*   - the admin has authored prose text, OR                       */}
      {/*   - the admin has configured a payout schedule                  */}
      {/*     (payout_winner_count > 0).                                  */}
      {/* That way an admin who only fills in the structured Payment      */}
      {/* Config (migration 025) still gets a visible payout block on    */}
      {/* the About page; an admin who wrote prose but didn't configure  */}
      {/* the grid keeps the old behaviour.                               */}
      {pool.about_show_payout &&
        (payoutText.length > 0 ||
          paymentConfig.winnerCount > 0 ||
          paymentConfig.entryFeeCents > 0) && (
          <section className="space-y-3">
            <h2 className="text-lg font-display font-bold">Payout</h2>
            {payoutText.length > 0 && (
              <ProseBlock
                text={payoutText}
                className="text-sm leading-relaxed text-[var(--color-text-secondary)]"
              />
            )}

            {/* Buy-in table. Sits ABOVE the "Payout schedule:" grid and
                mirrors its chrome (same bordered card, same header). Shows
                the Tourney buy-in (Entry Fee) and — only when the pool has
                the optional 3rd-place selection enabled and a non-zero
                consolation fee — the 3rd-place buy-in. The component
                self-hides when there's no Tourney buy-in to show (entry
                fee is 0 / "not set"), so a pool with no buy-in never
                renders an empty table. */}
            <BuyInTable
              entryFeeCents={paymentConfig.entryFeeCents}
              consolationFeeCents={paymentConfig.consolationFeeCents}
              showConsolationRow={pool.consolation_mode === "preseason_pick"}
            />

            {paymentConfig.winnerCount > 0 && (
              <PayoutGrid
                paymentConfig={paymentConfig}
                paidPickSetCount={paidPickSetCount}
                groupLocked={groupLocked}
              />
            )}

            {/* Consolation (Pre-Tournament 3rd Place Selection) summary.
                Winner-take-all side pool — rendered as a single-row
                table that visually mirrors the main Payout grid above
                (same header chrome, same column shape) so the reader
                parses the two as related schedules. The percent column
                is a fixed 100% (winner-take-all is structural; no
                grid needed to express it), and the data cells fall
                back to "—" with a "TBD" footer line before the group
                phase locks.
                Renders whenever the pool is in preseason_pick mode,
                with or without group lock — the in-component
                groupLocked gate handles pre-lock placeholders. */}
            {pool.consolation_mode === "preseason_pick" && (
              <ConsolationPayoutTable
                consolationFeeCents={paymentConfig.consolationFeeCents}
                consolationPickCount={consolationPickCount}
                groupLocked={groupLocked}
              />
            )}
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

// ----------------------------------------------------------------------------
// Buy-in table
// ----------------------------------------------------------------------------
//
// A small table at the top of the Payout section showing what it costs
// to enter. Mirrors the PayoutGrid / ConsolationPayoutTable chrome (same
// bordered card, same header treatment) so it reads as part of the same
// family of tables. Two columns — a label and the dollar amount — and
// up to two rows:
//
//   Buy-in                         Amount
//   Tournament buy-in              $20.00
//   Optional 3rd-place pick buy-in $5.00   (only when enabled)
//
// VISIBILITY RULES (per spec)
//   - If there's no tournament buy-in (entryFeeCents === 0, i.e. "not
//     set"), the whole table is hidden — there's nothing to show.
//   - The 3rd-place row only appears when the pool has the optional
//     3rd-place selection enabled (consolation_mode = 'preseason_pick')
//     AND a non-zero consolation fee. Otherwise the table is just the
//     single Tournament buy-in row.
//
// The fees come straight from the pool's Payment Config (Admin →
// Settings: "Entry Fee" and "Consolation Fee"). Unlike the payout/
// consolation pots below, the buy-in is a fixed price, so there's no
// group-lock gate or participant math here — it's the same value before
// and after lock.

function BuyInTable({
  entryFeeCents,
  consolationFeeCents,
  showConsolationRow,
}: {
  entryFeeCents: number;
  consolationFeeCents: number;
  showConsolationRow: boolean;
}) {
  // No tournament buy-in configured → nothing to show.
  if (entryFeeCents <= 0) return null;

  // The 3rd-place row only renders when the feature is enabled AND a
  // real fee is set; a $0 consolation fee with the feature on is treated
  // as "not set" for display purposes, same as the tournament fee.
  const showConsolation = showConsolationRow && consolationFeeCents > 0;

  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
        Buy-in:
      </p>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Buy-in</th>
              <th className="text-right px-4 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            <tr>
              <td className="px-4 py-2">Tournament buy-in</td>
              <td className="px-4 py-2 text-right font-medium tabular-nums">
                {formatCents(entryFeeCents)}
              </td>
            </tr>
            {showConsolation && (
              <tr>
                <td className="px-4 py-2">Optional 3rd-place pick buy-in</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">
                  {formatCents(consolationFeeCents)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Payout grid (migration 025 + this delivery)
// ----------------------------------------------------------------------------
//
// Renders one row per configured payout place:
//
//   Place  | Payout %  | Amount
//   1st    | 50%       | $300 (or "—" pre-lock)
//   2nd    | 30%       | $180
//   3rd    | 20%       | $120
//
// "Amount" math: pot = paidPickSetCount * entry_fee_cents.
// Per-place: pot * percent / 100, rounded down to whole cents so the
// sum of paid amounts never exceeds the pot (a half-cent overshoot
// would be uncollectable in any real payout). The "leftover cents"
// from rounding (typically 0–N-1 cents) is left in the pot — that
// matches how most pool admins distribute remainders informally.
//
// PRE-LOCK BEHAVIOUR
// ------------------
// Until the group phase locks, the Amount column shows "—" instead
// of dollars. The spec is: "show the percentage but leave the
// amounts blank." Rendering a dash rather than truly empty keeps
// the column width stable across pre- and post-lock renders, and
// signals "this will populate later" more clearly than a blank cell.
// The footer line below the table also adapts: pre-lock shows just
// "Total pool TBD"; post-lock shows the actual pot.
//
// EDGE CASES
// ----------
// - paidPickSetCount = 0 post-lock → pot = $0 → every row shows $0.
//   That's the correct answer: there's nothing to distribute, and
//   the page shouldn't pretend otherwise.
// - winnerCount = 0 → this component isn't rendered at all (the
//   parent guards on paymentConfig.winnerCount > 0).

function PayoutGrid({
  paymentConfig,
  paidPickSetCount,
  groupLocked,
}: {
  paymentConfig: { entryFeeCents: number; payouts: { place: number; percent: number }[] };
  paidPickSetCount: number;
  groupLocked: boolean;
}) {
  const potCents = paymentConfig.entryFeeCents * paidPickSetCount;

  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
        Payout schedule:
      </p>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Place</th>
              <th className="text-right px-4 py-2 font-medium">Payout %</th>
              <th className="text-right px-4 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {paymentConfig.payouts.map((row) => {
              // Floor-divide cents to keep the sum ≤ pot. Leftover
              // cents stay in the pool; nobody gets a "$0.005" share.
              const amountCents = Math.floor(
                (potCents * row.percent) / 100
              );
              return (
                <tr key={row.place}>
                  <td className="px-4 py-2 tabular-nums">{ordinal(row.place)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.percent}%
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {groupLocked ? (
                      formatCents(amountCents)
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Pool summary line beneath the grid. Two flavours:
          - Pre-lock: only the percentages are meaningful, so we tell
            the reader the pool size is "TBD until picks lock".
          - Post-lock: surface the actual numbers so the per-place
            amounts above are interpretable. ("Pool = $20 × 30 paid
            pick sets = $600.") */}
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
        {groupLocked ? (
          <>
            Total pool:{" "}
            <span className="tabular-nums font-medium text-[var(--color-text-secondary)]">
              {formatCents(potCents)}
            </span>{" "}
            ({formatCents(paymentConfig.entryFeeCents)} entry fee ×{" "}
            <span className="tabular-nums">{paidPickSetCount}</span> paid pick
            set{paidPickSetCount === 1 ? "" : "s"})
          </>
        ) : (
          <>
            Total pool TBD — amounts populate after the Group Phase locks.
          </>
        )}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Consolation payout table
// ----------------------------------------------------------------------------
//
// Winner-take-all side pool for the optional Pre-Tournament 3rd-Place
// pick (consolation_mode = 'preseason_pick'). Rendered as a single-row
// table that mirrors the main PayoutGrid above — same border / header /
// column layout — so the reader perceives the two as members of one
// schedule rather than two unrelated widgets.
//
// COLUMN SHAPE
//   Place     | Payout %    | Amount
//   3rd       | 100%        | $100  (or "—" pre-lock)
//
// The "Place" cell reads "Consolation Winner" rather than just "1" because there's
// only ever one row in this table and it represents the 3rd-place
// finisher in the tournament — the matched pick from the player's
// pre-tournament selection. Calling it "1st" would conflict with the
// main payout's 1st-place row above.
//
// The percent column is the static literal "100%" — winner-take-all
// is structural for this side pool, not configurable, so we don't
// pass it as data. Hardcoding here keeps the component honest about
// what it represents.
//
// PRE-LOCK BEHAVIOUR
// ------------------
// Per spec: TBD placeholders before the group phase locks. The Amount
// cell shows "—" (same mute treatment as the main grid pre-lock) and
// the footer line below the table reads "Pool TBD …" rather than the
// "$X buy-in × N picks" summary. The Place + Payout % columns stay
// fully filled at all times — they're structural and don't depend on
// participation data.
//
// EDGE CASES
// ----------
// - consolationPickCount = 0 post-lock → pot = $0. The table still
//   renders (the section is meaningful even if nobody is marked paid)
//   and shows $0 / "0 paid 3rd-place picks". Better than vanishing the section,
//   which would silently hide a configured feature from the reader.

function ConsolationPayoutTable({
  consolationFeeCents,
  consolationPickCount,
  groupLocked,
}: {
  consolationFeeCents: number;
  consolationPickCount: number;
  groupLocked: boolean;
}) {
  const potCents = consolationFeeCents * consolationPickCount;

  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
        3rd Place Consolation (winner-take-all):
      </p>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Place</th>
              <th className="text-right px-4 py-2 font-medium">Payout %</th>
              <th className="text-right px-4 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            <tr>
              <td className="px-4 py-2 tabular-nums">Consolation Winner</td>
              <td className="px-4 py-2 text-right tabular-nums">100%</td>
              <td className="px-4 py-2 text-right font-medium tabular-nums">
                {groupLocked ? (
                  formatCents(potCents)
                ) : (
                  <span className="text-[var(--color-text-muted)]">—</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* Footer line — mirrors the main PayoutGrid's footer treatment.
          Pre-lock: an explicit "TBD" note pointing at the gate. Post-lock:
          the actual math so the Amount cell above is interpretable
          ("$5 buy-in × 20 picks = $100"). */}
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
        {groupLocked ? (
          <>
            Pool:{" "}
            <span className="tabular-nums font-medium text-[var(--color-text-secondary)]">
              {formatCents(potCents)}
            </span>{" "}
            ({formatCents(consolationFeeCents)} buy-in ×{" "}
            <span className="tabular-nums">{consolationPickCount}</span>{" "}
            paid 3rd-place pick{consolationPickCount === 1 ? "" : "s"})
          </>
        ) : (
          <>
            Pool TBD — amount populates after the Group Phase locks.
          </>
        )}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Ordinal — "1st", "2nd", "3rd", "4th"...
// ----------------------------------------------------------------------------
//
// Duplicated from payment-config-form.tsx rather than imported because
// the admin form component lives in a separate "use client" tree and
// pulling in client code from a server component (this file) would
// drag the whole client bundle in. The helper is two-line cheap.

function ordinal(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  if (lastOne === 1) return `${n}st`;
  if (lastOne === 2) return `${n}nd`;
  if (lastOne === 3) return `${n}rd`;
  return `${n}th`;
}
