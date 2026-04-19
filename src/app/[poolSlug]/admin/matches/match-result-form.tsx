"use client";

import { useActionState, useState } from "react";
import { updateMatchResultAction } from "../actions";
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
  const [state, action, pending] = useActionState(updateMatchResultAction, initial);

  const hasTeams = match.home_team && match.away_team;
  const isCompleted = match.status === "completed";

  // Collapse after successful save
  if (state.success && expanded) {
    // Will show success message briefly
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--color-surface)] overflow-hidden transition-colors",
        isCompleted
          ? "border-pitch-200"
          : "border-[var(--color-border)]"
      )}
    >
      {/* Match summary row */}
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
                <span className="text-sm font-medium truncate">
                  {match.home_team!.short_code}
                </span>
              </div>

              {isCompleted ? (
                <span className="text-sm font-bold px-2">
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
                <span className="text-sm font-medium truncate">
                  {match.away_team!.short_code}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {/* Expanded edit form */}
      {expanded && hasTeams && (
        <form action={action} className="border-t border-[var(--color-border)] px-4 py-4 space-y-4">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="poolId" value={poolId} />
          <input type="hidden" name="poolSlug" value={poolSlug} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">
                {match.home_team!.short_code} Score
              </label>
              <input
                name="homeScore"
                type="number"
                min={0}
                defaultValue={match.home_score ?? ""}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                {match.away_team!.short_code} Score
              </label>
              <input
                name="awayScore"
                type="number"
                min={0}
                defaultValue={match.away_score ?? ""}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Result</label>
              <select
                name="result"
                defaultValue={match.result ?? ""}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
                required
              >
                <option value="">Select...</option>
                <option value="home">{match.home_team!.short_code} Win</option>
                <option value="draw">Draw</option>
                <option value="away">{match.away_team!.short_code} Win</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select
                name="status"
                defaultValue={match.status}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
                required
              >
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          {state.success && state.message && (
            <p className="text-sm text-pitch-600">{state.message}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Saving..." : "Save Result"}
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
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    scheduled: "bg-gray-100 text-gray-600",
    in_progress: "bg-gold-100 text-gold-700",
    completed: "bg-pitch-100 text-pitch-700",
  };

  return (
    <span
      className={cn(
        "text-2xs font-medium px-1.5 py-0.5 rounded-full",
        styles[status as keyof typeof styles] ?? styles.scheduled
      )}
    >
      {status === "in_progress" ? "Live" : status === "completed" ? "Done" : "Scheduled"}
    </span>
  );
}
