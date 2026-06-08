"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { MatchWithTeams, Group } from "@/types/database";
import type { MatchPickDistribution } from "@/lib/picks/match-pick-counts";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";
import { KnockoutBracket } from "./knockout-bracket";

// ============================================================================
// Tiles view for /matches
// ----------------------------------------------------------------------------
// The third of the /matches sub-views (alongside Table and Grid). It re-uses
// the same match + pick-distribution data, but presents each match as a row
// of three side-by-side tiles (home / Draw / away) — the same visual shape as
// the What If group picker's UndecidedRow — except here each tile is a
// read-only display showing the outcome label, the percentage of pick sets
// that chose it, and the raw count.
//
// Behaviour per spec:
//   • Completed match  → the winning outcome's tile is green (the pitch
//     hypothetical-pick treatment), the other outcomes grey.
//   • Not-yet-played   → every tile renders plain white.
//   • Knockout matches → two tiles only (home / away), no Draw.
//   • No status badges ("Upcoming"/"Final"), no check/X icons.
//
// The two-column group layout is preserved (matching the existing Grid view
// and the original screenshot), and the whole match row is wrapped in a Link
// to the drilldown so a tap anywhere navigates through.
//
// Privacy gating is identical to the other views: `pickDistributions` only
// contains entries for locked phases (server withholds the rest), and the
// `*Locked` booleans gate display as a second layer. Pre-lock the percentage
// / count simply don't render — the tiles still show the matchup so the page
// isn't empty.
// ============================================================================

export type TilesFilter = "all" | "group" | "knockout";

interface MatchesTilesViewProps {
  matches: MatchWithTeams[];
  groups: Group[];
  poolSlug: string;
  pickDistributions: Record<string, MatchPickDistribution>;
  groupLocked: boolean;
  knockoutLocked: boolean;
  /**
   * The pool's "Show FIFA Rank" setting. When true, a "(rank)" suffix is
   * appended to each team name on the tile (full-name breakpoint only),
   * matching the other views.
   */
  showFifaRankings: boolean;
  /**
   * Phase filter, controlled by the parent MatchBrowser so all four
   * views share one All | Group | Knockout selection.
   */
  filter: TilesFilter;
}

export function MatchesTilesView({
  matches,
  groups,
  poolSlug,
  pickDistributions,
  groupLocked,
  knockoutLocked,
  showFifaRankings,
  filter,
}: MatchesTilesViewProps) {
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

  return (
    <div className="space-y-5">
      {/* Group phase — two-column section grid */}
      {showGroup && sortedGroups.length > 0 && (
        <section className="space-y-4">
          {filter === "all" && (
            <h2 className="text-lg font-display font-bold">Group Phase</h2>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
                      <MatchTileRow
                        key={match.id}
                        match={match}
                        poolSlug={poolSlug}
                        distribution={pickDistributions[match.id]}
                        distributionVisible={groupLocked}
                        showFifaRankings={showFifaRankings}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Knockout phase — same one-sided bracket as the Grid view. The
          Tiles treatment only applies to the group phase; for knockout we
          render the shared KnockoutBracket so this view is identical to
          Grid → Knockout (single source of truth in knockout-bracket.tsx).
          Distribution privacy is gated by knockoutLocked, same as before. */}
      {showKnockout && knockoutCount > 0 && (
        <section className="space-y-4">
          {filter === "all" && (
            <h2 className="text-lg font-display font-bold">Knockout Phase</h2>
          )}
          <KnockoutBracket
            knockoutMatches={knockoutMatches}
            poolSlug={poolSlug}
            pickDistributions={pickDistributions}
            distributionVisible={knockoutLocked}
          />
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

// ----------------------------------------------------------------------------
// A single match rendered as a row of tiles.
//   • Group match    → home | Draw | away
//   • Knockout match  → home | away
//
// When the match has teams TBD (no home/away resolved yet — common in the
// knockout bracket before feeders complete) we fall back to a single muted
// label tile rather than rendering empty flag tiles.
// ----------------------------------------------------------------------------
function MatchTileRow({
  match,
  poolSlug,
  distribution,
  distributionVisible,
  showFifaRankings,
}: {
  match: MatchWithTeams;
  poolSlug: string;
  distribution: MatchPickDistribution | undefined;
  distributionVisible: boolean;
  showFifaRankings: boolean;
}) {
  const hasTeams = !!(match.home_team && match.away_team);
  const isGroup = match.phase === "group";
  const isCompleted = match.status === "completed" && !!match.result;

  // Distribution numbers are only meaningful (and only shipped by the
  // server) once the phase has locked AND we have a populated entry.
  const showStats =
    hasTeams &&
    distributionVisible &&
    !!distribution &&
    distribution.total > 0;

  const total = distribution?.total ?? 0;
  const pct = (count: number) =>
    total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <Link
      href={`/${poolSlug}/match/${match.id}`}
      className="block group/match"
    >
      {!hasTeams ? (
        <div className="px-3 py-2.5 text-sm text-[var(--color-text-muted)] italic">
          {match.label || "Teams TBD"}
        </div>
      ) : (
        <div className="flex items-stretch gap-1.5 px-2 py-1.5">
          {/* Home */}
          <OutcomeTile
            won={isCompleted && match.result === "home"}
            isCompleted={isCompleted}
            flagCode={match.home_team!.flag_code}
            teamName={match.home_team!.name}
            shortCode={match.home_team!.short_code}
            fifaRanking={match.home_team!.fifa_ranking}
            showFifaRankings={showFifaRankings}
            showStats={showStats}
            pct={pct(distribution?.home ?? 0)}
            count={distribution?.home ?? 0}
            score={isCompleted ? match.home_score : null}
          />

          {/* Draw — group matches only */}
          {isGroup && (
            <OutcomeTile
              won={isCompleted && match.result === "draw"}
              isCompleted={isCompleted}
              label="Draw"
              showFifaRankings={showFifaRankings}
              showStats={showStats}
              pct={pct(distribution?.draw ?? 0)}
              count={distribution?.draw ?? 0}
            />
          )}

          {/* Away */}
          <OutcomeTile
            won={isCompleted && match.result === "away"}
            isCompleted={isCompleted}
            flagCode={match.away_team!.flag_code}
            teamName={match.away_team!.name}
            shortCode={match.away_team!.short_code}
            fifaRanking={match.away_team!.fifa_ranking}
            showFifaRankings={showFifaRankings}
            showStats={showStats}
            pct={pct(distribution?.away ?? 0)}
            count={distribution?.away ?? 0}
            score={isCompleted ? match.away_score : null}
          />
        </div>
      )}
    </Link>
  );
}

// ----------------------------------------------------------------------------
// One outcome tile.
//
// Colour treatment per spec:
//   • match completed + this outcome won → green (pitch) fill/border/text.
//   • match completed + this outcome lost → grey (muted) fill/border/text.
//   • match not yet played               → plain white surface.
//
// Layout: flag + label on the left, percentage + count on the right. The
// label switches between full team name (≥ sm) and 3-letter code (< sm),
// mirroring the other views. The "Draw" tile passes `label` directly with no
// flag. Percentage / count only render when `showStats` is true (post-lock).
// ----------------------------------------------------------------------------
function OutcomeTile({
  won,
  isCompleted,
  flagCode,
  teamName,
  shortCode,
  fifaRanking,
  label,
  showFifaRankings,
  showStats,
  pct,
  count,
  score,
}: {
  won: boolean;
  isCompleted: boolean;
  flagCode?: string;
  teamName?: string;
  shortCode?: string;
  fifaRanking?: number | null;
  label?: string;
  showFifaRankings: boolean;
  showStats: boolean;
  pct: number;
  count: number;
  /** This team's goals, bold beside the code, when the match is completed. */
  score?: number | null;
}) {
  // Determine the colour bucket.
  //   - not completed       → white
  //   - completed + won      → green
  //   - completed + lost     → grey
  const tone = !isCompleted ? "white" : won ? "win" : "loss";

  return (
    <div
      className={cn(
        "flex-1 min-w-0 rounded-md border px-2.5 py-2 transition-colors",
        "flex items-center justify-between gap-1.5",
        tone === "win" &&
          "bg-pitch-100 border-pitch-400 ring-1 ring-pitch-500/30 text-pitch-700",
        tone === "loss" &&
          "bg-[var(--color-surface-raised)] border-[var(--color-border)] text-[var(--color-text-muted)]",
        tone === "white" &&
          "bg-[var(--color-surface)] border-[var(--color-border)] group-hover/match:border-pitch-300"
      )}
    >
      {/* Left: flag + name (or "Draw") */}
      <span className="inline-flex items-center gap-1.5 min-w-0">
        {flagCode && teamName && shortCode ? (
          <TeamFlag
            flagCode={flagCode}
            teamName={teamName}
            shortCode={shortCode}
            size="16x12"
          />
        ) : null}
        {label ? (
          <span className="text-xs font-medium truncate">{label}</span>
        ) : (
          <span className="text-xs font-medium truncate inline-flex items-baseline gap-1">
            <span>{shortCode}</span>
            {showFifaRankings && fifaRanking != null ? (
              <span className="font-normal text-[var(--color-text-muted)] tabular-nums">
                ({fifaRanking})
              </span>
            ) : null}
            {isCompleted && score != null ? (
              <span className="font-bold tabular-nums">{score}</span>
            ) : null}
          </span>
        )}
      </span>

      {/* Right: percentage + count (post-lock only) */}
      {showStats ? (
        <span className="inline-flex items-baseline gap-1 shrink-0 tabular-nums text-xs">
          <span className="font-medium">{pct}%</span>
          <span
            className={cn(
              tone === "win"
                ? "text-pitch-600/70"
                : "text-[var(--color-text-muted)]"
            )}
          >
            ({count})
          </span>
        </span>
      ) : null}
    </div>
  );
}
