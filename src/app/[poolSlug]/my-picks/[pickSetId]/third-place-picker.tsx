"use client";

import { useActionState, useEffect, useState } from "react";
import {
  submitThirdPlacePickAction,
  clearThirdPlacePickAction,
} from "./third-place-actions";
import type { ThirdPlacePickResult } from "./third-place-actions";
import type { Team, Group, Pool } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

interface ThirdPlacePickerProps {
  pool: Pool;
  pickSetId: string;
  teams: Team[];
  groups: Group[];
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
 *   - Teams are grouped by their group letter (A → L) and rendered as
 *     a grid of clickable cards under each group heading. This mirrors
 *     the organization of the rest of the picks page and gives the
 *     player a familiar way to scan 48 teams.
 *   - The currently-selected team is highlighted with the same
 *     pitch-500 ring used by the group pick buttons above.
 *   - A separate Save button posts the chosen team via the server
 *     action; Clear posts to the clear action. The two are kept on
 *     separate forms so a Save can't be ambiguously interpreted as
 *     a Clear (and vice versa).
 *   - When isLocked is true the entire picker is read-only (cards
 *     dimmed, buttons hidden) — the saved pick is still displayed.
 */
export function ThirdPlacePicker({
  pool,
  pickSetId,
  teams,
  groups,
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

  // Group teams by their group_id so the rendering loop maps cleanly
  // onto the sorted groups list. Teams with no group_id (shouldn't
  // happen for World Cup group-stage data, but defensively handled)
  // land in a synthetic bucket that we render last.
  const teamsByGroup = new Map<string, Team[]>();
  for (const t of teams) {
    if (!t.group_id) continue;
    const list = teamsByGroup.get(t.group_id) ?? [];
    list.push(t);
    teamsByGroup.set(t.group_id, list);
  }
  for (const list of teamsByGroup.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const sortedGroups = [...groups].sort((a, b) =>
    a.letter.localeCompare(b.letter)
  );

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const hasPick = selectedTeamId !== null;
  const isDirty = selectedTeamId !== initialTeamId;

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

        {/* Team grid grouped by tournament group. The grid is 3
            columns on phones and 4-6 on wider screens — same density
            as the country picker in /admin/countries so the rhythm
            feels familiar. */}
        <div className="space-y-3">
          {sortedGroups.map((group) => {
            const teamsInGroup = teamsByGroup.get(group.id) ?? [];
            if (teamsInGroup.length === 0) return null;
            return (
              <div key={group.id}>
                <p className="text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                  {group.name}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                  {teamsInGroup.map((t) => {
                    const isSelected = t.id === selectedTeamId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={isLocked}
                        onClick={() =>
                          setSelectedTeamId((curr) =>
                            curr === t.id ? null : t.id
                          )
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-all tap-target text-left",
                          isLocked
                            ? "cursor-default opacity-60"
                            : "cursor-pointer active:scale-95",
                          isSelected
                            ? "border-pitch-500 bg-pitch-50 text-pitch-700 ring-1 ring-pitch-500/30"
                            : "border-[var(--color-border)] hover:border-pitch-300 hover:bg-pitch-50/50"
                        )}
                      >
                        <TeamFlag
                          flagCode={t.flag_code}
                          teamName={t.name}
                          shortCode={t.short_code}
                          size="24x18"
                        />
                        <span className="truncate">{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
