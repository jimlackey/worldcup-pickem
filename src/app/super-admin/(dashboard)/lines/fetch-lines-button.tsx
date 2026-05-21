"use client";

import { useActionState } from "react";
import {
  fetchMatchLinesAction,
  type FetchLinesActionResult,
} from "./actions";

const initial: FetchLinesActionResult = { success: false };

/**
 * "Fetch from The Odds API" — bulk-pulls money lines for the FIFA World
 * Cup and applies them to the global match rows, then propagates to
 * every demo-pool copy.
 *
 * Hidden by the parent server component when THE_ODDS_API_KEY isn't set,
 * so the button never renders without a working backend.
 *
 * The result panel surfaces:
 *   - the matched/unmatched counts,
 *   - how many demo-pool match rows the propagation touched,
 *   - the bookmaker that supplied the lines (sanity-check signal),
 *   - per-event reasons for any unmatched events (usually knockout
 *     matches whose teams aren't decided yet).
 */
export function FetchLinesButton() {
  const [state, action, pending] = useActionState(fetchMatchLinesAction, initial);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <form
        action={action}
        className="flex items-start justify-between gap-3 flex-wrap"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Fetch from The Odds API</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Pulls money lines for every World Cup match with both teams
            assigned, writes them to the global rows, and propagates the
            same values to every demo-pool match copy. Existing values
            are overwritten.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "Fetching..." : "Fetch now"}
        </button>
      </form>

      {(state.success || state.error) && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3 space-y-1.5">
          {state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          {state.success && state.message && (
            <p className="text-sm text-pitch-600">{state.message}</p>
          )}
          {state.bookmaker && (
            <p className="text-2xs text-[var(--color-text-muted)]">
              Source: {state.bookmaker}
            </p>
          )}
          {state.unmatchedDetails && state.unmatchedDetails.length > 0 && (
            <details className="text-2xs text-[var(--color-text-muted)] mt-1">
              <summary className="cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors">
                Unmatched ({state.unmatchedDetails.length})
              </summary>
              <ul className="mt-1 pl-3 space-y-0.5">
                {state.unmatchedDetails.map((d, i) => (
                  <li key={i} className="leading-tight">
                    • {d}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
