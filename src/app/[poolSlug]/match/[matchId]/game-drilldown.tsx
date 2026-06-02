"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MatchWithTeams, Pool, Team } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import { formatMoneyLine } from "@/lib/lines/format";
import { cn } from "@/lib/utils/cn";
import {
  FavoritesTabs,
  type FavoritesTabKey,
} from "@/components/favorites/favorites-tabs";
import { FavoriteStar } from "@/components/favorites/favorite-star";

interface GroupPickEntry {
  pick: string;
  is_correct: boolean | null;
  pick_set: {
    id: string;
    name: string;
    participant: { display_name: string | null; email: string };
  };
}

interface KnockoutPickEntry {
  picked_team_id: string;
  is_correct: boolean | null;
  /**
   * The actual team this pick selected, joined from the teams table.
   * May be a team NOT participating in this match — from R16 onward a
   * pick can point at a country eliminated earlier in the bracket. Null
   * only if the team row is somehow missing (defensive). This is what
   * lets the view show the real picked team instead of coercing every
   * pick to one of the two participants.
   */
  picked_team: {
    id: string;
    name: string;
    short_code: string;
    flag_code: string;
  } | null;
  pick_set: {
    id: string;
    name: string;
    participant: { display_name: string | null; email: string };
  };
}

interface GameDrilldownProps {
  match: MatchWithTeams;
  groupPicks: GroupPickEntry[];
  knockoutPicks: KnockoutPickEntry[];
  rankByPickSet: Record<string, number>;
  /**
   * Per pick-set points (group / knockout / total) — same numbers
   * the /standings page renders. Drives the three new point columns
   * in the player list. Pick sets missing from the map default to
   * 0 points; that's the expected shape because they appeared in
   * the picks list but not in standings (an edge case that
   * shouldn't happen in production but we don't crash on).
   */
  pointsByPickSet: Record<
    string,
    { group: number; knockout: number; total: number }
  >;
  poolSlug: string;
  /**
   * Pool ID is needed for the per-row FavoriteStar toggle — same
   * pattern the standings page uses. We could derive this from
   * `pool.id` below, but explicit is clearer for the small number
   * of touch points.
   */
  poolId: string;
  /**
   * The pool this drilldown is being rendered inside of. Carries the two
   * display flags (show_fifa_rankings, show_match_lines) that gate the
   * rank inline-badge in the header and the money-line subtext beneath
   * each Pick Distribution row label. Same flags consumed by
   * /my-picks/{id}/group-picks-form.tsx, so the UI is consistent
   * between the editable form and this read-only view.
   */
  pool: Pool;
  /** True when group picks are still open — hide distribution + list */
  groupPicksHidden?: boolean;
  /** True when knockout picks are still open — hide list for knockout matches */
  knockoutPicksHidden?: boolean;
  /**
   * Pick set IDs this user has favorited. Drives the per-row star
   * fill state and the Favorites sub-tab count. Empty when the
   * visitor is logged out.
   */
  favoritePickSetIds: string[];
  /**
   * Whether the visitor is logged in. Controls whether the star
   * icons render at all and whether the Favorites sub-tab is
   * interactable. Matches the same prop contract the standings
   * page uses.
   */
  isLoggedIn: boolean;
  /**
   * True once the knockout phase has fully locked (phase 4). Gates
   * the new Tourney Winner column: column hidden pre-lock; shown
   * post-lock. Server-side data fetch is also gated on this — the
   * tourneyWinnerPicks map will be empty when this is false.
   */
  knockoutLocked: boolean;
  /**
   * Per-pick-set pick for the Final (match #103). Only populated
   * when knockoutLocked is true; the privacy gate lives in the
   * server fetch.
   */
  tourneyWinnerPicks: Record<
    string,
    { teamName: string; teamCode: string; flagCode: string }
  >;
}

/**
 * Truncate a team name to a maximum of 13 characters. Names 13 chars or
 * shorter pass through unchanged; longer names are cut to their first 10
 * characters plus "..." (so the maximum rendered length is always 13).
 *
 * Mirrors the same helper used in pick-set-detail.tsx and
 * pick-set-bracket-view.tsx — keeping badge labels visually bounded so the
 * fixed-width badge column stays stable row-to-row. Defined locally rather
 * than shared since it's three lines and the call sites don't otherwise
 * need to import from each other.
 */
function truncateTeamName(name: string): string {
  if (name.length <= 13) return name;
  return name.slice(0, 10) + "...";
}

/**
 * Inline FIFA-ranking suffix rendered next to a team name when the pool
 * flag is on. Returns null (no DOM) when the flag is off or when the team
 * has no ranking on record. Same convention used by the editable picks
 * form for visual consistency.
 *
 * Rendered as a smaller, muted span so the team name itself stays the
 * primary read.
 */
function RankSuffix({ team, show }: { team: Team; show: boolean }) {
  if (!show) return null;
  if (team.fifa_ranking == null) return null;
  return (
    <span className="text-xs text-[var(--color-text-muted)] font-normal ml-1.5 tabular-nums">
      ({team.fifa_ranking})
    </span>
  );
}

/**
 * Pick filter selector for the player list. "all" passes everything
 * through; the others filter the list to just those pick sets that
 * picked that outcome. "draw" is only surfaced for group matches
 * (knockouts don't allow draws). "other" is only surfaced for knockout
 * matches and only when at least one pick selected a team that isn't a
 * participant (an eliminated team) — it shows exactly those pick sets.
 */
type PickFilter = "all" | "home" | "draw" | "away" | "other";

export function GameDrilldown({
  match,
  groupPicks,
  knockoutPicks,
  rankByPickSet,
  pointsByPickSet,
  poolSlug,
  poolId,
  pool,
  groupPicksHidden,
  knockoutPicksHidden,
  favoritePickSetIds,
  isLoggedIn,
  knockoutLocked,
  tourneyWinnerPicks,
}: GameDrilldownProps) {
  const isGroup = match.phase === "group";
  const isCompleted = match.status === "completed";

  const showRankings = Boolean(pool.show_fifa_rankings);
  const showLines = Boolean(pool.show_match_lines);

  // Favorites set for O(1) membership checks — same convention as
  // the standings page.
  const favoriteIds = useMemo(
    () => new Set(favoritePickSetIds),
    [favoritePickSetIds]
  );

  // ---- Favorites sub-tab ----
  //
  // Mirror the /standings page's All / Favorites toggle. State is
  // local-only; URL sync wouldn't add much since this view is
  // bookmark-scoped to a specific match anyway.
  const [tab, setTab] = useState<FavoritesTabKey>("all");

  // ---- Filter by pick outcome ----
  //
  // Players can be filtered to just those who picked a specific
  // outcome — Home, Draw (group only), Away. "all" is the default,
  // unfiltered view.
  //
  // State is local-only (no URL sync) because the filter is exploratory
  // and the cost of losing it on navigation is trivial — same call as
  // /standings makes for its text filter.
  //
  // Note: when no entry exists for the type (the user is looking at
  // a knockout match but a stale "draw" filter sits in state) we
  // silently treat it as "all". Shouldn't happen normally; the pill
  // strip below only exposes valid options per phase.
  const [pickFilter, setPickFilter] = useState<PickFilter>("all");

  // Sort picks by standings rank (first place at top)
  const sortedGroupPicks = [...groupPicks].sort((a, b) => {
    const rankA = rankByPickSet[a.pick_set.id] ?? 9999;
    const rankB = rankByPickSet[b.pick_set.id] ?? 9999;
    return rankA - rankB;
  });

  const sortedKnockoutPicks = [...knockoutPicks].sort((a, b) => {
    const rankA = rankByPickSet[a.pick_set.id] ?? 9999;
    const rankB = rankByPickSet[b.pick_set.id] ?? 9999;
    return rankA - rankB;
  });

  // Apply BOTH filters — favorites first (the tab), then the pick
  // outcome (the pill strip). Same two-stage shape as the standings
  // page. Applied after the rank sort so rank ordering is preserved
  // across filter changes (a 5th-place player who picked Mexico
  // stays at #5 in the filtered Mexico view rather than getting
  // renumbered as #1).
  const filteredGroupPicks = useMemo(() => {
    let arr = sortedGroupPicks;
    if (tab === "favorites") {
      arr = arr.filter((p) => favoriteIds.has(p.pick_set.id));
    }
    if (pickFilter !== "all") {
      arr = arr.filter((p) => p.pick === pickFilter);
    }
    return arr;
  }, [sortedGroupPicks, pickFilter, tab, favoriteIds]);

  const filteredKnockoutPicks = useMemo(() => {
    let arr = sortedKnockoutPicks;
    if (tab === "favorites") {
      arr = arr.filter((p) => favoriteIds.has(p.pick_set.id));
    }
    if (pickFilter !== "all") {
      // "draw" doesn't apply to knockout matches; rather than ignoring
      // the filter we treat it as "show nothing" so the UI doesn't
      // silently hide a confusing state. The pill strip below avoids
      // emitting a Draw option for knockout matches anyway.
      if (pickFilter === "draw") return [];
      if (pickFilter === "other") {
        // Picks for a team that is NOT one of the two participants —
        // i.e. a country eliminated before this match.
        arr = arr.filter(
          (p) =>
            p.picked_team_id !== match.home_team_id &&
            p.picked_team_id !== match.away_team_id
        );
      } else {
        const targetTeamId =
          pickFilter === "home" ? match.home_team_id : match.away_team_id;
        if (!targetTeamId) return [];
        arr = arr.filter((p) => p.picked_team_id === targetTeamId);
      }
    }
    return arr;
  }, [
    sortedKnockoutPicks,
    pickFilter,
    tab,
    favoriteIds,
    match.home_team_id,
    match.away_team_id,
  ]);

  // Whether any knockout pick selected a non-participant (eliminated)
  // team. Gates the "Other" filter pill — no point offering a filter
  // that would always be empty.
  const hasOtherKnockoutPicks = useMemo(
    () =>
      knockoutPicks.some(
        (p) =>
          p.picked_team_id !== match.home_team_id &&
          p.picked_team_id !== match.away_team_id
      ),
    [knockoutPicks, match.home_team_id, match.away_team_id]
  );

  // Calculate vote distribution for group picks
  const voteCounts = { home: 0, draw: 0, away: 0 };
  for (const p of groupPicks) {
    if (p.pick in voteCounts) {
      voteCounts[p.pick as keyof typeof voteCounts]++;
    }
  }
  const totalVotes = groupPicks.length;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/${poolSlug}/matches`}
        className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
      >
        ← Back to Matches
      </Link>

      {/* Match header.
          
          Money lines used to render as small muted text underneath each
          team's short code here. They've moved into the Pick Distribution
          row labels below — that surface has a natural slot for all three
          values (home / draw / away) and lets the header focus on the
          matchup itself. */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-3">
          {PHASE_LABELS[match.phase]} · Match #{match.match_number}
        </p>

        <div className="flex items-center justify-center gap-6">
          {match.home_team ? (
            <div className="flex flex-col items-center gap-1.5">
              <TeamFlag
                flagCode={match.home_team.flag_code}
                teamName={match.home_team.name}
                shortCode={match.home_team.short_code}
                size="64x48"
              />
              <span className="font-display font-bold text-lg flex items-baseline">
                {match.home_team.name}
                <RankSuffix team={match.home_team} show={showRankings} />
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {match.home_team.short_code}
              </span>
            </div>
          ) : (
            <span className="text-[var(--color-text-muted)]">TBD</span>
          )}

          <div className="text-center">
            {isCompleted ? (
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  {match.home_score} – {match.away_score}
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Full Time
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xl font-bold text-[var(--color-text-muted)]">
                  vs
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {match.status === "in_progress" ? "Live" : "Scheduled"}
                </p>
              </div>
            )}
          </div>

          {match.away_team ? (
            <div className="flex flex-col items-center gap-1.5">
              <TeamFlag
                flagCode={match.away_team.flag_code}
                teamName={match.away_team.name}
                shortCode={match.away_team.short_code}
                size="64x48"
              />
              <span className="font-display font-bold text-lg flex items-baseline">
                {match.away_team.name}
                <RankSuffix team={match.away_team} show={showRankings} />
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {match.away_team.short_code}
              </span>
            </div>
          ) : (
            <span className="text-[var(--color-text-muted)]">TBD</span>
          )}
        </div>
      </div>

      {/* Group picks hidden message — shown for group matches pre-lock */}
      {isGroup && groupPicksHidden && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Picks are hidden until group phase picks lock and games begin.
          </p>
        </div>
      )}

      {/* Vote distribution (group matches, only when picks are visible).
          
          The label column carries the team name (or "Draw") with the
          money line appended inline as a muted parenthetical, e.g.
          "Mexico (-228)". When showLines is off or this side has no
          line on file, the parenthetical span is omitted and only the
          label renders. */}
      {isGroup && !groupPicksHidden && totalVotes > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">
            Pick Distribution
            <span className="font-normal text-[var(--color-text-muted)] ml-2">
              {totalVotes} player{totalVotes !== 1 ? "s" : ""}
            </span>
          </h2>

          <div className="space-y-2">
            {[
              {
                key: "home",
                label: match.home_team?.name ?? "Home",
                line: match.home_money_line,
              },
              { key: "draw", label: "Draw", line: match.draw_money_line },
              {
                key: "away",
                label: match.away_team?.name ?? "Away",
                line: match.away_money_line,
              },
            ].map(({ key, label, line }) => {
              const count = voteCounts[key as keyof typeof voteCounts];
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isCorrectOption = isCompleted && match.result === key;
              const formattedLine = showLines ? formatMoneyLine(line) : null;

              return (
                <div key={key} className="flex items-center gap-3">
                  {/* Label cell: team name (or "Draw") with the money
                      line inline as a muted parenthetical — e.g.
                      "Mexico (-228)" or "South Africa (+475)". Bumped
                      to w-32 (was w-20) to fit the longest realistic
                      "country (+xxxx)" string at text-xs without
                      truncating; team names longer than that still
                      ellipsize via the outer truncate, and the
                      whitespace-nowrap on the line suffix keeps
                      "(-228)" from wrapping if the cell ever feels
                      tight. */}
                  <span className="w-32 shrink-0 truncate text-xs font-medium">
                    {label}
                    {formattedLine && (
                      <span className="ml-1 font-normal text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
                        ({formattedLine})
                      </span>
                    )}
                  </span>
                  <div className="flex-1 h-6 bg-[var(--color-surface-raised)] rounded-md overflow-hidden relative">
                    <div
                      className={cn(
                        "h-full flex items-center justify-end pr-2 transition-all",
                        isCorrectOption ? "bg-correct/20" : "bg-pitch-100"
                      )}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    >
                      {pct > 10 && (
                        <span className="text-2xs font-bold">{pct}%</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)] w-8 tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Individual picks list — sorted by standings rank */}
      {isGroup && !groupPicksHidden && sortedGroupPicks.length > 0 && (
        <div className="space-y-2">
          {/* Two-row header section:
                Row 1: title + Favorites/All tab (right)
                Row 2: pick-outcome filter pills (right) + "Showing X of Y"
              The two are split into separate rows on narrow viewports so
              neither group runs out of room — flex-wrap on each row keeps
              the right-side groups flush-right when they fit and stacks
              them under the title when they don't. */}
          <ListHeader
            title="All Players"
            tab={tab}
            onTabChange={setTab}
            isLoggedIn={isLoggedIn}
            favoritesCount={favoritePickSetIds.length}
            pickFilter={pickFilter}
            onPickFilterChange={setPickFilter}
            homeLabel={truncateTeamName(match.home_team?.name ?? "Home")}
            awayLabel={truncateTeamName(match.away_team?.name ?? "Away")}
            showDraw
            showOther={false}
            totalCount={sortedGroupPicks.length}
            filteredCount={filteredGroupPicks.length}
          />
          {filteredGroupPicks.length === 0 ? (
            <EmptyFilterState tab={tab} />
          ) : (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
              <PlayerListHeader
                isLoggedIn={isLoggedIn}
                showTourneyWinnerColumn={knockoutLocked}
              />
              <div className="divide-y divide-[var(--color-border)]">
                {filteredGroupPicks.map((p) => {
                  // Team name (or "Draw") to show in the badge, pre-truncated.
                  const badgeLabel =
                    p.pick === "home"
                      ? truncateTeamName(match.home_team?.name ?? "Home")
                      : p.pick === "away"
                        ? truncateTeamName(match.away_team?.name ?? "Away")
                        : "Draw";
                  return (
                    <PlayerRow
                      key={p.pick_set.id}
                      pickSetId={p.pick_set.id}
                      pickSetName={p.pick_set.name}
                      isCorrect={p.is_correct}
                      badgeLabel={badgeLabel}
                      rank={rankByPickSet[p.pick_set.id]}
                      points={pointsByPickSet[p.pick_set.id]}
                      tourneyWinnerPick={tourneyWinnerPicks[p.pick_set.id]}
                      showTourneyWinnerColumn={knockoutLocked}
                      isFavorite={favoriteIds.has(p.pick_set.id)}
                      isLoggedIn={isLoggedIn}
                      poolId={poolId}
                      poolSlug={poolSlug}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Knockout picks hidden message */}
      {!isGroup && knockoutPicksHidden && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Knockout bracket picks will be visible once the knockout phase begins and picks are locked.
          </p>
        </div>
      )}

      {/* Knockout picks — sorted by standings rank */}
      {!isGroup && !knockoutPicksHidden && sortedKnockoutPicks.length > 0 && (
        <div className="space-y-2">
          {/* Two-row header section. Knockout matches don't expose the
              Draw option — showDraw={false} suppresses it in the pill
              strip. */}
          <ListHeader
            title="All Players"
            tab={tab}
            onTabChange={setTab}
            isLoggedIn={isLoggedIn}
            favoritesCount={favoritePickSetIds.length}
            pickFilter={pickFilter}
            onPickFilterChange={setPickFilter}
            homeLabel={truncateTeamName(match.home_team?.name ?? "Home")}
            awayLabel={truncateTeamName(match.away_team?.name ?? "Away")}
            showDraw={false}
            showOther={hasOtherKnockoutPicks}
            totalCount={sortedKnockoutPicks.length}
            filteredCount={filteredKnockoutPicks.length}
          />
          {filteredKnockoutPicks.length === 0 ? (
            <EmptyFilterState tab={tab} />
          ) : (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
              <PlayerListHeader
                isLoggedIn={isLoggedIn}
                showTourneyWinnerColumn={knockoutLocked}
              />
              <div className="divide-y divide-[var(--color-border)]">
                {filteredKnockoutPicks.map((p) => {
                  // Use the actual team this pick selected — which may be
                  // a team eliminated before this match and therefore not
                  // one of the two participants. Falling back to the
                  // match's home/away (the old behaviour) mislabelled such
                  // picks as a participant; we now show the real country.
                  const badgeLabel = truncateTeamName(
                    p.picked_team?.name ?? ""
                  );
                  return (
                    <PlayerRow
                      key={p.pick_set.id}
                      pickSetId={p.pick_set.id}
                      pickSetName={p.pick_set.name}
                      isCorrect={p.is_correct}
                      badgeLabel={badgeLabel}
                      rank={rankByPickSet[p.pick_set.id]}
                      points={pointsByPickSet[p.pick_set.id]}
                      tourneyWinnerPick={tourneyWinnerPicks[p.pick_set.id]}
                      showTourneyWinnerColumn={knockoutLocked}
                      isFavorite={favoriteIds.has(p.pick_set.id)}
                      isLoggedIn={isLoggedIn}
                      poolId={poolId}
                      poolSlug={poolSlug}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state — only when picks are visible but none have been submitted */}
      {!groupPicksHidden &&
        !knockoutPicksHidden &&
        groupPicks.length === 0 &&
        knockoutPicks.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
            <p className="text-[var(--color-text-secondary)]">
              No picks submitted for this match yet.
            </p>
          </div>
        )}
    </div>
  );
}

/**
 * Pick filter tab strip. Sits in the All Players section header,
 * mirrors the phase filter strip used on /matches and the group sub-
 * filter on the same page so the family of "small filter pills"
 * controls looks consistent across the app.
 *
 * Layout: All / [HomeName] / Draw (group only) / [AwayName]. Labels
 * are truncated upstream so country names stay within the badge
 * width budget (≤ 13 chars). The active pill carries pitch-green
 * fill; the rest are muted text on transparent.
 *
 * The whole strip is horizontally scrollable on narrow viewports
 * (`overflow-x-auto scrollbar-hide`) so a long pair like "Bosnia
 * and..." vs "Switzerland" doesn't wrap or overflow — same pattern
 * the /matches phase strip uses.
 *
 * The "(showing X of Y)" indicator only appears when the filter is
 * active (not "all"), to point at the filter being engaged without
 * adding noise in the default state.
 */
function PickFilterTabs({
  filter,
  onChange,
  homeLabel,
  awayLabel,
  showDraw,
  showOther,
  totalCount,
  filteredCount,
}: {
  filter: PickFilter;
  onChange: (next: PickFilter) => void;
  homeLabel: string;
  awayLabel: string;
  showDraw: boolean;
  /**
   * Show the "Other" pill — knockout matches only, and only when at
   * least one pick selected an eliminated (non-participant) team.
   */
  showOther: boolean;
  totalCount: number;
  filteredCount: number;
}) {
  const options: { value: PickFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "home", label: homeLabel },
    ...(showDraw
      ? ([{ value: "draw" as PickFilter, label: "Draw" }])
      : []),
    { value: "away", label: awayLabel },
    ...(showOther
      ? ([{ value: "other" as PickFilter, label: "Other" }])
      : []),
  ];
  const isActive = filter !== "all";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1 overflow-x-auto scrollbar-hide max-w-full">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors tap-target",
              filter === opt.value
                ? "bg-pitch-600 text-white"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {isActive && (
        <p className="text-2xs text-[var(--color-text-muted)] tabular-nums">
          Showing {filteredCount} of {totalCount} player
          {totalCount !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

/**
 * Combined header for the All Players section.
 *
 * Layout (per screenshot feedback):
 *   Row 1: Section title alone on the left.
 *   Row 2: [Standings/Favorites tab] [Pick filter pills] — both
 *          inline, both left-aligned. The two controls sit on the
 *          same baseline as a single filter strip, with a small gap
 *          between them.
 *
 * The combined row uses `flex-wrap` so on very narrow viewports the
 * pick filter pills drop to a second line rather than truncating —
 * the Favorites tab keeps its size; the pill strip is what wraps
 * since it has more items.
 */
function ListHeader({
  title,
  tab,
  onTabChange,
  isLoggedIn,
  favoritesCount,
  pickFilter,
  onPickFilterChange,
  homeLabel,
  awayLabel,
  showDraw,
  showOther,
  totalCount,
  filteredCount,
}: {
  title: string;
  tab: FavoritesTabKey;
  onTabChange: (next: FavoritesTabKey) => void;
  isLoggedIn: boolean;
  favoritesCount: number;
  pickFilter: PickFilter;
  onPickFilterChange: (next: PickFilter) => void;
  homeLabel: string;
  awayLabel: string;
  showDraw: boolean;
  showOther: boolean;
  totalCount: number;
  filteredCount: number;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {/* Two filters share one row.
            FavoritesTabs sits flush-left; PickFilterTabs sits flush-right.
            justify-between pushes them to opposite edges; flex-wrap lets
            the right group drop below the left on narrow viewports where
            both can't fit on one line — in that wrapped state, the
            pick-filter group stays on its own line, still aligned to the
            right because of the wrapper around it (see below). */}
      <div className="flex items-start gap-3 flex-wrap justify-between">
        <FavoritesTabs
          active={tab}
          onChange={onTabChange}
          favoritesCount={isLoggedIn ? favoritesCount : undefined}
          disabled={!isLoggedIn}
          context="game-drilldown"
        />
        {/* Wrapper holds the right-side filter to its own flex item so
            justify-between can push it to the right edge — and when the
            row wraps, the wrapper's ml-auto keeps it right-aligned on
            its new line rather than snapping back to the left. */}
        <div className="ml-auto">
          <PickFilterTabs
            filter={pickFilter}
            onChange={onPickFilterChange}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
            showDraw={showDraw}
            showOther={showOther}
            totalCount={totalCount}
            filteredCount={filteredCount}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state shown when the active filters exclude every pick. Two
 * flavours:
 *   - "favorites" tab + nothing to show → suggest tapping a star
 *   - any other configuration → "no players match this filter"
 *
 * Same shape and tone as the standings page's filter empty states.
 */
function EmptyFilterState({ tab }: { tab: FavoritesTabKey }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center">
      {tab === "favorites" ? (
        <>
          <p className="text-sm text-[var(--color-text-secondary)]">
            None of your favorites picked here yet.
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Tap the star next to a pick set to follow it.
          </p>
        </>
      ) : (
        <p className="text-sm text-[var(--color-text-secondary)]">
          No players match this filter.
        </p>
      )}
    </div>
  );
}

/**
 * Single player row in the All Players list. Shared between the
 * group-picks section and the knockout-picks section since both lists
 * render the same shape — only the badge label derivation differs,
 * and that's pre-computed by the caller.
 *
 * Desktop / wide layout (≥ md):
 *   [star] [rank] [name....flex.....] [winner] [G] [KO] [Tot] [badge]
 *
 * Mobile / narrow layout (< md):
 *   [star] [rank] [name....flex.....] [badge]
 *                    Group: X · KO: Y · Total: Z   Winner: ZAF
 *
 * The right-side detail columns are emitted as `hidden md:flex` so
 * narrow viewports don't squeeze them; a parallel `md:hidden` sub-
 * row beneath the name carries the same data in label-prefixed form.
 *
 * Tourney Winner column is gated on `showTourneyWinnerColumn` — only
 * true once the knockout phase has fully locked. Pre-lock, the column
 * is omitted entirely (data is also absent server-side).
 */
/**
 * Column header row for the player list (desktop only).
 *
 * Mirrors PlayerRow's right-cluster column widths so the header
 * labels land directly above their data columns. Empty placeholders
 * on the left match the star + rank columns so the "Player" label
 * sits at the same horizontal position as the player names below.
 *
 * Hidden on narrow viewports (< md). PlayerRow's mobile sub-row
 * already carries inline labels ("G: 42 · KO: 18 · Total: 60 ·
 * Winner: …"), so a column header there would be redundant.
 *
 * Sits inside the rounded card with a slightly raised background so
 * it visually reads as a header band (matches the standings page's
 * <thead> treatment).
 */
function PlayerListHeader({
  isLoggedIn,
  showTourneyWinnerColumn,
}: {
  isLoggedIn: boolean;
  showTourneyWinnerColumn: boolean;
}) {
  return (
    <div className="hidden md:block px-4 py-2 bg-[var(--color-surface-raised)] border-b border-[var(--color-border)] text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
      <div className="flex items-center justify-between gap-2">
        {/* Left cluster — spacers for the star (when logged in) and
            the rank badge so the "Player" label aligns with the
            player-name column in the rows below. The widths here
            match PlayerRow exactly: w-5 for the compact star,
            w-6 for the rank badge, gap-2.5 between. */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isLoggedIn && <span className="w-5 shrink-0" aria-hidden="true" />}
          <span className="w-6 shrink-0" aria-hidden="true" />
          <span>Player</span>
        </div>

        {/* Right cluster — labels matching PlayerRow's column widths
            so the header text aligns above the data. */}
        <div className="flex items-center gap-3 shrink-0">
          {showTourneyWinnerColumn && (
            <span className="w-20 text-right">Winner</span>
          )}
          <span className="w-10 text-right">Group</span>
          <span className="w-10 text-right">KO</span>
          <span className="w-12 text-right">Total</span>
          <span className="w-28 text-center">Pick</span>
        </div>
      </div>
    </div>
  );
}

function PlayerRow({
  pickSetId,
  pickSetName,
  isCorrect,
  badgeLabel,
  rank,
  points,
  tourneyWinnerPick,
  showTourneyWinnerColumn,
  isFavorite,
  isLoggedIn,
  poolId,
  poolSlug,
}: {
  pickSetId: string;
  pickSetName: string;
  isCorrect: boolean | null;
  badgeLabel: string;
  rank?: number;
  points?: { group: number; knockout: number; total: number };
  tourneyWinnerPick?: { teamName: string; teamCode: string; flagCode: string };
  showTourneyWinnerColumn: boolean;
  isFavorite: boolean;
  isLoggedIn: boolean;
  poolId: string;
  poolSlug: string;
}) {
  const g = points?.group ?? 0;
  const ko = points?.knockout ?? 0;
  const tot = points?.total ?? 0;

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        {/* Left cluster: star, rank, name. Same shape as before — the
            extra control (star) sits between rank and name to match
            the standings page's column order. */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isLoggedIn && (
            <FavoriteStar
              poolId={poolId}
              poolSlug={poolSlug}
              targetPickSetId={pickSetId}
              isFavorite={isFavorite}
              size="compact"
            />
          )}
          <RankBadge rank={rank} />
          <Link
            href={`/${poolSlug}/picks/${pickSetId}`}
            className="text-sm font-medium hover:underline underline-offset-2 truncate transition-colors"
          >
            {pickSetName}
          </Link>
        </div>

        {/* Right cluster, desktop. Inline columns for tourney winner +
            point totals, then the pick badge. Each is a fixed width
            so the right edges of the columns line up down the list. */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          {showTourneyWinnerColumn && (
            <span className="inline-flex items-center gap-1.5 w-20 justify-end">
              {tourneyWinnerPick ? (
                <>
                  <TeamFlag
                    flagCode={tourneyWinnerPick.flagCode}
                    teamName={tourneyWinnerPick.teamName}
                    shortCode={tourneyWinnerPick.teamCode}
                    size="16x12"
                  />
                  <span className="text-xs tabular-nums">
                    {tourneyWinnerPick.teamCode}
                  </span>
                </>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">—</span>
              )}
            </span>
          )}
          <span className="text-xs tabular-nums text-[var(--color-text-secondary)] w-10 text-right">
            {g}
          </span>
          <span className="text-xs tabular-nums text-[var(--color-text-secondary)] w-10 text-right">
            {ko}
          </span>
          <span className="text-sm font-bold tabular-nums w-12 text-right">
            {tot}
          </span>
          <span
            className={cn(
              // Fixed w-28 keeps the badge column edges aligned across
              // rows. text-center sits shorter labels (like "Draw")
              // in the middle of the badge.
              "text-xs font-bold px-2 py-1 rounded w-28 text-center",
              isCorrect === true && "bg-correct/15 text-correct",
              isCorrect === false && "bg-incorrect/15 text-incorrect",
              isCorrect === null && "bg-gray-100 text-gray-500"
            )}
          >
            {badgeLabel}
          </span>
        </div>

        {/* Mobile: only the pick badge sits in the top row; the points
            + tourney winner move to the sub-row below. */}
        <span
          className={cn(
            "md:hidden text-xs font-bold px-2 py-1 rounded shrink-0 w-28 text-center",
            isCorrect === true && "bg-correct/15 text-correct",
            isCorrect === false && "bg-incorrect/15 text-incorrect",
            isCorrect === null && "bg-gray-100 text-gray-500"
          )}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Mobile sub-row — only renders below `md`. The points group
          and the winner pick sit side-by-side here so they're scannable
          without scrolling horizontally on narrow phones. The text-2xs
          + ml-8 indent matches the existing pattern from the standings
          mobile cards. */}
      <div className="md:hidden mt-1 ml-8 flex items-center gap-3 flex-wrap text-2xs text-[var(--color-text-muted)]">
        <span>
          G:{" "}
          <span className="tabular-nums text-[var(--color-text-secondary)]">
            {g}
          </span>
        </span>
        <span>
          KO:{" "}
          <span className="tabular-nums text-[var(--color-text-secondary)]">
            {ko}
          </span>
        </span>
        <span>
          Total:{" "}
          <span className="tabular-nums font-medium text-[var(--color-text)]">
            {tot}
          </span>
        </span>
        {showTourneyWinnerColumn && (
          <span className="inline-flex items-center gap-1">
            Winner:{" "}
            {tourneyWinnerPick ? (
              <span className="inline-flex items-center gap-1">
                <TeamFlag
                  flagCode={tourneyWinnerPick.flagCode}
                  teamName={tourneyWinnerPick.teamName}
                  shortCode={tourneyWinnerPick.teamCode}
                  size="16x12"
                />
                <span className="tabular-nums text-[var(--color-text-secondary)]">
                  {tourneyWinnerPick.teamCode}
                </span>
              </span>
            ) : (
              <span>—</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank?: number }) {
  if (!rank) return <span className="w-6" />;

  // Rank styles — gold/silver/bronze all use the -100 / -700 / -200 pattern
  // for consistent contrast. Previously rank 3 used -50 / -600 / -200 which
  // rendered too washed out next to the other two badges.
  const styles =
    rank === 1
      ? "bg-gold-100 text-gold-700 border-gold-200"
      : rank === 2
        ? "bg-gray-100 text-gray-600 border-gray-200"
        : rank === 3
          ? "bg-orange-100 text-orange-700 border-orange-200"
          : "bg-transparent text-[var(--color-text-muted)] border-transparent";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border shrink-0",
        styles
      )}
    >
      {rank}
    </span>
  );
}
