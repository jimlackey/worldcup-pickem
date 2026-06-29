"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { MatchWithTeams, Group } from "@/types/database";
import type { MatchPickDistribution } from "@/lib/picks/match-pick-counts";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";
import { KnockoutBracket } from "./knockout-bracket";

// ============================================================================
// Grid view for /matches
// ----------------------------------------------------------------------------
// The second of the two /matches sub-views (the first being the existing
// Table view, untouched). It re-presents the SAME match data — including the
// post-lock pick distribution — in two more visual layouts:
//
//   • Group matches → a compressed two-column list mirroring /picks/{id}'s
//     group layout. 3-letter country codes throughout. On mobile the
//     Home / Draw / Away distribution stacks vertically instead of inline.
//
//   • Knockout matches → a one-sided bracket (all 16 R32 matches down the
//     left, later rounds fanning rightward to the Final). Each match cell is
//     a link to its drilldown, showing both short codes, the score/"v", and
//     — when unlocked — the per-outcome pick split. Cells stack their detail
//     vertically so they stay legible inside narrow bracket columns.
//
// This view owns its OWN filter state ("All | Group | Knockout"), independent
// of the Table view's per-phase filter. The privacy gating is identical: the
// `pickDistributions` map only contains entries for locked phases (the server
// withholds the rest), and the `*Locked` booleans gate display as a second
// layer.
// ============================================================================

export type GridFilter = "all" | "group" | "knockout";

interface MatchesGridViewProps {
  matches: MatchWithTeams[];
  groups: Group[];
  poolSlug: string;
  pickDistributions: Record<string, MatchPickDistribution>;
  groupLocked: boolean;
  knockoutLocked: boolean;
  /**
   * Phase filter, controlled by the parent MatchBrowser so all four
   * views share one All | Group | Knockout selection.
   */
  filter: GridFilter;
  /**
   * True once the tournament is in the Knockout Phase (group stage complete
   * and knockout matches present). When true the bracket is rendered ABOVE
   * the group grid (it's what players care about now), and the bracket cells
   * drop the pick-percentage split in favour of a clean flag + code + win/
   * loss icon. Before the knockout phase the original group-first ordering
   * and percentage display are kept.
   */
  knockoutPhase?: boolean;
}

// ----------------------------------------------------------------------------
// Per-team text style — mirrors the Table view / picks page treatment so a
// match reads identically wherever it appears: italic when not yet played,
// bold for the winner, muted+strikethrough for the loser, plain on a draw.
// ----------------------------------------------------------------------------
function teamTextStyle(match: MatchWithTeams, side: "home" | "away"): string {
  if (match.status !== "completed" || !match.result) return "italic";
  if (match.result === "draw") return "";
  if (match.result === side) return "font-bold";
  return "text-[var(--color-text-muted)] line-through decoration-1";
}

/**
 * Cap a team name at 13 characters for the group matchup line: names ≤ 13
 * pass through; longer ones are cut to 10 chars + "…". Mirrors the helper of
 * the same name on the picks page so a full name renders identically across
 * the app and a long name (e.g. "Bosnia and Herzegovina") can't blow out the
 * compressed two-column group layout. The distribution line below keeps the
 * 3-letter short code, so this only affects the top matchup line.
 */
function truncateTeamName(name: string): string {
  if (name.length <= 13) return name;
  return name.slice(0, 10) + "…";
}

export function MatchesGridView({
  matches,
  groups,
  poolSlug,
  pickDistributions,
  groupLocked,
  knockoutLocked,
  filter,
  knockoutPhase = false,
}: MatchesGridViewProps) {
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.letter.localeCompare(b.letter)),
    [groups]
  );

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

  const showGroup = filter === "all" || filter === "group";
  const showKnockout = filter === "all" || filter === "knockout";

  const groupCount = groupMatches.length;
  const knockoutCount = knockoutMatches.length;
  const visibleCount =
    (showGroup ? groupCount : 0) + (showKnockout ? knockoutCount : 0);

  // Group phase — compressed two-column list.
  const groupSection =
    showGroup && sortedGroups.length > 0 ? (
      <section className="space-y-4">
        {filter === "all" && (
          <h2 className="text-lg font-display font-bold">Group Phase</h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedGroups.map((group) => {
            const gMatches = matchesByGroup.get(group.id) ?? [];
            if (gMatches.length === 0) return null;
            return (
              <div key={group.id}>
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
                  {group.name}
                </h3>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
                  {gMatches.map((match) => (
                    <GroupGridRow
                      key={match.id}
                      match={match}
                      poolSlug={poolSlug}
                      distribution={pickDistributions[match.id]}
                      distributionVisible={groupLocked}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    ) : null;

  // Knockout phase — one-sided bracket. In the Knockout Phase the bracket is
  // a pure "who advanced" view: pick percentages are suppressed
  // (showDistribution={false}) so each cell shows only flag + code + a win/
  // loss icon, and the section floats above the group grid. Before then it
  // keeps the percentage split and sits below the group section.
  const knockoutSection =
    showKnockout && knockoutCount > 0 ? (
      <section className="space-y-4">
        {filter === "all" && (
          <h2 className="text-lg font-display font-bold">Knockout Phase</h2>
        )}
        <KnockoutBracket
          knockoutMatches={knockoutMatches}
          poolSlug={poolSlug}
          pickDistributions={pickDistributions}
          distributionVisible={knockoutLocked && !knockoutPhase}
        />
      </section>
    ) : null;

  return (
    <div className="space-y-5">
      {knockoutPhase ? (
        <>
          {knockoutSection}
          {groupSection}
        </>
      ) : (
        <>
          {groupSection}
          {knockoutSection}
        </>
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

// ============================================================================
// Group grid row — compressed, two-column-friendly, all short codes.
// ----------------------------------------------------------------------------
// Matchup line: [flag HOM] [score/v] [flag AWY]  + status badge.
// Distribution (post-lock): Home / Draw / Away. Inline on ≥ sm, stacked on
// mobile per spec.
// ============================================================================
function GroupGridRow({
  match,
  poolSlug,
  distribution,
  distributionVisible,
}: {
  match: MatchWithTeams;
  poolSlug: string;
  distribution: MatchPickDistribution | undefined;
  distributionVisible: boolean;
}) {
  const hasTeams = !!(match.home_team && match.away_team);
  const isCompleted = match.status === "completed";
  const showDistribution =
    hasTeams && distributionVisible && !!distribution && distribution.total > 0;

  return (
    <Link
      href={`/${poolSlug}/match/${match.id}`}
      className="block px-3 py-2.5 hover:bg-[var(--color-surface-raised)] transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="text-2xs text-[var(--color-text-muted)] w-5 shrink-0 tabular-nums">
            #{match.match_number}
          </span>
          {hasTeams ? (
            <>
              <div className="flex items-center gap-1.5">
                <TeamFlag
                  flagCode={match.home_team!.flag_code}
                  teamName={match.home_team!.name}
                  shortCode={match.home_team!.short_code}
                  size="16x12"
                />
                <span className={cn("text-sm", teamTextStyle(match, "home"))}>
                  {truncateTeamName(match.home_team!.name)}
                </span>
              </div>
              {isCompleted ? (
                <span className="text-sm font-bold tabular-nums px-1">
                  {match.home_score} – {match.away_score}
                </span>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)] px-0.5">
                  v
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <TeamFlag
                  flagCode={match.away_team!.flag_code}
                  teamName={match.away_team!.name}
                  shortCode={match.away_team!.short_code}
                  size="16x12"
                />
                <span className={cn("text-sm", teamTextStyle(match, "away"))}>
                  {truncateTeamName(match.away_team!.name)}
                </span>
              </div>
            </>
          ) : (
            <span className="text-sm text-[var(--color-text-muted)] italic">
              {match.label || "Teams TBD"}
            </span>
          )}
        </div>
        <StatusBadge status={match.status} />
      </div>

      {showDistribution && (
        <GroupDistribution match={match} distribution={distribution!} />
      )}
    </Link>
  );
}

/**
 * Group-match pick split: Home / Draw / Away.
 *
 * Inline on ≥ sm screens; on mobile (< sm) the three outcomes stack
 * vertically so they don't crowd the compressed two-column layout. Uses
 * 3-letter codes for the team outcomes; "Draw" stays literal.
 */
function GroupDistribution({
  match,
  distribution,
}: {
  match: MatchWithTeams;
  distribution: MatchPickDistribution;
}) {
  const isCompleted = match.status === "completed" && !!match.result;
  const total = distribution.total;

  const items: {
    key: "home" | "draw" | "away";
    label: string;
    flagCode?: string;
    teamName?: string;
    shortCode?: string;
    count: number;
  }[] = [
    {
      key: "home",
      label: match.home_team?.short_code ?? "HOM",
      flagCode: match.home_team?.flag_code,
      teamName: match.home_team?.name,
      shortCode: match.home_team?.short_code,
      count: distribution.home,
    },
    { key: "draw", label: "Draw", count: distribution.draw },
    {
      key: "away",
      label: match.away_team?.short_code ?? "AWY",
      flagCode: match.away_team?.flag_code,
      teamName: match.away_team?.name,
      shortCode: match.away_team?.short_code,
      count: distribution.away,
    },
  ];

  return (
    <div className="mt-1.5 pl-7 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-4 gap-y-0.5 text-xs text-[var(--color-text-secondary)]">
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        const isWinner = isCompleted && match.result === item.key;
        const isLoser = isCompleted && !isWinner;
        return (
          <span key={item.key} className="inline-flex items-center gap-1">
            {item.flagCode && item.teamName && item.shortCode ? (
              <TeamFlag
                flagCode={item.flagCode}
                teamName={item.teamName}
                shortCode={item.shortCode}
                size="16x12"
              />
            ) : null}
            <span>{item.label}</span>
            <span className="tabular-nums ml-0.5">{pct}%</span>
            <span className="tabular-nums text-[var(--color-text-muted)]">
              ({item.count})
            </span>
            <span className="inline-flex w-3.5 items-center justify-center">
              {isWinner && <CorrectIcon />}
              {isLoser && <IncorrectIcon />}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Shared bits (icons / status badge) — local copies kept self-contained so
// this file doesn't reach into the Table view's internals.
// ----------------------------------------------------------------------------

function CorrectIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 text-correct"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      viewBox="0 0 24 24"
      aria-label="Winning outcome"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IncorrectIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 text-incorrect"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      viewBox="0 0 24 24"
      aria-label="Incorrect outcome"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
    </svg>
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
        "text-2xs font-medium px-1.5 py-0.5 rounded-full shrink-0",
        styles[status as keyof typeof styles] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {labels[status as keyof typeof labels] ?? status}
    </span>
  );
}
