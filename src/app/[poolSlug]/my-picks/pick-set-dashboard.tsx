"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPickSetAction, renamePickSetAction } from "./actions";
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
import { PhaseTile } from "./phase-tile";
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
/**
 * Lookup shape for an optional "picked team" cell on the dashboard
 * card — used for both the Pre-Tournament 3rd-Place pick and the
 * Tourney Winner pick (= the pick set's pick for the Final, #103).
 * Both lookups are built server-side by the /my-picks page and keyed
 * by pick_set_id. Pick sets that haven't made the pick simply aren't
 * in the map; the dashboard card treats missing entries as "no pick
 * yet" and hides the cell. Added in migration 024 (third place) and
 * extended for the tourney winner display.
 */
type PickedTeamLookup = Record<
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
  thirdPlacePicks: PickedTeamLookup;
  /**
   * Optional tourney-winner picks keyed by pick_set_id. A pick set
   * appears in the map only if the player has saved a knockout pick
   * for the Final (#103); otherwise the dashboard card hides the
   * cell. Sourced from the same Standings helper so the two views
   * stay aligned.
   */
  tourneyWinnerPicks: PickedTeamLookup;
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
  tourneyWinnerPicks,
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

  // Lifecycle phase for the two-tile date row, derived the same way the
  // per-pick-set card derives its phase (see PickSetCard below) so the
  // dashboard header and the cards never disagree about where the pool
  // is:
  //   1 — Group picking open
  //   2 — Group games underway (both phases closed, knockout not yet open)
  //   3 — Knockout picking open
  //   4 — Knockout games underway (knockout lock has passed)
  // Phases 2 and 4 both have both pick phases closed; the knockout-lock
  // timestamp tells them apart.
  const knockoutLocked =
    !!pool.knockout_lock_at &&
    Date.now() >= new Date(pool.knockout_lock_at).getTime();
  const dashboardPhase: 1 | 2 | 3 | 4 = groupPhaseOpen
    ? 1
    : knockoutPhaseOpen
      ? 3
      : knockoutLocked
        ? 4
        : 2;

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
            + {pickSets.length === 0 ? "Make My Picks" : "Add Another Set of Picks"}
          </button>
        )}
      </div>

      {/* Phase row: two date tiles + Email My Picks.

          The two tiles describe where the pool is in its picking
          lifecycle. Exactly one tile is "live" (green countdown via
          DeadlineBadge) during the two picking-open phases; in every
          other state both tiles are inert gray (PhaseTile). The mapping:

            Phase 1 — Group picking open:
              Group  → live "Group picks lock" countdown (group_lock_at)
              Knock. → gray "Knockout picking opens" (knockout_open_at)

            Phase 2 — Group stage underway:
              Group  → gray "Group picks · Locked"
              Knock. → gray "Knockout picking opens" (knockout_open_at)

            Phase 3 — Knockout picking open:
              Group  → gray "Group picks · Locked"
              Knock. → live "Knockout picks lock" countdown (knockout_lock_at)

            Phase 4 — Knockout stage underway:
              Group  → gray "Group picks · Locked"
              Knock. → gray "Knockout picks · Locked"

          The phase is derived the same way the per-pick-set card derives
          it below, so the two stay in lockstep: group-open → 1,
          knockout-open → 3, else 4 if the knockout lock has passed,
          else 2 (the in-between "group games underway" gap).

          Layout: tiles + button inline on sm+, with the Email My Picks
          group dropping below the tiles on mobile. */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-x-4 gap-y-3">
        {/* Tile pair. Wraps internally on very narrow viewports so the
            two tiles stack rather than overflow. */}
        <div className="flex flex-wrap items-start gap-3 min-w-0">
          {/* Group tile — live only in Phase 1, gray-locked otherwise. */}
          {dashboardPhase === 1 ? (
            <DeadlineBadge
              iso={pool.group_lock_at}
              label="Group picks lock"
              pastLabel="Locked"
            />
          ) : (
            <PhaseTile label="Group picks" status="Locked" />
          )}

          {/* Knockout tile.
                Phases 1 & 2 — not open yet: gray, shows the open date.
                Phase 3 — open: live countdown to the lock.
                Phase 4 — underway: gray "Locked". */}
          {dashboardPhase === 3 ? (
            <DeadlineBadge
              iso={pool.knockout_lock_at}
              label="Knockout picks lock"
              pastLabel="Locked"
            />
          ) : dashboardPhase === 4 ? (
            <PhaseTile label="Knockout picks" status="Locked" />
          ) : (
            <PhaseTile
              label="Knockout picking opens"
              status="Upcoming"
              iso={pool.knockout_open_at}
            />
          )}
        </div>

        {/* Note + button group.

            Wide (sm+): inline side-by-side, right-aligned against the
            button — note takes the slack (flex-1) and right-aligns its
            text so it reads as a caption to the left of the button.

            Mobile: drops below the tiles and stacks vertically with the
            note on top and the button beneath it, both left-aligned so
            the button gets a comfortable tap target on its own row. */}
        <div className="flex flex-col sm:flex-row sm:flex-1 sm:min-w-0 sm:items-start sm:justify-end gap-2 sm:gap-3">
          {pickSets.length > 0 && (
            <>
              <EmailMyPicksNote
                recipientEmail={session.email}
                fromAddress={emailFromAddress}
                className="sm:text-right sm:max-w-md"
              />
              <EmailMyPicksButton pool={pool} />
            </>
          )}
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
            tourneyWinnerPick={tourneyWinnerPicks[ps.id] ?? null}
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
  tourneyWinnerPick,
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
  /**
   * Read-only display of the pick set's pick for the Final (#103) —
   * i.e. who the player thinks wins the tournament. Null when the
   * player hasn't made a Final pick yet; the card hides the cell in
   * that case. Renders inline alongside the 3rd-place pick when both
   * are present.
   */
  tourneyWinnerPick: {
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
        <div className="min-w-0 flex-1">
          <PickSetNameEditor
            poolId={pool.id}
            poolSlug={pool.slug}
            pickSetId={pickSet.id}
            currentName={pickSet.name}
          />
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

        {/* Read-only summary row for the two "pre-tournament guess"
            picks the player can make: the optional Pre-Tournament
            3rd-Place pick (migration 024) and the Tourney Winner pick
            (= the knockout pick for the Final, #103). Renders only
            when at least one of the picks exists. Each cell pairs the
            label and the flag/team tightly together so the eye reads
            them as one unit; the two cells then sit on opposite ends
            of the row — 3rd Place flush left, Picked Winner flush
            right. The whole block wraps to two rows on very narrow
            viewports thanks to flex-wrap so the cells stay readable
            instead of being squashed together. */}
        {(thirdPlacePick || tourneyWinnerPick) && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
            {thirdPlacePick ? (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className="text-[var(--color-text-secondary)] shrink-0">
                  3rd Place Pick:
                </span>
                <TeamFlag
                  flagCode={thirdPlacePick.flagCode}
                  teamName={thirdPlacePick.teamName}
                  shortCode={thirdPlacePick.teamCode}
                  size="24x18"
                />
                <span className="font-medium truncate">
                  {thirdPlacePick.teamName}
                </span>
              </span>
            ) : (
              // Placeholder spacer so a lone Picked Winner cell still
              // sits flush right via justify-between. Zero-width when
              // there's no 3rd-place pick to show.
              <span />
            )}

            {tourneyWinnerPick && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className="text-[var(--color-text-secondary)] shrink-0">
                  Picked Winner:
                </span>
                <TeamFlag
                  flagCode={tourneyWinnerPick.flagCode}
                  teamName={tourneyWinnerPick.teamName}
                  shortCode={tourneyWinnerPick.teamCode}
                  size="24x18"
                />
                <span className="font-medium truncate">
                  {tourneyWinnerPick.teamName}
                </span>
              </span>
            )}
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

// ----------------------------------------------------------------------------
// Inline pick set name editor
// ----------------------------------------------------------------------------

/**
 * The pick set name shown on each dashboard card, with an inline
 * rename affordance.
 *
 * View mode: name + small pencil-icon button. Click the icon to swap
 * into edit mode.
 *
 * Edit mode: a textbox pre-populated with the current name (autofocus +
 * pre-selected so the player can start typing immediately or just type
 * a new name), plus Save and Cancel buttons. Enter saves, Escape
 * cancels — both as a keyboard convenience and so the form doesn't
 * accidentally submit-on-Enter while crashing the surrounding card.
 *
 * Posts to renamePickSetAction (defined in ./actions.ts), which exists
 * already and handles auth, ownership, the 1-50 char length cap, and
 * the audit-log RENAME_PICK_SET entry. On success the action calls
 * revalidatePath('/{slug}/my-picks') so the surrounding server-rendered
 * card refreshes with the new name on the next render; we also drop
 * back to view mode locally so the swap feels instant.
 *
 * Rename is intentionally allowed in any phase (open or locked) —
 * unlike the picks themselves, the name is metadata, and players
 * sometimes want to clean up names after the deadline. The server
 * action enforces the same policy.
 */
function PickSetNameEditor({
  poolId,
  poolSlug,
  pickSetId,
  currentName,
}: {
  poolId: string;
  poolSlug: string;
  pickSetId: string;
  currentName: string;
}) {
  const [editing, setEditing] = useState(false);
  // Local draft of the input value. Reset to currentName every time
  // the editor opens so a previous abandoned edit doesn't leak in.
  const [draft, setDraft] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, action, pending] = useActionState<PickActionResult, FormData>(
    renamePickSetAction,
    { success: false }
  );

  // When the server action returns success, drop back to view mode.
  // The revalidatePath in the action refreshes currentName from the
  // server; useEffect resyncs the local draft so a re-open of the
  // editor starts from the new value.
  useEffect(() => {
    if (state.success) {
      setEditing(false);
    }
  }, [state.success]);

  // Keep the draft in sync with the server-truth name whenever the
  // prop changes (e.g. after a successful rename re-renders the
  // parent card). Standard useActionState + useEffect resync pattern.
  useEffect(() => {
    setDraft(currentName);
  }, [currentName]);

  // Focus and select-all when entering edit mode so the player can
  // either replace the name entirely or jump into the middle of it.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setDraft(currentName);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(currentName);
    setEditing(false);
  }

  // View mode: name + pencil button. The button is small and muted
  // so it doesn't compete visually with the name; hover/focus brings
  // it up to the primary text color.
  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <h3 className="font-display font-semibold truncate">{currentName}</h3>
        <button
          type="button"
          onClick={startEdit}
          aria-label="Edit pick set name"
          title="Edit name"
          className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] transition-colors tap-target"
        >
          {/* Inline pencil icon — matches the inline-SVG pattern used
              by favorite-star.tsx so we don't pull in an icon library. */}
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      </div>
    );
  }

  // Edit mode: form posts to renamePickSetAction. We use <form action={action}>
  // (the React 19 server-action binding) so pressing Enter in the input
  // submits the form naturally — no manual startTransition needed because
  // form-action dispatch handles the transition internally.
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />
      <input type="hidden" name="pickSetId" value={pickSetId} />
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={inputRef}
          name="name"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          maxLength={50}
          minLength={1}
          required
          disabled={pending}
          aria-label="Pick set name"
          className="flex-1 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-base font-display font-semibold focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none disabled:opacity-50"
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="rounded-md bg-pitch-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors tap-target"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={pending}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors tap-target"
          >
            Cancel
          </button>
        </div>
      </div>
      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
