"use client";

import { useActionState } from "react";
import {
  fetchMatchLinesAction,
  type FetchLinesActionResult,
} from "../actions-lines";
import type { Pool } from "@/types/database";

interface FetchLinesButtonProps {
  pool: Pool;
}

const initial: FetchLinesActionResult = { success: false };

/**
 * "Fetch latest lines" — bulk-pulls money lines from The Odds API and
 * applies them to matching matches. Hidden by the parent page when the
 * THE_ODDS_API_KEY env var isn't set on the server, so admins never see
 * a button that can't work.
 *
 * After a run, surfaces:
 *   - the matched/unmatched counts,
 *   - which bookmaker the lines came from (so an admin can sanity-check
 *     the numbers against a live book), and
 *   - per-event reasons for any unmatched events so the admin can decide
 *     if the gap matters (most often: the API doesn't carry knockout-stage
 *     lines until the teams are decided).
 */
export function FetchLinesButton({ pool }: FetchLinesButtonProps) {
  const [state, action, pending] = useActionState(fetchMatchLinesAction, initial);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <form action={action} className="flex items-start justify-between gap-3 flex-wrap">
        <input type="hidden" name="poolId" value={pool.id} />
        <input type="hidden" name="poolSlug" value={pool.slug} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Fetch latest lines</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Pulls money lines from The Odds API and applies them to matches
            where both teams are assigned. Existing lines are overwritten.
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

      {/* Result block — shows after the first run. */}
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
