"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  submitThirdPlacePickAction,
  clearThirdPlacePickAction,
} from "./third-place-actions";
import type { ThirdPlacePickResult } from "./third-place-actions";
import type { Team, Pool } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

interface ThirdPlacePickerProps {
  pool: Pool;
  pickSetId: string;
  teams: Team[];
  /**
   * The team id the player has currently saved as their 3rd-place
   * pick, or null if they haven't made the optional pick yet. The
   * picker shows that team as selected on first render and the state
   * resets to it on every revalidate.
   */
  initialTeamId: string | null;
  isLocked: boolean;
}

const initial: ThirdPlacePickResult = { success: false };

/**
 * Editable picker for the optional Pre-Tournament 3rd-Place pick
 * (migration 024).
 *
 * Sits at the bottom of the Group Phase picks page when the pool has
 * consolation_mode = 'preseason_pick'. The pick is OPTIONAL — the
 * progress counter on the picks page deliberately does NOT include
 * it, and a player can save group picks without ever touching this
 * section. The pick is editable until the group phase locks (same
 * gate as group picks).
 *
 * RENDERING:
 *   - Single scrollable list of all 48 teams sorted alphabetically.
 *     Compact rows (flag + name) — replaces the earlier group-by-
 *     tournament-group tile grid which used about ~3× the vertical
 *     space.
 *   - The list has a fixed max-height with internal overflow-y-auto
 *     so the picker doesn't push the rest of the page off-screen.
 *     When a selection exists, we scroll to it on first mount so
 *     editing a previously-set pick lands on the right row without
 *     manual scrolling.
 *   - The currently-selected row is highlighted with the same
 *     pitch-tinted background used elsewhere for selected states.
 *   - A separate Save button posts the chosen team via the server
 *     action; Clear posts to the clear action. The two are kept on
 *     separate forms so a Save can't be ambiguously interpreted as
 *     a Clear (and vice versa).
 *   - When isLocked is true the entire picker is read-only (rows
 *     dimmed, buttons hidden) — the saved pick is still displayed.
 */
export function ThirdPlacePicker({
  pool,
  pickSetId,
  teams,
  initialTeamId,
  isLocked,
}: ThirdPlacePickerProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    initialTeamId
  );

  // Resync local state when the server-supplied initialTeamId changes
  // (revalidatePath after a successful save re-renders the parent
  // with the fresh value). Without this, after a save the optimistic
  // local state would diverge from what's actually on the server.
  // Same pattern as PaymentsView's useEffect on `rows`.
  useEffect(() => {
    setSelectedTeamId(initialTeamId);
  }, [initialTeamId]);

  const [submitState, submitAction, submitPending] = useActionState(
    submitThirdPlacePickAction,
    initial
  );
  const [clearState, clearAction, clearPending] = useActionState(
    clearThirdPlacePickAction,
    initial
  );

  // Sort teams alphabetically by name. Memoised on the teams array
  // identity (which is stable across renders unless a server reload
  // produces a new array), so each render after the first reuses
  // the same sorted list.
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const hasPick = selectedTeamId !== null;
  const isDirty = selectedTeamId !== initialTeamId;

  // Auto-scroll the selected row into view on first mount when there's
  // already a saved pick. The list has a fixed max-height with internal
  // scroll, so a previously-set pick that sorts alphabetically late
  // (e.g. "United States") would be hidden below the fold otherwise.
  // Subsequent selections don't auto-scroll — that would feel jumpy
  // mid-click. Only the initial mount triggers it.
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (!selectedTeamId) return;
    if (!selectedRowRef.current || !listRef.current) return;
    // scrollIntoView with block:'nearest' avoids unnecessary
    // movement when the row is already visible.
    selectedRowRef.current.scrollIntoView({ block: "nearest" });
    didInitialScrollRef.current = true;
  }, [selectedTeamId]);

  // The most recent action's status message — whichever was triggered
  // last wins. Both states default to {success:false} so we can pick
  // whichever has a non-empty error or message.
  const statusError = submitState.error ?? clearState.error ?? null;
  const statusMessage = submitState.success
    ? submitState.message
    : clearState.success
      ? clearState.message
      : null;

  return (
    <section className="space-y-3 pt-2">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">
          Pre-Tournament 3rd Place Pick{" "}
          <span className="font-normal text-[var(--color-text-muted)]">
            (optional)
          </span>
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Pick any country you think will finish 3rd in the whole
          tournament.
          {!isLocked && " Editable until the group phase locks."}{" "}
          Requires a separate buy-in tracked by the pool admin.
        </p>
      </div>

      {/* The save+clear controls live on TWO sibling forms — one for
          each action. Selecting a team flips local state only; the
          actual write happens on Save. */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-3">
        {/* Status line + buttons. Buttons hidden when locked since the
            picker is read-only at that point. */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs">
            {selectedTeam ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[var(--color-text-muted)]">
                  Selected:
                </span>
                <TeamFlag
                  flagCode={selectedTeam.flag_code}
                  teamName={selectedTeam.name}
                  shortCode={selectedTeam.short_code}
                  size="24x18"
                />
                <span className="font-medium">{selectedTeam.name}</span>
              </span>
            ) : (
              <span className="text-[var(--color-text-muted)]">
                No pick yet.
              </span>
            )}
          </div>

          {!isLocked && (
            <div className="flex gap-2">
              {/* Save form: posts the currently-selected teamId. Hidden
                  inputs carry the pool+pickset context. Save is
                  disabled when no team is selected or the state
                  matches what's already on the server. */}
              <form action={submitAction} className="inline">
                <input type="hidden" name="poolId" value={pool.id} />
                <input type="hidden" name="poolSlug" value={pool.slug} />
                <input
                  type="hidden"
                  name="pickSetId"
                  value={pickSetId}
                />
                <input
                  type="hidden"
                  name="teamId"
                  value={selectedTeamId ?? ""}
                />
                <button
                  type="submit"
                  disabled={
                    submitPending || clearPending || !hasPick || !isDirty
                  }
                  className="rounded-md bg-pitch-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors tap-target"
                >
                  {submitPending ? "Saving…" : "Save 3rd-Place Pick"}
                </button>
              </form>
              {/* Clear form: removes the row entirely. Hidden when
                  there's nothing saved to clear, since clearing a
                  not-yet-saved pick is a no-op from the player's
                  perspective. */}
              {initialTeamId !== null && (
                <form action={clearAction} className="inline">
                  <input type="hidden" name="poolId" value={pool.id} />
                  <input type="hidden" name="poolSlug" value={pool.slug} />
                  <input
                    type="hidden"
                    name="pickSetId"
                    value={pickSetId}
                  />
                  <button
                    type="submit"
                    disabled={submitPending || clearPending}
                    onClick={() => setSelectedTeamId(null)}
                    className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors tap-target"
                  >
                    {clearPending ? "Clearing…" : "Clear"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {(statusError || statusMessage) && (
          <p
            className={cn(
              "text-xs",
              statusError ? "text-red-600" : "text-pitch-600"
            )}
          >
            {statusError ?? statusMessage}
          </p>
        )}

        {/* Compact scrollable team list — alphabetical, single
            column, fixed max-height with internal overflow-y-auto.
            Each row is a button; selected row gets the same
            pitch-tinted style used by the group pick buttons in
            the form above. */}
        <div
          ref={listRef}
          className="rounded-md border border-[var(--color-border)] max-h-80 overflow-y-auto divide-y divide-[var(--color-border)]"
          role="listbox"
          aria-label="3rd-place team selection"
        >
          {sortedTeams.map((t) => {
            const isSelected = t.id === selectedTeamId;
            return (
              <button
                key={t.id}
                ref={isSelected ? selectedRowRef : undefined}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={isLocked}
                onClick={() =>
                  setSelectedTeamId((curr) =>
                    curr === t.id ? null : t.id
                  )
                }
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left tap-target",
                  isLocked
                    ? "cursor-default opacity-60"
                    : "cursor-pointer",
                  isSelected
                    ? "bg-pitch-50 text-pitch-700 font-medium"
                    : "hover:bg-[var(--color-surface-raised)]"
                )}
              >
                <TeamFlag
                  flagCode={t.flag_code}
                  teamName={t.name}
                  shortCode={t.short_code}
                  size="24x18"
                />
                <span className="truncate flex-1">{t.name}</span>
                {/* Right-aligned check on the selected row. A small
                    visual marker that doubles as confirmation when
                    scanning the list — the highlight alone can be
                    easy to miss against a long alphabetical list. */}
                {isSelected && (
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
