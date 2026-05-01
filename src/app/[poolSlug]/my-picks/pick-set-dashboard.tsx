"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createPickSetAction } from "./actions";
import type { PickActionResult } from "./actions";
import type { Pool, PickSet, PoolSession } from "@/types/database";
import { cn } from "@/lib/utils/cn";
import { knockoutTotalCount } from "@/lib/picks/bracket-wiring";

interface PickSetDashboardProps {
  pool: Pool;
  session: PoolSession;
  pickSets: PickSet[];
  currentCount: number;
  groupPickCounts: Record<string, number>;
  knockoutPickCounts: Record<string, number>;
  groupPhaseOpen: boolean;
  knockoutPhaseOpen: boolean;
}

const initial: PickActionResult = { success: false };

// ----------------------------------------------------------------------------
// Date formatting helpers
// ----------------------------------------------------------------------------

/**
 * Format a UTC ISO timestamp as Pacific Time in `DD/MM/YYYY HH:mm PT` form.
 * "PT" is used (not PST/PDT) because the actual offset switches with DST and
 * the rest of the admin UI already labels its dates "Pacific Time".
 */
function formatPacificDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  // en-GB gives DD/MM/YYYY with a comma separator we strip.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Los_Angeles",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")} PT`;
}

// ----------------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------------

export function PickSetDashboard({
  pool,
  session,
  pickSets,
  currentCount,
  groupPickCounts,
  knockoutPickCounts,
  groupPhaseOpen,
  knockoutPhaseOpen,
}: PickSetDashboardProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [createState, createAction, createPending] = useActionState(
    createPickSetAction,
    initial
  );

  // Can only create new pick sets if group phase is still open AND under the limit
  const canCreate =
    groupPhaseOpen && currentCount < pool.max_pick_sets_per_player;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">My Pick Sets</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {session.displayName || session.email}
            {session.role === "admin" && (
              <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full bg-gold-100 text-gold-700">
                admin
              </span>
            )}
          </p>
        </div>

        {canCreate && !showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 transition-colors shrink-0 tap-target"
          >
            + New Pick Set
          </button>
        )}
      </div>

      {/* Phase status */}
      <div className="flex gap-3 text-xs flex-wrap">
        <span
          className={cn(
            "px-2.5 py-1 rounded-full font-medium",
            groupPhaseOpen
              ? "bg-pitch-100 text-pitch-700"
              : "bg-gray-100 text-gray-600"
          )}
        >
          Group picks: {groupPhaseOpen ? "Open" : "Locked"}
        </span>
        <span
          className={cn(
            "px-2.5 py-1 rounded-full font-medium",
            knockoutPhaseOpen
              ? "bg-pitch-100 text-pitch-700"
              : "bg-gray-100 text-gray-600"
          )}
        >
          Knockout:{" "}
          {knockoutPhaseOpen
            ? "Open"
            : pool.knockout_lock_at
              ? "Locked"
              : pool.knockout_open_at
                ? "Locked"
                : "Not open"}
        </span>
      </div>

      {/* Create form — only when group phase is open */}
      {showCreate && canCreate && (
        <form
          action={createAction}
          className="rounded-xl border border-pitch-200 bg-pitch-50/50 p-4 space-y-3"
        >
          <input type="hidden" name="poolId" value={pool.id} />
          <input type="hidden" name="poolSlug" value={pool.slug} />

          <label className="block text-sm font-medium">Pick set name</label>
          <input
            name="name"
            type="text"
            maxLength={50}
            required
            autoFocus
            placeholder="e.g. My Bold Picks"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />

          {createState.error && (
            <p className="text-sm text-red-600">{createState.error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createPending}
              className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
            >
              {createPending ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-md px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-[var(--color-text-muted)]">
            {currentCount} of {pool.max_pick_sets_per_player} pick sets used
          </p>
        </form>
      )}

      {/* Pick set cards */}
      <div className="space-y-3">
        {pickSets.map((ps) => (
          <PickSetCard
            key={ps.id}
            pickSet={ps}
            pool={pool}
            groupPickCount={groupPickCounts[ps.id] ?? 0}
            knockoutPickCount={knockoutPickCounts[ps.id] ?? 0}
            groupPhaseOpen={groupPhaseOpen}
            knockoutPhaseOpen={knockoutPhaseOpen}
          />
        ))}

        {pickSets.length === 0 && !showCreate && (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
            <p className="text-[var(--color-text-secondary)]">
              {groupPhaseOpen
                ? "No pick sets yet. Create one to start making picks."
                : knockoutPhaseOpen
                  ? "No pick sets found."
                  : "No pick sets yet."}
            </p>
          </div>
        )}
      </div>

      {canCreate && pickSets.length > 0 && (
        <p className="text-xs text-[var(--color-text-muted)] text-center">
          {currentCount} of {pool.max_pick_sets_per_player} pick sets used
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Card
// ----------------------------------------------------------------------------

function PickSetCard({
  pickSet,
  pool,
  groupPickCount,
  knockoutPickCount,
  groupPhaseOpen,
  knockoutPhaseOpen,
}: {
  pickSet: PickSet;
  pool: Pool;
  groupPickCount: number;
  knockoutPickCount: number;
  groupPhaseOpen: boolean;
  knockoutPhaseOpen: boolean;
}) {
  const groupTotal = 72;
  // Knockout total is now pool-driven (31 without consolation, 32 with)
  // so the progress bar denominator and the "X/Y" label both react to the
  // pool's bracket settings. See knockoutTotalCount() in bracket-wiring.ts.
  const knockoutTotal = knockoutTotalCount(pool);

  // ----- Phase derivation -----
  // Phase 1: Group picks open             — groupPhaseOpen && !knockoutPhaseOpen
  // Phase 2: Group games underway         — !groupPhaseOpen && !knockoutPhaseOpen && knockout hasn't opened yet
  // Phase 3: Knockout picks open          — !groupPhaseOpen && knockoutPhaseOpen
  // Phase 4: Knockout games underway      — !groupPhaseOpen && !knockoutPhaseOpen && knockout has been locked
  //
  // Phases 2 and 4 both have both phases "closed"; we distinguish them by
  // whether the knockout lock time has passed.
  const now = Date.now();
  const knockoutLocked =
    !!pool.knockout_lock_at && now >= new Date(pool.knockout_lock_at).getTime();

  const phase: 1 | 2 | 3 | 4 = groupPhaseOpen
    ? 1
    : knockoutPhaseOpen
      ? 3
      : knockoutLocked
        ? 4
        : 2;

  // ----- Progress bar values -----
  // Group bar: live count while open, last-saved count once locked.
  // Knockout bar: in phases 1 and 2 it's frozen at 0/{knockoutTotal} regardless
  // of any stray pre-opened data (spec says "always show 0 in pre-knockout
  // phases"). In phases 3 and 4 it reflects the real count.
  const knockoutDisplayCount = phase === 1 || phase === 2 ? 0 : knockoutPickCount;
  const groupProgress = Math.min(100, Math.round((groupPickCount / groupTotal) * 100));
  const knockoutProgress = Math.min(100, Math.round((knockoutDisplayCount / knockoutTotal) * 100));

  // ----- Button visibility -----
  //   Phase 1: Edit Group Picks
  //   Phase 2: View My Group Picks
  //   Phase 3: View My Group Picks + Edit Knockout Bracket
  //   Phase 4: View My Picks (single button to the combined detail page)
  const showEditGroup = phase === 1;
  const showEditKnockout = phase === 3;
  const showViewGroup = phase === 2 || phase === 3;
  const showViewAll = phase === 4;

  // ----- Label for the knockout bar in pre-knockout phases -----
  const knockoutAvailableLabel =
    phase === 1 || phase === 2
      ? pool.knockout_open_at
        ? `Available after ${formatPacificDateTime(pool.knockout_open_at)}`
        : "Available once the admin schedules the knockout round"
      : null;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display font-semibold">{pickSet.name}</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Created {new Date(pickSet.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-3">
        {/* Group progress — always show */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--color-text-secondary)]">Group picks</span>
            <span className="font-medium">
              {groupPickCount}/{groupTotal}
              {groupPickCount >= groupTotal && !groupPhaseOpen && (
                <span className="text-pitch-600 ml-1">✓</span>
              )}
            </span>
          </div>
          <div className="h-1.5 bg-[var(--color-surface-raised)] rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                groupPickCount >= groupTotal ? "bg-pitch-500" : "bg-pitch-400"
              )}
              style={{ width: `${groupProgress}%` }}
            />
          </div>
        </div>

        {/* Knockout progress — always shown now, even before knockout opens. */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--color-text-secondary)]">Knockout picks</span>
            <span className="font-medium">
              {knockoutDisplayCount}/{knockoutTotal}
              {knockoutDisplayCount >= knockoutTotal && !knockoutPhaseOpen && (
                <span className="text-pitch-600 ml-1">✓</span>
              )}
            </span>
          </div>
          <div className="h-1.5 bg-[var(--color-surface-raised)] rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                // In pre-knockout phases we deliberately gray the bar out so
                // an empty pitch-green bar doesn't imply "progress is live".
                phase === 1 || phase === 2
                  ? "bg-[var(--color-border)]"
                  : knockoutDisplayCount >= knockoutTotal
                    ? "bg-pitch-500"
                    : "bg-pitch-400"
              )}
              style={{ width: `${knockoutProgress}%` }}
            />
          </div>
          {knockoutAvailableLabel && (
            <p className="text-2xs text-[var(--color-text-muted)] mt-1">
              {knockoutAvailableLabel}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {showEditGroup && (
          <Link
            href={`/${pool.slug}/my-picks/${pickSet.id}`}
            className="rounded-md bg-pitch-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pitch-700 transition-colors tap-target"
          >
            {groupPickCount > 0 ? "Edit Group Picks" : "Make Group Picks"}
          </Link>
        )}

        {showViewGroup && (
          <Link
            href={`/${pool.slug}/picks/${pickSet.id}`}
            className={cn(
              "rounded-md px-3 py-2 text-xs font-semibold transition-colors tap-target",
              // Primary styling only if it's the single action on the card
              // (phase 2). In phase 3 it's secondary next to the knockout CTA.
              phase === 2
                ? "bg-pitch-600 text-white hover:bg-pitch-700"
                : "border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
            )}
          >
            View My Group Picks
          </Link>
        )}

        {showEditKnockout && (
          <Link
            href={`/${pool.slug}/my-picks/${pickSet.id}/knockout`}
            className="rounded-md bg-pitch-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pitch-700 transition-colors tap-target"
          >
            {knockoutPickCount > 0 ? "Edit Knockout Bracket" : "Fill Out Knockout Bracket"}
          </Link>
        )}

        {/* Phase 4: single primary CTA that takes you to the combined
            group + knockout detail view. */}
        {showViewAll && (
          <Link
            href={`/${pool.slug}/picks/${pickSet.id}`}
            className="rounded-md bg-pitch-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pitch-700 transition-colors tap-target"
          >
            View My Picks
          </Link>
        )}
      </div>
    </div>
  );
}
