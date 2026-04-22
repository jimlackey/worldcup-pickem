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

/**
 * Color class for a team's name based on match outcome.
 *   - Match not completed: no color class (inherits default)
 *   - Draw: both teams → light blue
 *   - Win/loss: winner → light green, loser → light red
 */
function teamColorClass(
  match: MatchWithTeams,
  side: "home" | "away"
): string {
  if (match.status !== "completed" || !match.result) return "";
  if (match.result === "draw") return "text-blue-400";
  return match.result === side ? "text-green-400" : "text-red-400";
}

export function MatchBrowser({ matches, groups, poolSlug }: MatchBrowserProps) {
  const [filterPhase, setFilterPhase] = useState<FilterPhase>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.letter.localeCompare(b.letter)),
    [groups]
  );

  // Split matches once
  const groupMatches = useMemo(
    () =>
      matches
        .filter((m) => m.phase === "group")
        .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)),
    [matches]
  );

  const knockoutMatches = useMemo(
    () =>
      matches
        .filter((m) => m.phase !== "group")
        .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)),
    [matches]
  );

  // Bucket group matches by group id
  const matchesByGroup = useMemo(() => {
    const map = new Map<string, MatchWithTeams[]>();
    for (const m of groupMatches) {
      if (!m.group_id) continue;
      const arr = map.get(m.group_id) ?? [];
      arr.push(m);
      map.set(m.group_id, arr);
    }
    return map;
  }, [groupMatches]);

  // Bucket knockout matches by phase (stable order)
  const phaseOrder: MatchPhase[] = ["r32", "r16", "qf", "sf", "final"];
  const knockoutByPhase = useMemo(() => {
    const map = new Map<MatchPhase, MatchWithTeams[]>();
    for (const phase of phaseOrder) {
      const phaseMatches = knockoutMatches.filter((m) => m.phase === phase);
      if (phaseMatches.length > 0) map.set(phase, phaseMatches);
    }
    return map;
  }, [knockoutMatches]);

  // Visibility flags derived from the filter bar
  const showGroupPhase = filterPhase === "all" || filterPhase === "group";
  const showKnockoutPhase = filterPhase === "all" || filterPhase !== "group";

  // Which groups to render (all, or a single one when sub-filter is set)
  const groupsToShow = useMemo(() => {
    if (!showGroupPhase) return [];
    if (filterPhase === "group" && filterGroup !== "all") {
      return sortedGroups.filter((g) => g.id === filterGroup);
    }
    return sortedGroups;
  }, [showGroupPhase, filterPhase, filterGroup, sortedGroups]);

  // Which knockout phases to render
  const phasesToShow = useMemo(() => {
    if (!showKnockoutPhase) return [];
    if (filterPhase === "all") return phaseOrder;
    // filterPhase is a specific knockout phase
    return [filterPhase as MatchPhase];
  }, [showKnockoutPhase, filterPhase]);

  const phases: { value: FilterPhase; label: string }[] = [
    { value: "all", label: "All" },
    { value: "group", label: "Group" },
    { value: "r32", label: "R32" },
    { value: "r16", label: "R16" },
    { value: "qf", label: "QF" },
    { value: "sf", label: "SF" },
    { value: "final", label: "Final" },
  ];

  // Total count for footer
  const visibleCount =
    (showGroupPhase
      ? groupsToShow.reduce(
          (sum, g) => sum + (matchesByGroup.get(g.id)?.length ?? 0),
          0
        )
      : 0) +
    (showKnockoutPhase
      ? phasesToShow.reduce(
          (sum, p) => sum + (knockoutByPhase.get(p)?.length ?? 0),
          0
        )
      : 0);

  return (
    <div className="space-y-5">
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

      {/* Group phase sections */}
      {showGroupPhase && groupsToShow.length > 0 && (
        <section className="space-y-4">
          {filterPhase === "all" && (
            <h2 className="text-lg font-display font-bold">Group Phase</h2>
          )}

          {groupsToShow.map((group) => {
            const gMatches = matchesByGroup.get(group.id) ?? [];
            if (gMatches.length === 0) return null;

            return (
              <div key={group.id}>
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
                  {group.name}
                </h3>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
                  {gMatches.map((match) => (
                    <MatchRow
                      key={match.id}
                      match={match}
                      poolSlug={poolSlug}
                      showGroupLetter={false}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Knockout phase sections */}
      {showKnockoutPhase && phasesToShow.length > 0 && (
        <section className="space-y-4">
          {filterPhase === "all" && (
            <h2 className="text-lg font-display font-bold">Knockout Phase</h2>
          )}

          {phasesToShow.map((phase) => {
            const phaseMatches = knockoutByPhase.get(phase);
            if (!phaseMatches || phaseMatches.length === 0) return null;

            return (
              <div key={phase}>
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
                  {PHASE_LABELS[phase]}
                </h3>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
                  {phaseMatches.map((match) => (
                    <MatchRow
                      key={match.id}
                      match={match}
                      poolSlug={poolSlug}
                      showGroupLetter={false}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {visibleCount === 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <p className="px-4 py-8 text-sm text-[var(--color-text-muted)] text-center">
            No matches for this filter.
          </p>
        </div>
      )}

      <p className="text-xs text-[var(--color-text-muted)] text-center">
        {visibleCount} match{visibleCount !== 1 ? "es" : ""}
      </p>
    </div>
  );
}

function MatchRow({
  match,
  poolSlug,
  showGroupLetter,
}: {
  match: MatchWithTeams;
  poolSlug: string;
  showGroupLetter: boolean;
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
              <span
                className={cn("text-sm font-medium", teamColorClass(match, "home"))}
              >
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
              <span
                className={cn("text-sm font-medium", teamColorClass(match, "away"))}
              >
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
        {showGroupLetter && match.group && (
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
