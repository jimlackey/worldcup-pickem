"use client";

import { cn } from "@/lib/utils/cn";
import { formatPacificDateTime } from "@/lib/utils/dates";

/**
 * Static, always-gray companion to DeadlineBadge used on the My Picks
 * dashboard's phase row.
 *
 * DeadlineBadge is the "live" tile: it counts down to a future cutoff and
 * tints itself green/orange/red by urgency. PhaseTile is its inert
 * sibling — it never counts down and always renders in the muted "passed"
 * gray. It's used for the tiles that describe a phase the player can't act
 * on right now:
 *
 *   • a locked phase (e.g. "Group picks" once group_lock_at has passed),
 *     where there's no countdown to show — just a "Locked" status; or
 *   • an upcoming phase (e.g. "Knockout picking opens") that the player
 *     can see is coming but can't engage with yet, shown with its date so
 *     they know when to come back.
 *
 * Dimensions, padding, label treatment and the label+pill top row all
 * match DeadlineBadge so a PhaseTile and a DeadlineBadge sit side by side
 * as a visually consistent pair.
 */
export function PhaseTile({
  label,
  status,
  iso,
}: {
  /** Top-row label, e.g. "Group picks" or "Knockout picking opens". */
  label: string;
  /**
   * Short status word shown in the pill, e.g. "Locked" or "Upcoming".
   * Mirrors the countdown/past-label pill position on DeadlineBadge.
   */
  status: string;
  /**
   * Optional date to show on the bottom row. When provided it's rendered
   * in the same DD/MM/YYYY HH:MM PT format as DeadlineBadge. When omitted
   * (e.g. a locked phase with no meaningful date to surface), the bottom
   * row shows a muted dash so the tile keeps DeadlineBadge's two-row
   * height and the row doesn't look ragged.
   */
  iso?: string | null;
}) {
  const formattedDate = iso ? (formatPacificDateTime(iso) ?? iso) : null;

  return (
    <div
      className={cn(
        "inline-flex flex-col gap-1 rounded-lg border px-3 py-2 min-w-[180px]",
        // Always the muted "passed" treatment — same tokens DeadlineBadge
        // uses for its passed tier so the gray reads identically.
        "border-[var(--color-border)] bg-[var(--color-surface-raised)]"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {label}
        </span>
        <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full border tabular-nums whitespace-nowrap bg-gray-100 text-gray-600 border-gray-200">
          {status}
        </span>
      </div>

      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          formattedDate
            ? "text-[var(--color-text)]"
            : "text-[var(--color-text-muted)]"
        )}
      >
        {formattedDate ?? "—"}
      </span>
    </div>
  );
}
