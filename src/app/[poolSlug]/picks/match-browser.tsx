"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { MatchWithTeams, Group, MatchPhase } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

interface MatchBrowserProps {
  matches: MatchWithTeams[];
  groups: Group[];
  poolSlug: string;
}

type FilterPhase = "all" | MatchPhase;

export function MatchBrowser({ matches, groups, poolSlug }: MatchBrowserProps) {
  const [filterPhase, setFilterPhase] = useState<FilterPhase>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.letter.localeCompare(b.letter)),
    [groups]
  );

  const filteredMatches = useMemo(() => {
    let result = matches;
    if (filterPhase !== "all") {
      result = result.filter((m) => m.phase === filterPhase);
    }
    if (filterGroup !== "all" && filterPhase === "group") {
      result = result.filter((m) => m.group_id === filterGroup);
    }
    return result.sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));
  }, [matches, filterPhase, filterGroup]);

  const phases: { value: FilterPhase; label: string }[] = [
    { value: "all", label: "All" },
    { value: "group", label: "Group" },
    { value: "r32", label: "R32" },
    { value: "r16", label: "R16" },
    { value: "qf", label: "QF" },
    { value: "sf", label: "SF" },
    { value: "final", label: "Final" },
  ];

  return (
    <div className="space-y-3">
      {/* Phase filter */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {phases.map((p) => (
          <button
            key={p.value}
            onClick={() => {
              setFilterPhase(p.value);
              if (p.value !== "group") setFilterGroup("all");
            }}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors tap-target",
              filterPhase === p.value
                ? "bg-pitch-600 text-white"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Group sub-filter (only when filtering by group phase) */}
      {filterPhase === "group" && (
        <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
          <button
            onClick={() => setFilterGroup("all")}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors tap-target",
              filterGroup === "all"
                ? "bg-pitch-200 text-pitch-800"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
            )}
          >
            All
          </button>
          {sortedGroups.map((g) => (
            <button
              key={g.id}
              onClick={() => setFilterGroup(g.id)}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors tap-target",
                filterGroup === g.id
                  ? "bg-pitch-200 text-pitch-800"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
              )}
            >
              {g.letter}
            </button>
          ))}
        </div>
      )}

      {/* Match list */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
        {filteredMatches.map((match) => (
          <MatchRow key={match.id} match={match} poolSlug={poolSlug} />
        ))}

        {filteredMatches.length === 0 && (
          <p className="px-4 py-8 text-sm text-[var(--color-text-muted)] text-center">
            No matches for this filter.
          </p>
        )}
      </div>

      <p className="text-xs text-[var(--color-text-muted)] text-center">
        {filteredMatches.length} match{filteredMatches.length !== 1 ? "es" : ""}
      </p>
    </div>
  );
}

function MatchRow({
  match,
  poolSlug,
}: {
  match: MatchWithTeams;
  poolSlug: string;
}) {
  const hasTeams = match.home_team && match.away_team;

  return (
    <Link
      href={`/${poolSlug}/match/${match.id}`}
      className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-raised)] transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-2xs text-[var(--color-text-muted)] w-6 shrink-0">
          #{match.match_number}
        </span>

        {hasTeams ? (
          <>
            <div className="flex items-center gap-1.5">
              <TeamFlag
                flagCode={match.home_team!.flag_code}
                teamName={match.home_team!.name}
                shortCode={match.home_team!.short_code}
                size="24x18"
              />
              <span className="text-sm font-medium">
                {match.home_team!.name}
              </span>
            </div>

            {match.status === "completed" ? (
              <span className="text-sm font-bold tabular-nums px-1.5">
                {match.home_score} – {match.away_score}
              </span>
            ) : (
              <span className="text-xs text-[var(--color-text-muted)] px-1.5">vs</span>
            )}

            <div className="flex items-center gap-1.5">
              <TeamFlag
                flagCode={match.away_team!.flag_code}
                teamName={match.away_team!.name}
                shortCode={match.away_team!.short_code}
                size="24x18"
              />
              <span className="text-sm font-medium">
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
        {match.group && (
          <span className="text-2xs text-[var(--color-text-muted)]">
            {match.group.letter}
          </span>
        )}
        <StatusBadge status={match.status} />
        <svg
          className="h-4 w-4 text-[var(--color-text-muted)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    scheduled: "bg-gray-100 text-gray-600",
    in_progress: "bg-gold-100 text-gold-700",
    completed: "bg-pitch-100 text-pitch-700",
  };

  const labels = {
    scheduled: "Upcoming",
    in_progress: "Live",
    completed: "Final",
  };

  return (
    <span
      className={cn(
        "text-2xs font-medium px-1.5 py-0.5 rounded-full",
        styles[status as keyof typeof styles] ?? styles.scheduled
      )}
    >
      {labels[status as keyof typeof labels] ?? status}
    </span>
  );
}
