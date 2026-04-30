"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

interface DeadlineBadgeProps {
  /**
   * The cutoff date as an ISO string. May be null when the pool admin
   * hasn't set this date yet — in that case we render a muted "not set"
   * placeholder.
   */
  iso: string | null | undefined;
  /**
   * Short human label that sits at the top of the badge — e.g.
   * "Picks lock" or "Picking opens". Keeps the badge self-describing
   * without forcing the surrounding row to repeat the date label twice.
   */
  label: string;
  /**
   * Optional short text shown when the deadline has already passed.
   * Defaults to "Closed" — fine for hard cutoffs. For an "opens at" badge
   * a caller may want to pass "Opened" instead so the past-tense reads
   * naturally.
   */
  pastLabel?: string;
}

// ----------------------------------------------------------------------------
// Time-until helpers
// ----------------------------------------------------------------------------

/**
 * Bucket the remaining ms into the most-significant two units. We want the
 * countdown to feel calm at large distances ("5d 3h") and precise as it
 * approaches zero ("12m 34s"), without ever flashing a third unit on the
 * row that would make the layout dance.
 *
 * Strategy:
 *   ≥ 1 day   →  "Xd Yh"
 *   ≥ 1 hour  →  "Xh Ym"
 *   ≥ 1 min   →  "Xm Ys"
 *   < 1 min   →  "Ys"
 */
function formatRemaining(ms: number): string {
  if (ms <= 0) return "now";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  if (minutes >= 1) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Format a UTC ISO timestamp as a Pacific-Time date+time, e.g.
 *   "Jun 11, 2026, 1:00 PM PT"
 *
 * Mirrors the shape used elsewhere in the app for hard cutoffs so the user
 * sees a consistent date rendering whether they're on the About page, the
 * My Picks dashboard, or admin/settings.
 */
function formatPacificDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (
    date.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " PT"
  );
}

// ----------------------------------------------------------------------------
// Color tiers
// ----------------------------------------------------------------------------
//
// The badge picks one of four visual states from the existing design tokens.
// Past dates collapse to a neutral gray so they recede; future dates are
// tinted by urgency so a deadline that's hours away is impossible to miss.
//
//   passed         →  gray   (recede; the deadline is already history)
//   future, > 24h  →  pitch  (calm green — "you have time")
//   future, ≤ 24h  →  orange (warning — getting close)
//   future, ≤ 1h   →  red    (urgent — final hour)
//
// Color picks are constrained by what the existing dark-mode block in
// globals.css already overrides. pitch-50/100, orange-100, red-50/100 are
// covered; orange-50 is not — see the warning tier comment below for how
// we work around it.

type Tier = "passed" | "calm" | "warning" | "urgent";

function tierFor(remainingMs: number | null): Tier {
  if (remainingMs === null || remainingMs <= 0) return "passed";
  const HOUR = 3600 * 1000;
  if (remainingMs <= 1 * HOUR) return "urgent";
  if (remainingMs <= 24 * HOUR) return "warning";
  return "calm";
}

const TIER_STYLES: Record<Tier, { container: string; pill: string }> = {
  passed: {
    container:
      "border-[var(--color-border)] bg-[var(--color-surface-raised)]",
    pill: "bg-gray-100 text-gray-600 border-gray-200",
  },
  calm: {
    // Slight green wash via pitch-50 — has explicit dark-mode handling in
    // globals.css, so it remains readable in both color schemes.
    container: "border-pitch-200 bg-pitch-50",
    pill: "bg-pitch-100 text-pitch-700 border-pitch-200",
  },
  warning: {
    // Plain raised surface for the container (orange-50 has no dark-mode
    // override in globals.css, so it'd be too bright on a dark theme); the
    // colored pill carries the urgency signal.
    container:
      "border-orange-200 bg-[var(--color-surface-raised)]",
    pill: "bg-orange-100 text-orange-700 border-orange-200",
  },
  urgent: {
    // bg-red-50 IS handled in globals.css's dark-mode block, so it's safe
    // to use. Red border + red pill make this badge unmissable when the
    // deadline is within an hour.
    container: "border-red-200 bg-red-50",
    pill: "bg-red-100 text-red-700 border-red-200",
  },
};

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export function DeadlineBadge({
  iso,
  label,
  pastLabel = "Closed",
}: DeadlineBadgeProps) {
  // Hydration-safe: countdown stays null until the client mounts. Server
  // render and first client render produce identical markup (just the
  // formatted date, no countdown), then the client takes over and starts
  // ticking. Without this, useState(Date.now()) would diff between SSR
  // and client and React would warn about mismatched HTML.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!iso) return;
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) return;

    const update = () => setRemainingMs(target - Date.now());
    update();

    // 1-second cadence is fine — formatRemaining only changes once per
    // second below the 1-minute threshold, and once per minute above it.
    // This keeps the implementation simple and the CPU cost negligible.
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [iso]);

  // No date set — render a muted placeholder so the badge slot is still
  // visually present and the row doesn't reflow once an admin sets the
  // date.
  if (!iso) {
    return (
      <div
        className={cn(
          "inline-flex flex-col gap-0.5 rounded-lg border px-3 py-2 min-w-[140px]",
          "border-dashed border-[var(--color-border)] bg-[var(--color-surface-raised)]"
        )}
      >
        <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </span>
        <span className="text-sm font-medium text-[var(--color-text-muted)]">
          Not yet scheduled
        </span>
      </div>
    );
  }

  const tier = tierFor(remainingMs);
  const styles = TIER_STYLES[tier];
  const isFuture = remainingMs !== null && remainingMs > 0;

  // Pre-mount, the countdown hasn't computed yet (remainingMs is null).
  // Rather than render in "passed" gray and then flash to green/orange/red
  // when the effect lands, we hold the container in a neutral state until
  // we know the real tier. The pill below shows "—" during this window
  // so it's clear the badge is still rendering.
  const containerClass =
    remainingMs === null
      ? "border-[var(--color-border)] bg-[var(--color-surface)]"
      : styles.container;

  return (
    <div
      className={cn(
        "inline-flex flex-col gap-1 rounded-lg border px-3 py-2 min-w-[180px]",
        containerClass
      )}
    >
      {/* Top row: label + status pill. The status pill carries the
          countdown when the date is in the future, or "Closed" / "Opened"
          when it's already passed. The pill is what makes the badge feel
          "alive" — it's the eye-catching part. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {label}
        </span>
        <span
          className={cn(
            "text-2xs font-bold px-1.5 py-0.5 rounded-full border tabular-nums whitespace-nowrap",
            styles.pill
          )}
        >
          {/* SSR / pre-mount: no countdown yet, so show the muted "—"
              placeholder. After mount, remainingMs is non-null and we
              show either the live countdown or the past-label. */}
          {remainingMs === null ? "—" : isFuture ? `in ${formatRemaining(remainingMs)}` : pastLabel}
        </span>
      </div>

      {/* Bottom row: the actual date+time, in Pacific Time. This is the
          authoritative value users will write down or copy into their
          calendar. The countdown above is a glance value; this is the
          fact value. */}
      <span className="text-sm font-semibold text-[var(--color-text)] tabular-nums">
        {formatPacificDateTime(iso)}
      </span>
    </div>
  );
}
