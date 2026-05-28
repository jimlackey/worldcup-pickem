"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createPickSetAction } from "./actions";
import type { PickActionResult } from "./actions";
import type { Pool, PickSet, PoolSession } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";
import { knockoutTotalCount } from "@/lib/picks/bracket-wiring";
// Date display uses the app-wide helpers so every page renders the same
// DD/MM/YYYY (and DD/MM/YYYY HH:MM PT) format. See src/lib/utils/dates.ts.
import { formatPacificDate, formatPacificDateTime } from "@/lib/utils/dates";
// Reuse the About page's deadline badge so the "picks lock" countdown
// here looks and behaves identically to the one players already see on
// the About page (same tiers, same live countdown, same Pacific-Time
// formatting). Keeping a single component avoids the two drifting apart.
import { DeadlineBadge } from "../about/deadline-badge";
import {
  EmailMyPicksButton,
  EmailMyPicksNote,
} from "./email-my-picks-button";

/**
 * Lookup shape for the optional Pre-Tournament 3rd-Place pick. The
 * /my-picks page builds this by id -> {teamName, teamCode, flagCode}
 * when the pool has consolation_mode = 'preseason_pick'; for any
 * other mode the lookup is empty and the dashboard card silently
 * skips the third-place row. Added in migration 024.
 */
type ThirdPlaceLookup = Record<
  string,
  { teamName: string; teamCode: string; flagCode: string }
>;

interface PickSetDashboardProps {
  pool: Pool;
  session: PoolSession;
  pickSets: PickSet[];
  currentCount: number;
  groupPickCounts: Record<string, number>;
  knockoutPickCounts: Record<string, number>;
  /**
   * Optional pre-tournament 3rd-place picks keyed by pick_set_id. Only
   * populated when the pool has consolation_mode = 'preseason_pick';
   * pick sets without a saved pick simply aren't in the map. Added
   * in migration 024.
   */
  thirdPlacePicks: ThirdPlaceLookup;
  groupPhaseOpen: boolean;
  knockoutPhaseOpen: boolean;
  /**
   * The exact "From" header own-picks emails ship with, e.g.
   * "World Cup Pick'em <noreply@jimlackey.com>". Sourced from the same
   * env-resolved value the sender uses so the explanatory note can't
   * misstate the sender. Passed straight through to EmailMyPicksNote.
   */
  emailFromAddress: string;
}

const initial: PickActionResult = { success: false };

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
  thirdPlacePicks,
  groupPhaseOpen,
  knockoutPhaseOpen,
  emailFromAddress,
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

      {/* Lock-deadline badge (left) + helper note (middle) + Email My
          Picks button (right). On wide screens the three sit on one row:
          badge left, note filling the gap and right-aligned against the
          button, button far right. On narrow screens the row wraps
          (flex-wrap) so the note/button drop below the badge rather than
          crushing together — the note is allowed to wrap freely.

          The badge counts down to the relevant lock during the picking
          phases (group_lock_at while group picks are open, knockout_lock_at
          while knockout picks are open); in the in-between "games underway"
          phases there's no badge, but the Email My Picks button stays
          available in every phase. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 shrink-0">
          {groupPhaseOpen && (
            <DeadlineBadge
              iso={pool.group_lock_at}
              label="Group picks lock"
              pastLabel="Locked"
            />
          )}
          {!groupPhaseOpen && knockoutPhaseOpen && (
            <DeadlineBadge
              iso={pool.knockout_lock_at}
              label="Knockout picks lock"
              pastLabel="Locked"
            />
          )}
        </div>

        {/* Note + button travel together as a right-aligned group. The
            note takes the slack space (flex-1) and right-aligns its text
            so it reads as a caption sitting just left of the button; when
            the row wraps on narrow screens the whole group drops below the
            badge. min-w-0 lets the note text wrap instead of forcing
            overflow. */}
        <div className="flex flex-1 min-w-0 items-start justify-end gap-3">
          <EmailMyPicksNote
            recipientEmail={session.email}
            fromAddress={emailFromAddress}
            className="text-right max-w-md"
          />
          <EmailMyPicksButton pool={pool} />
        </div>
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
            thirdPlacePick={thirdPlacePicks[ps.id] ?? null}
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
  thirdPlacePick,
  groupPhaseOpen,
  knockoutPhaseOpen,
}: {
  pickSet: PickSet;
  pool: Pool;
  groupPickCount: number;
  knockoutPickCount: number;
  /**
   * Read-only display of the optional Pre-Tournament 3rd-Place pick.
   * Null when the player hasn't made the pick (or when the pool isn't
   * in preseason_pick mode at all). Added in migration 024.
   */
  thirdPlacePick: {
    teamName: string;
    teamCode: string;
    flagCode: string;
  } | null;
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
          {/* DD/MM/YYYY — see formatPacificDate. Was toLocaleDateString()
              which rendered as US-style M/D/YYYY (no leading zeros), out
              of sync with the rest of the app. */}
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Created {formatPacificDate(pickSet.created_at)}
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

        {/* Migration 024: read-only summary of the optional Pre-Tournament
            3rd-Place pick. Only renders for pools where the player has
            actually made the pick (thirdPlacePick !== null). The "Edit"
            path lives on the Group Phase picks page; the dashboard tile
            is summary-only. */}
        {thirdPlacePick && (
          <div>
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-[var(--color-text-secondary)]">
                3rd place pick
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <TeamFlag
                  flagCode={thirdPlacePick.flagCode}
                  teamName={thirdPlacePick.teamName}
                  shortCode={thirdPlacePick.teamCode}
                  size="24x18"
                />
                <span className="truncate">{thirdPlacePick.teamName}</span>
              </span>
            </div>
          </div>
        )}
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
