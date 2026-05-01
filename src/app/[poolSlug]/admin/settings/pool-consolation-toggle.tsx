"use client";

import { useActionState } from "react";
import { togglePoolConsolationMatchAction } from "../actions-consolation";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

const initial: AdminActionResult = { success: false };

/**
 * Per-pool toggle for the Consolation (3rd-place) match.
 *
 * When ENABLED:
 *   - Match #104 appears in the bracket picker, the read-only bracket
 *     view, the what-if simulator, the matches list, and admin pages.
 *   - Players' bracket totals are 32 picks instead of 31.
 *   - When the admin enters a semifinal result, the loser is auto-
 *     advanced to #104. When the consolation match itself is scored,
 *     standings updates pick up the points.
 *
 * When DISABLED:
 *   - Match #104 still exists in the DB (we don't delete it), but it's
 *     hidden from every UI surface and excluded from scoring.
 *   - Bracket totals revert to 31 picks. Existing consolation picks
 *     remain in knockout_picks but are inert.
 *
 * Toggling between values is non-destructive — flipping back will
 * resurface previously-saved consolation picks.
 */
export function PoolConsolationToggle({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(
    togglePoolConsolationMatchAction,
    initial
  );

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      {/* Submit the inverse so a click toggles the current value. */}
      <input
        type="hidden"
        name="enabled"
        value={pool.consolation_match_enabled ? "false" : "true"}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {pool.consolation_match_enabled
              ? "Consolation match enabled"
              : "Consolation match disabled"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {pool.consolation_match_enabled
              ? "The 3rd-place match (losers of the two semifinals) is part of the bracket. Players make 32 knockout picks total."
              : "The 3rd-place match is hidden from the bracket. Players make 31 knockout picks total. Existing consolation picks are preserved if you re-enable later."}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors shrink-0"
        >
          {pending
            ? "..."
            : pool.consolation_match_enabled
              ? "Disable"
              : "Enable"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && <p className="text-xs text-pitch-600 mt-2">{state.message}</p>}
    </form>
  );
}
