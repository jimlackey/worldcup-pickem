"use client";

import { useMemo } from "react";
import type { Group, MatchResult, Team } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import type {
  MatchInfo,
  WhatIfOverrides,
} from "@/lib/what-if/scoring-engine";
import { cn } from "@/lib/utils/cn";

interface WhatIfGroupPickerProps {
  matches: MatchInfo[];
  groups: Group[];
  teams: Team[];
  overrides: WhatIfOverrides;
  onChange: (next: WhatIfOverrides) => void;
}

export function WhatIfGroupPicker({
  matches,
  groups,
  teams,
  overrides,
  onChange,
}: WhatIfGroupPickerProps) {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  // We need group_id for each match. MatchInfo strips it — look it up via teams.
  // Simpler: bucket by the home team's group_id (both teams in a group match
  // share the same group).
  const teamGroupById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) {
      if (t.group_id) m.set(t.id, t.group_id);
    }
    return m;
  }, [teams]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.letter.localeCompare(b.letter)),
    [groups]
  );

  // Bucket group matches by group
  const matchesByGroup = useMemo(() => {
    const map = new Map<string, MatchInfo[]>();
    for (const m of matches) {
      if (m.phase !== "group") continue;
      const groupId = m.home_team_id
        ? teamGroupById.get(m.home_team_id)
        : undefined;
      if (!groupId) continue;
      const arr = map.get(groupId) ?? [];
      arr.push(m);
      map.set(groupId, arr);
    }
    // Sort matches within each group by match_number
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));
    }
    return map;
  }, [matches, teamGroupById]);

  const setPick = (matchId: string, value: MatchResult | null) => {
    const nextGroup = { ...overrides.groupResults };
    if (value === null) {
      delete nextGroup[matchId];
    } else {
      nextGroup[matchId] = value;
    }
    onChange({ ...overrides, groupResults: nextGroup });
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-display font-bold">Group Phase — What If</h2>

      {sortedGroups.map((group) => {
        const gMatches = matchesByGroup.get(group.id) ?? [];
        if (gMatches.length === 0) return null;

        // Only show the section if it has at least one undecided match
        const hasUndecided = gMatches.some(
          (m) => m.actual_status !== "completed"
        );
        if (!hasUndecided) return null;

        return (
          <div key={group.id}>
            <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
              {group.name}
            </h3>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
              {gMatches.map((m) => {
                const home = m.home_team_id ? teamMap.get(m.home_team_id) : null;
                const away = m.away_team_id ? teamMap.get(m.away_team_id) : null;
                const isDecided = m.actual_status === "completed";
                const override = overrides.groupResults[m.id] ?? null;
                const effective = isDecided ? m.actual_result : override;

                return (
                  <div
                    key={m.id}
                    className="px-3 py-2.5 flex items-center gap-3 flex-wrap"
                  >
                    <span className="text-2xs text-[var(--color-text-muted)] w-6 shrink-0">
                      #{m.match_number}
                    </span>

                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                      {home && away ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <TeamFlag
                              flagCode={home.flag_code}
                              teamName={home.name}
                              shortCode={home.short_code}
                              size="16x12"
                            />
                            <span className="text-sm font-medium">
                              {home.short_code}
                            </span>
                          </div>
                          <span className="text-xs text-[var(--color-text-muted)]">
                            v
                          </span>
                          <div className="flex items-center gap-1.5">
                            <TeamFlag
                              flagCode={away.flag_code}
                              teamName={away.name}
                              shortCode={away.short_code}
                              size="16x12"
                            />
                            <span className="text-sm font-medium">
                              {away.short_code}
                            </span>
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)] italic">
                          Teams TBD
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {(["home", "draw", "away"] as const).map((opt) => {
                        const label =
                          opt === "home"
                            ? home?.short_code ?? "H"
                            : opt === "away"
                              ? away?.short_code ?? "A"
                              : "D";
                        const isSelected = effective === opt;

                        // Four visual states, in priority order:
                        //   1. Completed + winner      → subdued green
                        //   2. Completed + non-winner  → subdued gray
                        //   3. Open + selected pick    → vibrant green (pop)
                        //   4. Open + unselected       → neutral outline
                        const stateClass = isDecided
                          ? isSelected
                            ? "bg-pitch-500/15 text-pitch-400 border-pitch-500/30"
                            : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                          : isSelected
                            ? "bg-pitch-100 text-pitch-700 border-pitch-400 ring-1 ring-pitch-500/30"
                            : "bg-transparent text-[var(--color-text-secondary)] border-[var(--color-border)]";

                        return (
                          <button
                            key={opt}
                            type="button"
                            disabled={isDecided}
                            onClick={() =>
                              setPick(m.id, isSelected ? null : opt)
                            }
                            // Fixed width so D, home, and away all line up
                            // regardless of short-code length.
                            className={cn(
                              "w-11 px-2 py-1 rounded text-xs font-bold border text-center transition-colors",
                              isDecided
                                ? "cursor-default"
                                : "cursor-pointer hover:border-pitch-300",
                              stateClass
                            )}
                            aria-label={
                              isDecided
                                ? `${label} — final result`
                                : `Pick ${label}`
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
