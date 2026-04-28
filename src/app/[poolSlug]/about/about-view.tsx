import type { Pool, MatchPhase } from "@/types/database";

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
 * Format a UTC ISO timestamp as a Pacific-Time date+time, e.g.
 *   "Jun 11, 2026, 9:00 AM PT"
 *
 * Used for picking-window deadlines (group_lock_at, knockout_open_at,
 * knockout_lock_at) where the precise moment matters because it's a hard
 * cutoff that affects the user.
 */
function formatPacificDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (
    date.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " PT"
  );
}

/**
 * Format a UTC ISO timestamp as a Pacific-Time date only, e.g.
 *   "Jun 11, 2026"
 *
 * Used for match-schedule date ranges, where time-of-day across many
 * matches in a stage isn't meaningful — readers want to know which
 * calendar dates the round runs from/to.
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
  // Picking-window deadlines (precise time of day matters here).
  const groupLockText = formatPacificDateTime(pool.group_lock_at);
  const knockoutOpenText = formatPacificDateTime(pool.knockout_open_at);
  const knockoutLockText = formatPacificDateTime(pool.knockout_lock_at);

  // Match-schedule date ranges per stage.
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
          <StageRow
            number={1}
            title="Group Phase picking"
            dateLabel="Picks lock"
            dateValue={groupLockText ?? "Not yet scheduled"}
            description={
              <>
                Pick a winner (or draw) for all 72 group-stage matches. You
                can create multiple pick sets up to your pool&apos;s limit
                and edit them as often as you like until the lock time. Once
                the deadline passes, group picks are frozen for the rest of
                the tournament.
              </>
            }
          />

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

          <StageRow
            number={3}
            title="Knockout Bracket picking"
            dateLabel="Picking opens / locks"
            dateValue={
              knockoutOpenText && knockoutLockText
                ? `${knockoutOpenText} → ${knockoutLockText}`
                : knockoutOpenText
                  ? `Opens ${knockoutOpenText}`
                  : knockoutLockText
                    ? `Locks ${knockoutLockText}`
                    : "Not yet scheduled"
            }
            description={
              <>
                Once the group stage is finalised and the bracket is seeded,
                the knockout picker opens. Pick the winner for every match
                across all 31 knockout slots — Round of 32 through the Final.
                Like group picks, you can edit freely until the lock time;
                after that, your bracket is frozen.
              </>
            }
          />

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

function StageRow({
  number,
  title,
  dateLabel,
  dateValue,
  description,
}: {
  number: number;
  title: string;
  dateLabel: string;
  dateValue: string;
  description: React.ReactNode;
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

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="font-display font-semibold">{title}</h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            <span className="font-medium">{dateLabel}:</span> {dateValue}
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mt-1.5">
          {description}
        </p>
      </div>
    </div>
  );
}
