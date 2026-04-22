"use client";

import { useActionState, useState } from "react";
import {
  updateMatchResultAction,
  resetMatchResultAction,
} from "../actions";
import type { AdminActionResult } from "../actions";
import type { MatchWithTeams } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

interface MatchResultFormProps {
  match: MatchWithTeams;
  poolId: string;
  poolSlug: string;
}

const initial: AdminActionResult = { success: false };

export function MatchResultForm({ match, poolId, poolSlug }: MatchResultFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [saveState, saveAction, savePending] = useActionState(
    updateMatchResultAction,
    initial
  );
  const [resetState, resetAction, resetPending] = useActionState(
    resetMatchResultAction,
    initial
  );

  const hasTeams = match.home_team && match.away_team;
  const isCompleted = match.status === "completed";
  const isKnockout = match.phase !== "group";

  // Show whichever action most recently returned a message.
  const latestState =
    (resetState.success || resetState.error) && !saveState.success
      ? resetState
      : saveState;

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--color-surface)] overflow-hidden transition-colors",
        isCompleted
          ? "border-pitch-200"
          : "border-[var(--color-border)]"
      )}
    >
      {/* Match summary row — clickable header */}
      <button
        type="button"
        onClick={() => hasTeams && setExpanded(!expanded)}
        disabled={!hasTeams}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-surface-raised)] transition-colors disabled:opacity-50 disabled:cursor-default"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-xs text-[var(--color-text-muted)] w-8 shrink-0">
            #{match.match_number}
          </span>

          {hasTeams ? (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <TeamFlag
                  flagCode={match.home_team!.flag_code}
                  teamName={match.home_team!.name}
                  shortCode={match.home_team!.short_code}
                  size="24x18"
                />
                {/* Short code on mobile, full name at sm+ */}
                <span className="text-sm font-medium truncate sm:hidden">
                  {match.home_team!.short_code}
                </span>
                <span className="text-sm font-medium truncate hidden sm:inline">
                  {match.home_team!.name}
                </span>
              </div>

              {isCompleted ? (
                <span className="text-sm font-bold px-2 whitespace-nowrap">
                  {match.home_score} – {match.away_score}
                </span>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)] px-2">vs</span>
              )}

              <div className="flex items-center gap-1.5 min-w-0">
                <TeamFlag
                  flagCode={match.away_team!.flag_code}
                  teamName={match.away_team!.name}
                  shortCode={match.away_team!.short_code}
                  size="24x18"
                />
                <span className="text-sm font-medium truncate sm:hidden">
                  {match.away_team!.short_code}
                </span>
                <span className="text-sm font-medium truncate hidden sm:inline">
                  {match.away_team!.name}
                </span>
              </div>
            </>
          ) : (
            <span className="text-sm text-[var(--color-text-muted)] italic">
              {match.label || "Teams TBD"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <StatusBadge status={match.status} />
          {hasTeams && (
            <svg
              className={cn(
                "h-4 w-4 text-[var(--color-text-muted)] transition-transform",
                expanded && "rotate-180"
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </div>
      </button>

      {/* Expanded edit area */}
      {expanded && hasTeams && (
        <div className="border-t border-[var(--color-border)] px-4 py-4 space-y-4">
          {/* Save-score form. Just two score inputs — the server derives the
              result (home/draw/away) from the scores and sets status to
              "completed" automatically. */}
          <form action={saveAction} className="space-y-4">
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="poolId" value={poolId} />
            <input type="hidden" name="poolSlug" value={poolSlug} />

            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <div>
                <label
                  htmlFor={`homeScore-${match.id}`}
                  className="block text-xs font-medium mb-1"
                >
                  {/* Short code on mobile keeps labels from wrapping on narrow
                      screens, especially for long country names. */}
                  <span className="sm:hidden">
                    {match.home_team!.short_code} Score
                  </span>
                  <span className="hidden sm:inline">
                    {match.home_team!.name} Score
                  </span>
                </label>
                <input
                  id={`homeScore-${match.id}`}
                  name="homeScore"
                  type="number"
                  min={0}
                  defaultValue={match.home_score ?? ""}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor={`awayScore-${match.id}`}
                  className="block text-xs font-medium mb-1"
                >
                  <span className="sm:hidden">
                    {match.away_team!.short_code} Score
                  </span>
                  <span className="hidden sm:inline">
                    {match.away_team!.name} Score
                  </span>
                </label>
                <input
                  id={`awayScore-${match.id}`}
                  name="awayScore"
                  type="number"
                  min={0}
                  defaultValue={match.away_score ?? ""}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
                  required
                />
              </div>
            </div>

            {/* Helper text: for knockout matches, warn against draws inline. */}
            {isKnockout && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Knockout matches can&apos;t end in a draw. Enter the final score
                including any extra time or penalty shootout result.
              </p>
            )}

            {latestState.error && (
              <p className="text-sm text-red-600">{latestState.error}</p>
            )}
            {latestState.success && latestState.message && (
              <p className="text-sm text-pitch-600">{latestState.message}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={savePending || resetPending}
                className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
              >
                {savePending ? "Saving..." : isCompleted ? "Update Score" : "Save Score"}
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-md px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>

          {/* Reset form — separate so it submits without needing the scores.
              Only offered on completed matches; there's nothing to reset
              before a score has been entered. */}
          {isCompleted && (
            <form
              action={resetAction}
              className="pt-3 border-t border-[var(--color-border)]"
            >
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="poolId" value={poolId} />
              <input type="hidden" name="poolSlug" value={poolSlug} />

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-[var(--color-text-muted)]">
                  Clear the score and move this match back to Scheduled. Picks
                  will revert to pending.
                </p>
                <button
                  type="submit"
                  disabled={savePending || resetPending}
                  className="rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {resetPending ? "Resetting..." : "Reset to Scheduled"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// Status badge kept defensively rendering all three states in case legacy data
// exists with status="in_progress" — the form no longer produces that value.
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: "bg-gray-100 text-gray-600",
    in_progress: "bg-gold-100 text-gold-700",
    completed: "bg-pitch-100 text-pitch-700",
  };
  const labels: Record<string, string> = {
    scheduled: "Scheduled",
    in_progress: "Live",
    completed: "Done",
  };

  return (
    <span
      className={cn(
        "text-2xs font-medium px-1.5 py-0.5 rounded-full",
        styles[status] ?? styles.scheduled
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
