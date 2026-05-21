"use client";

import { useActionState } from "react";
import { togglePoolShowFifaRankingsAction } from "../actions-display";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

const initial: AdminActionResult = { success: false };

/**
 * Per-pool toggle for showing FIFA rankings beside team names on the
 * editable group picks form (/{slug}/my-picks/{pickSetId}).
 *
 * When ENABLED, the ranking renders as a subdued "(15)" suffix next to
 * each team name in every match card. Teams without a recorded ranking
 * (fifa_ranking IS NULL) render unchanged — the badge collapses cleanly.
 *
 * When DISABLED, the picks form looks exactly as it did before this
 * feature shipped.
 *
 * Pool rankings are read from the global `teams` table, edited at
 * /super-admin/rankings — not from this page.
 */
export function PoolShowFifaRankingsToggle({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(
    togglePoolShowFifaRankingsAction,
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
        value={pool.show_fifa_rankings ? "false" : "true"}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {pool.show_fifa_rankings
              ? "FIFA rankings shown on picks form"
              : "FIFA rankings hidden on picks form"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {pool.show_fifa_rankings
              ? "Each team's FIFA ranking renders inline beside the team name on the editable group picks form. Edit the rankings at /super-admin/rankings."
              : "Teams render with no ranking info. Turn this on to surface each team's FIFA ranking beside its name on the picks form."}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "..." : pool.show_fifa_rankings ? "Disable" : "Enable"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && <p className="text-xs text-pitch-600 mt-2">{state.message}</p>}
    </form>
  );
}
