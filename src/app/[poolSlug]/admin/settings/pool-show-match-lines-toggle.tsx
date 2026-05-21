"use client";

import { useActionState } from "react";
import { togglePoolShowMatchLinesAction } from "../actions-display";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

const initial: AdminActionResult = { success: false };

/**
 * Per-pool toggle for showing money lines under the home / draw / away
 * pick buttons on the editable group picks form.
 *
 * When ENABLED, each pick button gets a small "(-190)" / "(+330)" /
 * "(+600)" subscript. Matches with no lines on file render unchanged.
 *
 * When DISABLED, the buttons look exactly as they did before this
 * feature shipped.
 *
 * Lines are per-match data, edited at /{slug}/admin/matches (each match
 * card expands to a "Lines" section). If the server has THE_ODDS_API_KEY
 * configured, that page also exposes a "Fetch latest lines" button.
 */
export function PoolShowMatchLinesToggle({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(
    togglePoolShowMatchLinesAction,
    initial
  );

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
        value={pool.show_match_lines ? "false" : "true"}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {pool.show_match_lines
              ? "Match lines shown on picks form"
              : "Match lines hidden on picks form"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {pool.show_match_lines
              ? "Money lines render under each pick button on the editable group picks form. Edit them at the Matches admin page."
              : "Pick buttons render without lines. Turn this on to surface each match's money lines under the home / draw / away buttons."}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "..." : pool.show_match_lines ? "Disable" : "Enable"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && <p className="text-xs text-pitch-600 mt-2">{state.message}</p>}
    </form>
  );
}
