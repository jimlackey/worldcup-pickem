import type { Pool, MatchPhase } from "@/types/database";
import { DeadlineBadge } from "./deadline-badge";

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
// Date formatting helpers
// ----------------------------------------------------------------------------

/**
 * Format a UTC ISO timestamp as a Pacific-Time date only, e.g.
 *   "Jun 11, 2026"
 *
 * Used for match-schedule date ranges, where time-of-day across many
 * matches in a stage isn't meaningful — readers want to know which
 * calendar dates the round runs from/to. Cutoff dates use the more
 * detailed date+time renderer inside DeadlineBadge.
 */
function formatPacificDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
  });
}

/**
 * Render a date range as "Start – End" (or just "Start" if both fall on the
 * same calendar day, or "Not yet scheduled" if either side is missing).
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
      {/* Overview                                                        */}
      {/* -------------------------------------------------------------- */}
      <section className="space-y-3">
        <p className="text-sm leading-relaxed text-[var(--color-text)]">
          This is a World Cup pick&apos;em pool. Players make predictions for
          every match in the tournament — first for the group stage, then for
          the knockout bracket — and earn points for each correct pick.
          Standings update automatically as match results are entered, and
          the player with the most points at the end of the Final wins.
        </p>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          The pool runs in four stages: two for picking, two for playing.
          Pick deadlines are strict — once a stage locks, those picks can
          no longer be edited.
        </p>
      </section>

      {/* -------------------------------------------------------------- */}
      {/* Stages                                                          */}
      {/* -------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-lg font-display font-bold">The four stages</h2>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
          {/* Stage 1 — Group Phase picking. The hard cutoff is the only
              date shown; gets a prominent DeadlineBadge with countdown. */}
          <StageRow
            number={1}
            title="Group Phase picking"
            description={
              <>
                Pick a winner (or draw) for all 72 group-stage matches. You
                can create multiple pick sets up to your pool&apos;s limit
                and edit them as often as you like until the lock time. Once
                the deadline passes, group picks are frozen for the rest of
                the tournament.
              </>
            }
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
            description={
              <>
                The 12 groups play out their round-robin schedules. Each
                completed match is graded against your group picks and the
                points roll into the standings. While group games are
                underway, all players&apos; group picks become visible so you
                can see how you stack up against the rest of the pool.
              </>
            }
          />

          {/* Stage 3 — Knockout Bracket picking. Two cutoffs to surface:
              when the picker opens AND when it locks. Two badges side by
              side; both get countdowns until they pass. */}
          <StageRow
            number={3}
            title="Knockout Bracket picking"
            description={
              <>
                Once the group stage is finalised and the bracket is seeded,
                the knockout picker opens. Pick the winner for every match
                across all 31 knockout slots — Round of 32 through the Final.
                Like group picks, you can edit freely until the lock time;
                after that, your bracket is frozen.
              </>
            }
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
            description={
              <>
                The bracket plays out from R32 to the Final. Each completed
                knockout match is graded against your bracket picks. Points
                scale up as the rounds get later (see scoring below), so the
                Final is worth the most. After the Final, the player with the
                highest total wins the pool.
              </>
            }
          />
        </div>
      </section>

      {/* -------------------------------------------------------------- */}
      {/* Scoring                                                         */}
      {/* -------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-lg font-display font-bold">Scoring</h2>

        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          You earn points for every correct pick. Group-stage picks are
          graded as home win, draw, or away win. Knockout picks are graded
          on the team you picked to advance — if your pick wins the match,
          you score; if they lose (or have already been eliminated in an
          earlier round), you don&apos;t.
        </p>

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

        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Your total score is the sum of group-phase points and
          knockout-bracket points across all your graded picks. Standings are
          ranked by total points; ties are broken by the order players
          appear in the underlying data.
        </p>
      </section>
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
  description: React.ReactNode;
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
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {description}
        </p>

        {/* Cutoff badges, if any. flex-wrap so two badges in Stage 3 stack
            cleanly on narrow viewports. */}
        {badges && (
          <div className="flex flex-wrap gap-2 pt-1">{badges}</div>
        )}
      </div>
    </div>
  );
}
