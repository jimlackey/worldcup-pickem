"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  adminSetThirdPlacePickAction,
  adminClearThirdPlacePickAction,
} from "../../edit-picks-actions";
import type { AdminPickEditResult } from "../../edit-picks-actions";
import type { Team } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

const initial: AdminPickEditResult = { success: false };

/**
 * Admin control to SET, CHANGE, or REMOVE a player's pre-tournament
 * 3rd-place pick.
 *
 * Rendered on the admin Edit Picks (Group Phase) page, inside the
 * AdminEditConfirmation wrapper — so the "you're editing on behalf of
 * {player}" banner + confirmation modal already alert the admin that
 * this touches another player's data, exactly like the group/knockout
 * pick edits. No second bespoke warning is needed here; the wrapper is
 * the single, consistent alert surface.
 *
 * Two differences from the player's own picker
 * (my-picks/[pickSetId]/third-place-picker.tsx):
 *
 *   1. It's available at ANY time during the tournament. The player's
 *      picker goes read-only once the group phase locks; the admin
 *      actions (adminSetThirdPlacePickAction /
 *      adminClearThirdPlacePickAction) have no phase gate, so an admin
 *      can set, change, or clear a pick mid-tournament (e.g. correcting
 *      a pick or assigning one for a late buy-in).
 *
 *   2. It always renders — even when the pick set has no pick yet — so
 *      an admin can ASSIGN a first pick, not just edit an existing one.
 *      `initialTeamId` is null in that case.
 *
 * Selection is local state; nothing is written until the admin clicks
 * Save. Save posts the selected team to adminSetThirdPlacePickAction.
 * Remove (shown only when there's a saved pick) posts to
 * adminClearThirdPlacePickAction. Mirrors the player picker's
 * two-sibling-forms shape.
 */
export function AdminThirdPlacePicker({
  poolId,
  poolSlug,
  pickSetId,
  teams,
  initialTeamId,
}: {
  poolId: string;
  poolSlug: string;
  pickSetId: string;
  /** All teams in the pool's tournament, for the selection list. */
  teams: Team[];
  /** The currently-saved pick's team id, or null if none yet. */
  initialTeamId: string | null;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    initialTeamId
  );

  // Resync local state when the server-supplied initialTeamId changes
  // (revalidatePath after a successful save/clear re-renders the parent
  // with the fresh value). Same pattern as the player picker.
  useEffect(() => {
    setSelectedTeamId(initialTeamId);
  }, [initialTeamId]);

  const [setState, setAction, setPending] = useActionState(
    adminSetThirdPlacePickAction,
    initial
  );
  const [clearState, clearAction, clearPending] = useActionState(
    adminClearThirdPlacePickAction,
    initial
  );

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const hasPick = selectedTeamId !== null;
  const isDirty = selectedTeamId !== initialTeamId;

  // Whichever action ran most recently wins the status line. Both
  // states default to {success:false}.
  const statusError = setState.error ?? clearState.error ?? null;
  const statusMessage = setState.success
    ? setState.message
    : clearState.success
      ? clearState.message
      : null;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Pre-Tournament 3rd-Place Pick</h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Set, change, or remove this player&apos;s 3rd-place selection.
          Allowed at any time during the tournament, not just while group
          picks are open. Every change is recorded in the audit log.
        </p>
      </div>

      {/* Selected summary + Save / Remove buttons. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs">
          {selectedTeam ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[var(--color-text-muted)]">Selected:</span>
              <TeamFlag
                flagCode={selectedTeam.flag_code}
                teamName={selectedTeam.name}
                shortCode={selectedTeam.short_code}
                size="24x18"
              />
              <span className="font-medium">{selectedTeam.name}</span>
            </span>
          ) : (
            <span className="text-[var(--color-text-muted)]">No pick yet.</span>
          )}
        </div>

        <div className="flex gap-2">
          {/* Save: posts the selected team. Disabled when nothing is
              selected or the selection matches what's already saved. */}
          <form action={setAction} className="inline">
            <input type="hidden" name="poolId" value={poolId} />
            <input type="hidden" name="poolSlug" value={poolSlug} />
            <input type="hidden" name="pickSetId" value={pickSetId} />
            <input type="hidden" name="teamId" value={selectedTeamId ?? ""} />
            <button
              type="submit"
              disabled={setPending || clearPending || !hasPick || !isDirty}
              className="rounded-md bg-pitch-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
            >
              {setPending ? "Saving…" : "Save 3rd-place pick"}
            </button>
          </form>

          {/* Remove: clears the row entirely. Only shown when there's a
              saved pick on the server to remove (clearing an unsaved
              local selection is just a deselect — handled by clicking
              the row again). */}
          {initialTeamId !== null && (
            <form action={clearAction} className="inline">
              <input type="hidden" name="poolId" value={poolId} />
              <input type="hidden" name="poolSlug" value={poolSlug} />
              <input type="hidden" name="pickSetId" value={pickSetId} />
              <button
                type="submit"
                disabled={setPending || clearPending}
                onClick={() => setSelectedTeamId(null)}
                className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                {clearPending ? "Removing…" : "Remove"}
              </button>
            </form>
          )}
        </div>
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

      {/* Scrollable alphabetical team list — same treatment as the
          player picker. Clicking a row selects it (clicking the
          selected row again deselects). Selection is local until Save. */}
      <div
        className="rounded-md border border-[var(--color-border)] max-h-72 overflow-y-auto divide-y divide-[var(--color-border)]"
        role="listbox"
        aria-label="3rd-place team selection"
      >
        {sortedTeams.map((t) => {
          const isSelected = t.id === selectedTeamId;
          return (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() =>
                setSelectedTeamId((curr) => (curr === t.id ? null : t.id))
              }
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left cursor-pointer",
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
  );
}
