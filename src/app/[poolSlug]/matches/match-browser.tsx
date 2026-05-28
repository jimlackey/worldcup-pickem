"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { MatchWithTeams, Group, MatchPhase } from "@/types/database";
import type { MatchPickDistribution } from "@/lib/picks/match-pick-counts";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

// ----------------------------------------------------------------------------
// FIFA rank suffix
// ----------------------------------------------------------------------------
//
// Renders " (12)" after a team name when the pool's Show FIFA Rank setting
// is on and the team actually has a recorded ranking. Mirrors the
// RankSuffix used by the What If group picker and the game drilldown so
// the rank reads identically everywhere it appears. `fifaRanking` is the
// team's fifa_ranking column (null when unset → no suffix).
function RankSuffix({
  fifaRanking,
  show,
}: {
  fifaRanking: number | null;
  show: boolean;
}) {
  if (!show) return null;
  if (fifaRanking == null) return null;
  return (
    <span className="text-[var(--color-text-muted)] font-normal ml-1 tabular-nums">
      ({fifaRanking})
    </span>
  );
}

interface MatchBrowserProps {
  matches: MatchWithTeams[];
  groups: Group[];
  poolSlug: string;
  /**
   * Per-match pick distribution counts, keyed by match.id. Server-side
   * the map only contains entries for matches whose phase has locked —
   * pre-lock keys are absent so a hostile client can't peel them out
   * of the props payload.
   *
   * MatchRow gates display on this entry's existence AND on the phase
   * lock flag below, so two-layer privacy: data isn't sent, and the
   * renderer wouldn't show it even if it were.
   */
  pickDistributions: Record<string, MatchPickDistribution>;
  /**
   * True once the group phase has locked. Gates the distribution
   * display on group matches.
   */
  groupLocked: boolean;
  /**
   * True once the knockout phase has locked. Gates the distribution
   * display on knockout matches.
   */
  knockoutLocked: boolean;
  /**
   * The pool's "Show FIFA Rank" setting (pool.show_fifa_rankings). When
   * true, each team name is followed by "(rank)" — both in the matchup
   * row and the per-outcome distribution rows — matching how the
   * What If picker and game drilldown surface the rank. Teams with no
   * recorded ranking (fifa_ranking == null) render no suffix.
   */
  showFifaRankings: boolean;
}

type FilterPhase = "all" | MatchPhase;

/**
 * Per-team text style classes for a match outcome.
 *
 *   - Not completed (scheduled / in_progress): italic, normal weight.
 *     Signals "the matchup is locked in but hasn't resolved" — distinct
 *     from the completed-state styles below.
 *   - Completed, draw: normal weight, no special colour. Both teams
 *     read the same since neither "won".
 *   - Completed, this team won: bold, no special colour.
 *   - Completed, this team lost: muted text + strikethrough (same
 *     treatment as the What If page's losing team rows, kept
 *     visually consistent across the app).
 */
function teamTextStyle(
  match: MatchWithTeams,
  side: "home" | "away"
): string {
  if (match.status !== "completed" || !match.result) {
    // Pre-completion: italic neutral text. Same shape regardless of
    // whether the match is scheduled or live — both are "waiting on
    // a result" from the rendering layer's point of view.
    return "italic";
  }
  if (match.result === "draw") {
    return "";
  }
  if (match.result === side) {
    // Winner: bold, default colour (the score next to them carries
    // the visual weight too, so we don't add a hue).
    return "font-bold";
  }
  // Loser: same mute + strikethrough treatment used in What If.
  return "text-[var(--color-text-muted)] line-through decoration-1";
}

export function MatchBrowser({
  matches,
  groups,
  poolSlug,
  pickDistributions,
  groupLocked,
  knockoutLocked,
  showFifaRankings,
}: MatchBrowserProps) {
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

  // Bucket knockout matches by phase (stable order). Consolation slots in
  // before the Final since it's typically played the day prior, and matchwise
  // it's a "last chance" round adjacent to the championship match. If the
  // pool has the consolation flag disabled, getMatches() will have already
  // filtered #104 out, so the consolation bucket will simply be empty here.
  const phaseOrder: MatchPhase[] = ["r32", "r16", "qf", "sf", "consolation", "final"];
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

  // Phase filter tabs. The Consolation tab is only shown when this pool
  // actually has a consolation match (signalled by a non-empty bucket). For
  // pools with the flag disabled we hide the tab entirely rather than render
  // a tab that produces no results.
  const phases: { value: FilterPhase; label: string }[] = [
    { value: "all", label: "All" },
    { value: "group", label: "Group" },
    { value: "r32", label: "R32" },
    { value: "r16", label: "R16" },
    { value: "qf", label: "QF" },
    { value: "sf", label: "SF" },
    ...(knockoutByPhase.has("consolation")
      ? ([{ value: "consolation" as FilterPhase, label: "Consolation" }])
      : []),
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
                      distribution={pickDistributions[match.id]}
                      // Group matches use the group lock; knockout
                      // matches use the knockout lock. The boolean
                      // alone gates the display — the data map only
                      // contains entries for locked phases (see page
                      // comment), so this is belt-and-braces.
                      distributionVisible={groupLocked}
                      showFifaRankings={showFifaRankings}
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
                      distribution={pickDistributions[match.id]}
                      distributionVisible={knockoutLocked}
                      showFifaRankings={showFifaRankings}
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
  distribution,
  distributionVisible,
  showFifaRankings,
}: {
  match: MatchWithTeams;
  poolSlug: string;
  showGroupLetter: boolean;
  distribution: MatchPickDistribution | undefined;
  distributionVisible: boolean;
  showFifaRankings: boolean;
}) {
  const hasTeams = match.home_team && match.away_team;
  const isGroup = match.phase === "group";

  // Show the distribution panel when:
  //   - we have teams to label rows with (TBD matches have no useful
  //     "Mexico vs South Africa" structure to attach pick counts to)
  //   - the phase has locked (privacy gate)
  //   - we actually got a distribution entry back from the server
  //     (counts > 0 — empty distributions are dropped so a no-picks
  //     match doesn't render an empty grid)
  const showDistribution =
    !!hasTeams &&
    distributionVisible &&
    !!distribution &&
    distribution.total > 0;

  return (
    <Link
      href={`/${poolSlug}/match/${match.id}`}
      className="block hover:bg-[var(--color-surface-raised)] transition-colors"
    >
      {/* Matchup row — preserves the existing layout (flag/name + score +
          flag/name + status badge). Only the team-name styling changed:
          colour classes were dropped in favour of weight/italic/strike
          per spec. */}
      <div className="flex items-center justify-between px-4 py-3">
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
                  className={cn(
                    "text-sm sm:hidden",
                    teamTextStyle(match, "home")
                  )}
                >
                  {match.home_team!.short_code}
                  <RankSuffix
                    fifaRanking={match.home_team!.fifa_ranking}
                    show={showFifaRankings}
                  />
                </span>
                <span
                  className={cn(
                    "text-sm hidden sm:inline",
                    teamTextStyle(match, "home")
                  )}
                >
                  {match.home_team!.name}
                  <RankSuffix
                    fifaRanking={match.home_team!.fifa_ranking}
                    show={showFifaRankings}
                  />
                </span>
              </div>

              {match.status === "completed" ? (
                <span className="text-sm font-bold tabular-nums px-1.5 whitespace-nowrap">
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
                  className={cn(
                    "text-sm sm:hidden",
                    teamTextStyle(match, "away")
                  )}
                >
                  {match.away_team!.short_code}
                  <RankSuffix
                    fifaRanking={match.away_team!.fifa_ranking}
                    show={showFifaRankings}
                  />
                </span>
                <span
                  className={cn(
                    "text-sm hidden sm:inline",
                    teamTextStyle(match, "away")
                  )}
                >
                  {match.away_team!.name}
                  <RankSuffix
                    fifaRanking={match.away_team!.fifa_ranking}
                    show={showFifaRankings}
                  />
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
      </div>

      {/* Pick distribution panel — sits beneath the matchup row inside
          the same <Link>. Indented to align past the #N column. Only
          renders post-lock; pre-lock the server doesn't ship the data
          AND this gate would suppress it anyway. */}
      {showDistribution && (
        <DistributionPanel
          match={match}
          distribution={distribution!}
          isGroup={isGroup}
        />
      )}
    </Link>
  );
}

/**
 * Pick distribution panel — one row per outcome (home, draw, away
 * for group matches; home, away for knockout). Each row shows:
 *   - team flag + label (or "Draw" for the centre row)
 *   - percentage of pick sets that picked it
 *   - raw count in parentheses
 *   - icon: green check if this outcome won, red X if it didn't,
 *     nothing if the match isn't completed yet
 *
 * Renders inside the parent <Link> so taps anywhere on the panel
 * still navigate to the match drilldown.
 */
/**
 * Pick distribution panel — all outcomes on a single horizontal line.
 *
 * Layout per outcome:
 *   [flag] [label] [pct]% ([count]) [icon]
 *
 *   - Group matches: three outcomes — Home, Draw, Away.
 *   - Knockout matches: two outcomes — Home, Away. No "Draw" since
 *     knockouts always resolve to a winner; rendering a 0% Draw
 *     would be misleading.
 *
 * Label switches between full team name (≥ sm) and 3-letter short
 * code (< sm) via Tailwind's responsive classes, mirroring the
 * matchup row above. The "Draw" centre item carries the same
 * literal label at both breakpoints since "Draw" is already short.
 *
 * Flags stay at the 16x12 small size at every breakpoint — the
 * spec is explicit about that.
 *
 * Sits inside the parent <Link> so taps anywhere on the line still
 * navigate to the match drilldown. flex-wrap is the overflow guard
 * for very narrow viewports: the rightmost outcome drops to a new
 * line rather than the row being clipped or its numbers
 * truncated.
 */
function DistributionPanel({
  match,
  distribution,
  isGroup,
}: {
  match: MatchWithTeams;
  distribution: MatchPickDistribution;
  isGroup: boolean;
}) {
  const isCompleted = match.status === "completed" && !!match.result;
  const total = distribution.total;

  type Item = {
    key: "home" | "draw" | "away" | "other";
    label: string;          // wide-screen label (full name, or "Draw"/"Other")
    shortLabel: string;     // narrow-screen label (3-letter code, or "Draw"/"Other")
    flagCode?: string;
    teamName?: string;
    shortCode?: string;
    count: number;
  };

  const items: Item[] = [
    {
      key: "home",
      label: match.home_team?.name ?? "Home",
      shortLabel: match.home_team?.short_code ?? "HOM",
      flagCode: match.home_team?.flag_code,
      teamName: match.home_team?.name,
      shortCode: match.home_team?.short_code,
      count: distribution.home,
    },
  ];
  if (isGroup) {
    items.push({
      key: "draw",
      label: "Draw",
      shortLabel: "Draw",
      count: distribution.draw,
    });
  }
  items.push({
    key: "away",
    label: match.away_team?.name ?? "Away",
    shortLabel: match.away_team?.short_code ?? "AWY",
    flagCode: match.away_team?.flag_code,
    teamName: match.away_team?.name,
    shortCode: match.away_team?.short_code,
    count: distribution.away,
  });

  // Knockout "Other" bucket: pick sets that picked a team eliminated
  // before this match (so it's not one of the two participants). Only
  // shown for knockout matches and only when there's at least one such
  // pick — group matches never populate `other`, and a 0-count Other
  // row would be noise. No flag (there's no single team it represents);
  // the label is just "Other" at both breakpoints.
  if (!isGroup && distribution.other > 0) {
    items.push({
      key: "other",
      label: "Other",
      shortLabel: "Other",
      count: distribution.other,
    });
  }

  return (
    <div
      // Indent past the #N column on the matchup row above so the
      // distribution visually nests under the matchup. The negative
      // top-margin pulls the panel closer to the matchup row so the
      // two read as a single unit rather than a separate block.
      // flex-wrap is the overflow safety net for narrow viewports —
      // the rightmost outcome drops to a new row instead of the
      // numbers getting truncated.
      className="pl-12 pr-4 pb-3 -mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]"
    >
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        const isWinner = isCompleted && match.result === item.key;
        const isLoser = isCompleted && !isWinner;

        return (
          <span
            key={item.key}
            // Each outcome group renders inline. The inner spans use
            // tabular-nums so the percent / count text holds its
            // column width even when the digit count changes between
            // matches (37% vs 7%, 130 vs 9).
            className="inline-flex items-center gap-1"
          >
            {/* Flag — present for home/away, absent for the Draw item. */}
            {item.flagCode && item.teamName && item.shortCode ? (
              <TeamFlag
                flagCode={item.flagCode}
                teamName={item.teamName}
                shortCode={item.shortCode}
                size="16x12"
              />
            ) : null}
            {/* Label: full name on ≥ sm, short code on < sm. The
                Draw/Other rows' two labels are identical so they show
                the same text at both breakpoints without churn. No FIFA
                rank suffix here — the rank already appears on the matchup
                row above, so repeating it on every pick row is redundant. */}
            <span className="hidden sm:inline">{item.label}</span>
            <span className="sm:hidden">{item.shortLabel}</span>
            <span className="tabular-nums ml-0.5">{pct}%</span>
            <span className="tabular-nums text-[var(--color-text-muted)]">
              ({item.count})
            </span>
            {/* Icon column. Fixed width so the absent state (in-
                flight match) doesn't shift the spacing between
                outcomes — keeps "Mexico 37% (93) ⠀ ⠀ Draw 18%
                ..." readable across mixed completed/scheduled
                lists. */}
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

/** Green check — the winning outcome on a completed match. */
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

/** Red × — an incorrect outcome on a completed match. */
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
        "text-2xs font-medium px-1.5 py-0.5 rounded-full",
        styles[status as keyof typeof styles] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {labels[status as keyof typeof labels] ?? status}
    </span>
  );
}
