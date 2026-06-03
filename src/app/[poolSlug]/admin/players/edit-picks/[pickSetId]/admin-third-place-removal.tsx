"use client";

import { useActionState } from "react";
import { adminClearThirdPlacePickAction } from "../../edit-picks-actions";
import type { AdminPickEditResult } from "../../edit-picks-actions";
import { TeamFlag } from "@/components/flags/team-flag";

const initial: AdminPickEditResult = { success: false };

/**
 * Admin control to remove a player's pre-tournament 3rd-place pick.
 *
 * Rendered on the admin Edit Picks (Group Phase) page, inside the
 * AdminEditConfirmation wrapper — so the "you're editing on behalf of
 * {player}" banner + confirmation modal already alert the admin that
 * this touches another player's data, exactly like the group/knockout
 * pick edits. No second bespoke warning is needed here; the wrapper is
 * the single, consistent alert surface.
 *
 * Unlike the player's own clear control (which disappears once the
 * group phase locks), this is available at ANY time during the
 * tournament — the backing adminClearThirdPlacePickAction has no phase
 * gate. That's the whole point: an admin may need to strip a 3rd-place
 * pick mid-tournament (e.g. a player who never paid the buy-in).
 *
 * Only renders when there's actually a pick to remove (`current` is
 * non-null); the parent passes null when the pick set has no 3rd-place
 * pick, in which case this whole block is omitted.
 */
export function AdminThirdPlaceRemoval({
  poolId,
  poolSlug,
  pickSetId,
  current,
}: {
  poolId: string;
  poolSlug: string;
  pickSetId: string;
  /** The currently-saved pick to show + remove. */
  current: {
    teamName: string;
    teamCode: string;
    teamFlagCode: string;
  };
}) {
  const [state, action, pending] = useActionState(
    adminClearThirdPlacePickAction,
    initial
  );

  // Once a successful removal has happened, revalidatePath re-renders
  // the server page without this block (current becomes null), so we
  // don't need to hide the row ourselves — but we still show the
  // success line for the brief window before the refresh settles.
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Pre-Tournament 3rd-Place Pick</h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Removing this clears the player&apos;s 3rd-place selection. This is
          allowed at any time during the tournament, not just while group
          picks are open. The change is recorded in the audit log.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm">
          <TeamFlag
            flagCode={current.teamFlagCode}
            teamName={current.teamName}
            shortCode={current.teamCode}
            size="24x18"
          />
          <span className="font-medium">{current.teamName}</span>
          <span className="text-[var(--color-text-muted)]">
            ({current.teamCode})
          </span>
        </span>

        <form action={action} className="shrink-0">
          <input type="hidden" name="poolId" value={poolId} />
          <input type="hidden" name="poolSlug" value={poolSlug} />
          <input type="hidden" name="pickSetId" value={pickSetId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {pending ? "Removing..." : "Remove 3rd-place pick"}
          </button>
        </form>
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.success && state.message && (
        <p className="text-xs text-pitch-600">{state.message}</p>
      )}
    </div>
  );
}
