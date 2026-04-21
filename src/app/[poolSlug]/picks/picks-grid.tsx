"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { MatchWithTeams, Group, PickSetWithParticipant } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

interface PicksGridProps {
  matches: MatchWithTeams[];
  groups: Group[];
  pickSets: PickSetWithParticipant[];
  picksLookup: Record<string, Record<string, { pick: string; is_correct: boolean | null }>>;
  poolSlug: string;
}

const RESULT_SYMBOLS: Record<string, string> = {
  home: "H",
  draw: "D",
  away: "A",
};

export function PicksGrid({
  matches,
  groups,
  pickSets,
  picksLookup,
  poolSlug,
}: PicksGridProps) {
  const [filterGroup, setFilterGroup] = useState<string>("all");

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.letter.localeCompare(b.letter)),
    [groups]
  );

  const filteredMatches = useMemo(() => {
    if (filterGroup === "all") return matches;
    return matches.filter((m) => m.group_id === filterGroup);
  }, [matches, filterGroup]);

  if (pickSets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">
          No picks submitted yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Group filter */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        <button
          onClick={() => setFilterGroup("all")}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors tap-target",
            filterGroup === "all"
              ? "bg-pitch-600 text-white"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
          )}
        >
          All Groups
        </button>
        {sortedGroups.map((g) => (
          <button
            key={g.id}
            onClick={() => setFilterGroup(g.id)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors tap-target",
              filterGroup === g.id
                ? "bg-pitch-600 text-white"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
            )}
          >
            {g.letter}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs w-max min-w-full">
            <thead>
              <tr className="bg-[var(--color-surface-raised)]">
                {/* Frozen match column */}
                <th className="grid-frozen-col px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)] min-w-[160px]">
                  Match
                </th>
                {/* Pick set columns */}
                {pickSets.map((ps) => (
                  <th
                    key={ps.id}
                    className="px-2 py-2 text-center font-medium text-[var(--color-text-secondary)] min-w-[48px] max-w-[80px]"
                    title={`${ps.name} (${ps.participant.display_name || ps.participant.email})`}
                  >
                    <div className="truncate text-2xs">
                      {ps.name.length > 8 ? ps.name.slice(0, 8) + "…" : ps.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredMatches.map((match) => (
                <tr key={match.id} className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)]">
                  {/* Match info — frozen */}
                  <td className="grid-frozen-col px-3 py-2">
                    <Link
                      href={`/${poolSlug}/match/${match.id}`}
                      className="flex items-center gap-1.5 hover:text-pitch-600 transition-colors"
                    >
                      {match.home_team && match.away_team ? (
                        <>
                          <TeamFlag
                            flagCode={match.home_team.flag_code}
                            teamName={match.home_team.name}
                            shortCode={match.home_team.short_code}
                            size="16x12"
                          />
                          <span className="font-medium">{match.home_team.short_code}</span>
                          <span className="text-[var(--color-text-muted)]">v</span>
                          <TeamFlag
                            flagCode={match.away_team.flag_code}
                            teamName={match.away_team.name}
                            shortCode={match.away_team.short_code}
                            size="16x12"
                          />
                          <span className="font-medium">{match.away_team.short_code}</span>

                          {match.status === "completed" && (
                            <span className="text-[var(--color-text-muted)] ml-1">
                              ({match.home_score}–{match.away_score})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">TBD</span>
                      )}
                    </Link>
                  </td>

                  {/* Pick cells */}
                  {pickSets.map((ps) => {
                    const pickData = picksLookup[ps.id]?.[match.id];
                    if (!pickData) {
                      return (
                        <td key={ps.id} className="px-2 py-2 text-center">
                          <span className="text-[var(--color-text-muted)]">—</span>
                        </td>
                      );
                    }

                    const { pick, is_correct } = pickData;
                    return (
                      <td key={ps.id} className="px-2 py-2 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center w-6 h-5 rounded text-2xs font-bold",
                            is_correct === true && "bg-correct/15 text-correct",
                            is_correct === false && "bg-incorrect/15 text-incorrect",
                            is_correct === null && "bg-gray-100 text-gray-500"
                          )}
                        >
                          {RESULT_SYMBOLS[pick] ?? "?"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
