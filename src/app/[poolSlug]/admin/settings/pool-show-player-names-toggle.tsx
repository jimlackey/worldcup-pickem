"use client";

import { useActionState } from "react";
import { togglePoolShowPlayerNamesAction } from "../actions-display";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

const initial: AdminActionResult = { success: false };

/**
 * Per-pool toggle for revealing player display names on the Standings
 * page (migration 027). Mirrors PoolShowMatchLinesToggle one card up —
 * same hidden-input flip pattern, same Enable/Disable button.
 *
 * When ENABLED (the default), the Standings "Show Details" toggle lets
 * viewers see each pick set owner's display name under the pick set
 * name. Email addresses never render either way.
 *
 * When DISABLED, names never appear on Standings regardless of the
 * viewer's Show Details state, and during the Group Phase Picking stage
 * the Show Details toggle is hidden entirely (the name is its only
 * phase-1 payload, so it would be a switch that does nothing).
 */
export function PoolShowPlayerNamesToggle({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(
    togglePoolShowPlayerNamesAction,
    initial
  );

  const onCopy =
    "Viewers who turn on Show Details on the Standings page see each pick set owner's display name. Email addresses are never shown.";
  const offCopy =
    "Pick sets render with no owner attribution on Standings. Turn this on to let viewers reveal player display names via the Show Details toggle.";

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input
        type="hidden"
        name="enabled"
        value={pool.show_player_names ? "false" : "true"}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {pool.show_player_names
              ? "Player names shown on Standings"
              : "Player names hidden on Standings"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {pool.show_player_names ? onCopy : offCopy}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "..." : pool.show_player_names ? "Disable" : "Enable"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && <p className="text-xs text-pitch-600 mt-2">{state.message}</p>}
    </form>
  );
}
