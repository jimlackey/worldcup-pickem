"use client";

import { useActionState } from "react";
import { updateRankingsAction, type RankingActionResult } from "./actions";
import type { Group, Team } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";

interface RankingsManagerProps {
  groups: Group[];
  teamsByGroup: Map<string, Team[]>;
  ungrouped: Team[];
}

const initial: RankingActionResult = { success: false };

/**
 * One big form with all 48 teams. The action diffs the submitted values
 * against the DB and only writes rows whose ranking actually changed, so
 * the cost of "Save" is proportional to what the admin actually touched.
 *
 * Layout: a single flat list of all teams ordered by FIFA ranking
 * (1, 2, 3, … with unranked teams last, name-sorted as a tiebreak).
 * Groups are intentionally not shown here — this page is purely about
 * the global ranking order. The form fields are flat parallel arrays
 * (teamId / fifaRanking), so list order has no effect on saving.
 */
export function RankingsManager({
  groups,
  teamsByGroup,
  ungrouped,
}: RankingsManagerProps) {
  const [state, action, pending] = useActionState(updateRankingsAction, initial);

  // Flatten every team (grouped + ungrouped) into one list, then order
  // by current ranking ascending. Teams with no ranking sink to the
  // bottom; ties / unranked rows fall back to alphabetical so the order
  // is stable across renders.
  const allTeams: Team[] = [
    ...groups.flatMap((g) => teamsByGroup.get(g.id) ?? []),
    ...ungrouped,
  ];
  const orderedTeams = allTeams.sort((a, b) => {
    const ar = a.fifa_ranking;
    const br = b.fifa_ranking;
    if (ar == null && br == null) return a.name.localeCompare(b.name);
    if (ar == null) return 1;
    if (br == null) return -1;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });

  return (
    <form action={action} className="space-y-6">
      {/* Sticky save bar at the top — convenient on a long page. */}
      <div className="sticky top-14 z-30 bg-[var(--color-bg)] border-b border-[var(--color-border)] -mx-4 px-4 py-3 flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">
          Edit any ranking and click Save. Only changed rows are written.
        </p>
        <div className="flex items-center gap-3">
          {state.error && (
            <span className="text-xs text-red-600">{state.error}</span>
          )}
          {state.success && state.message && (
            <span className="text-xs text-pitch-600">{state.message}</span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
          >
            {pending ? "Saving..." : "Save Rankings"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
        {orderedTeams.map((team) => (
          <div key={team.id} className="flex items-center gap-3 px-3 py-2">
            <input type="hidden" name="teamId" value={team.id} />
            <TeamFlag
              flagCode={team.flag_code}
              teamName={team.name}
              shortCode={team.short_code}
              size="24x18"
            />
            <span className="text-sm font-medium flex-1 truncate">
              {team.name}
            </span>
            <label htmlFor={`rank-${team.id}`} className="sr-only">
              FIFA ranking for {team.name}
            </label>
            <input
              id={`rank-${team.id}`}
              name="fifaRanking"
              type="text"
              inputMode="numeric"
              pattern="^\d*$"
              placeholder="—"
              defaultValue={team.fifa_ranking ?? ""}
              className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm tabular-nums text-right focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
            />
          </div>
        ))}
      </div>

      {/* Bottom save — duplicate for long-list ergonomics. */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-pitch-600 px-4 py-3 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving..." : "Save Rankings"}
        </button>
      </div>
    </form>
  );
}
