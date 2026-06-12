"use client";

import { useState, useMemo } from "react";
import { track } from "@vercel/analytics";
import Link from "next/link";
import type { MatchWithTeams, Group, MatchPhase } from "@/types/database";
import type { MatchPickDistribution } from "@/lib/picks/match-pick-counts";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import {
  pacificDayKey,
  pacificTodayKey,
  formatPacificDayHeading,
  formatPacificTime,
  compareDayKeysRelevanceFirst,
} from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { MatchesGridView, type GridFilter } from "./matches-grid-view";
import { MatchesTilesView } from "./matches-tiles-view";

// DOM id for the oldest day section in the By Date view. The toolbar's
// "View Past Matches" link targets it to scroll the user down to the
// start of the tournament. Shared between the toolbar (MatchBrowser) and
// the section renderer (MatchesByDateView) so they can't drift.
const PAST_MATCHES_ANCHOR_ID = "matches-past-anchor";

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
  /**
   * Which view the page opens on. Set server-side from the tournament
   * phase (the /matches page passes "grid"). Falls back to "table" if
   * omitted so any other caller keeps the original behaviour.
   */
  defaultView?: ViewMode;
  /**
   * The Grid view's initial phase filter, chosen server-side from the
   * tournament phase: "group" through Phase 3, "knockout" once the
   * knockout picks have locked (Phase 4). Defaults to "all" if omitted.
   */
  defaultGridFilter?: GridFilter;
}


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

type ViewMode = "table" | "grid" | "tiles" | "trends";

/**
 * Top-level /matches browser. Hosts two sub-views via a Table | Grid tab
 * toggle:
 *
 *   • Table — the original per-phase list view (unchanged), rendered by
 *     MatchTableView below.
 *   • Grid  — the compressed two-column group list + one-sided knockout
 *     bracket, rendered by MatchesGridView (matches-grid-view.tsx).
 *
 * The view toggle is the only state owned here; each sub-view manages its
 * own filters independently, so switching tabs doesn't try to translate one
 * view's phase filter onto the other (their filter vocabularies differ:
 * Table has per-round tabs, Grid has All/Group/Knockout).
 */
export function MatchBrowser(props: MatchBrowserProps) {
  const [view, setView] = useState<ViewMode>(props.defaultView ?? "table");

  // Phase filter — All | Group | Knockout. Owned here and shared across
  // all four views so switching tabs preserves the chosen phase. Seeded
  // from the server-chosen default (the /matches page passes "group"
  // through phase 3, "knockout" once knockouts begin).
  const [phaseFilter, setPhaseFilter] = useState<GridFilter>(
    props.defaultGridFilter ?? "all"
  );

  // Grouping mode — how matches are SECTIONED. "date" (the default)
  // sections everything by Pacific-Time calendar day in chronological
  // order, so players can see what's coming up next without hopping
  // group to group. "phase" is the original behaviour (group-phase
  // matches bucketed by Group A–L, knockout matches by round). Shared
  // across all views, same as phaseFilter. The phase filter still
  // applies in both modes (it narrows WHICH matches appear, not how
  // they're grouped).
  const [groupMode, setGroupMode] = useState<"phase" | "date">("date");

  // Whether any visible match (under the current phase filter) is on a
  // past Pacific-Time day. Drives the toolbar's "View Past Matches" jump
  // link, which only makes sense in By Date mode and only when there's
  // something earlier on the page to scroll to.
  const hasPastMatches = useMemo(() => {
    const today = pacificTodayKey();
    return props.matches.some((m) => {
      // Respect the same phase filter the date view applies.
      const inPhase =
        phaseFilter === "all" ||
        (phaseFilter === "group" && m.phase === "group") ||
        (phaseFilter === "knockout" && m.phase !== "group");
      if (!inPhase) return false;
      const key = pacificDayKey(m.scheduled_at);
      return !!key && key < today;
    });
  }, [props.matches, phaseFilter]);

  const views: { value: ViewMode; label: string }[] = [
    { value: "table", label: "List" },
    { value: "grid", label: "Grid" },
    { value: "tiles", label: "Tiles" },
    { value: "trends", label: "Trends" },
  ];

  const phaseFilters: { value: GridFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "group", label: "Group" },
    { value: "knockout", label: "Knockout" },
  ];

  return (
    <div className="space-y-4">
      {/* View toggle + phase filter on one row. View tabs (List | Grid |
          Tiles | Trends) on the left; the All | Group | Knockout phase
          filter inline to their right. Wraps on narrow viewports. */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Match view"
          className="inline-flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
        >
          {views.map((v) => (
            <button
              key={v.value}
              role="tab"
              aria-selected={view === v.value}
              onClick={() => {
                // Only fire on an actual change, not re-clicks of the
                // active tab — keeps the counts to genuine view switches.
                if (view !== v.value) {
                  track("matches_view", { view: v.value });
                }
                setView(v.value);
              }}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors tap-target",
                view === v.value
                  ? "bg-pitch-600 text-white"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Phase filter — shared across all views */}
        <div
          role="tablist"
          aria-label="Match phase filter"
          className="inline-flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
        >
          {phaseFilters.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={phaseFilter === f.value}
              onClick={() => setPhaseFilter(f.value)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors tap-target",
                phaseFilter === f.value
                  ? "bg-pitch-600 text-white"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Group-by toggle — sections matches by Group/round (default)
            or by calendar date. Shared across all views. */}
        <div
          role="tablist"
          aria-label="Group matches by"
          className="inline-flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
        >
          {([
            { value: "phase", label: "By Group" },
            { value: "date", label: "By Date" },
          ] as const).map((g) => (
            <button
              key={g.value}
              role="tab"
              aria-selected={groupMode === g.value}
              onClick={() => {
                if (groupMode !== g.value) {
                  track("matches_group_mode", { mode: g.value });
                }
                setGroupMode(g.value);
              }}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors tap-target",
                groupMode === g.value
                  ? "bg-pitch-600 text-white"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* "View Past Matches" jump link — only in By Date mode, and only
            when there are past matches to scroll to. Lands on the oldest
            day section (the start of the tournament) at the bottom of the
            list. */}
        {groupMode === "date" && hasPastMatches && (
          <button
            type="button"
            onClick={() => {
              document
                .getElementById(PAST_MATCHES_ANCHOR_ID)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-pitch-600 hover:text-pitch-700 hover:underline transition-colors tap-target"
          >
            View Past Matches
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>
        )}
      </div>

      {groupMode === "date" ? (
        <MatchesByDateView
          {...props}
          filter={phaseFilter}
          rowVariant={view === "trends" ? "trends" : "standard"}
        />
      ) : view === "table" ? (
        <MatchTableView {...props} filter={phaseFilter} />
      ) : view === "trends" ? (
        // Trends reuses the entire Table grouping/section engine (now
        // driven by the shared filter) and only swaps the row renderer.
        <MatchTableView {...props} filter={phaseFilter} rowVariant="trends" />
      ) : view === "grid" ? (
        <MatchesGridView
          matches={props.matches}
          groups={props.groups}
          poolSlug={props.poolSlug}
          pickDistributions={props.pickDistributions}
          groupLocked={props.groupLocked}
          knockoutLocked={props.knockoutLocked}
          filter={phaseFilter}
        />
      ) : (
        <MatchesTilesView
          matches={props.matches}
          groups={props.groups}
          poolSlug={props.poolSlug}
          pickDistributions={props.pickDistributions}
          groupLocked={props.groupLocked}
          knockoutLocked={props.knockoutLocked}
          showFifaRankings={props.showFifaRankings}
          filter={phaseFilter}
        />
      )}
    </div>
  );
}

function MatchesByDateView({
  matches,
  poolSlug,
  pickDistributions,
  groupLocked,
  knockoutLocked,
  showFifaRankings,
  filter,
  rowVariant = "standard",
}: MatchBrowserProps & {
  filter: GridFilter;
  rowVariant?: "standard" | "trends";
}) {
  // Apply the shared phase filter first, then bucket by Pacific-Time day.
  const dayBuckets = useMemo(() => {
    const showGroup = filter === "all" || filter === "group";
    const showKnockout = filter === "all" || filter === "knockout";

    const filtered = matches.filter((m) => {
      if (m.phase === "group") return showGroup;
      return showKnockout;
    });

    // key → { heading, sortKey, matches[] }. Matches with no scheduled_at
    // collapse into a single trailing "Date TBD" bucket so they're never
    // dropped.
    const map = new Map<
      string,
      { heading: string; sortKey: string; items: MatchWithTeams[] }
    >();

    const TBD_KEY = "~tbd"; // sorts after any real YYYY-MM-DD key

    for (const m of filtered) {
      const key = pacificDayKey(m.scheduled_at);
      if (key) {
        const bucket = map.get(key) ?? {
          heading: formatPacificDayHeading(m.scheduled_at) ?? key,
          sortKey: key,
          items: [],
        };
        bucket.items.push(m);
        map.set(key, bucket);
      } else {
        const bucket = map.get(TBD_KEY) ?? {
          heading: "Date TBD",
          sortKey: TBD_KEY,
          items: [],
        };
        bucket.items.push(m);
        map.set(TBD_KEY, bucket);
      }
    }

    // Order days "most relevant first": today, then upcoming ascending,
    // then past days descending, with the TBD bucket always last. Within
    // each day, sort by kickoff time then match number so simultaneous
    // kickoffs keep a stable order.
    const today = pacificTodayKey();
    const days: {
      heading: string;
      sortKey: string;
      items: MatchWithTeams[];
      isPast: boolean;
    }[] = [...map.values()]
      .sort((a, b) => compareDayKeysRelevanceFirst(a.sortKey, b.sortKey))
      .map((d) => ({
        ...d,
        // A real calendar day strictly before today. The TBD bucket
        // (non-date sortKey) is never "past".
        isPast: /^\d{4}-\d{2}-\d{2}$/.test(d.sortKey) && d.sortKey < today,
      }));
    for (const day of days) {
      day.items.sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.match_number ?? 0) - (b.match_number ?? 0);
      });
    }
    return days;
  }, [matches, filter]);

  // The "View Past Matches" jump link targets the OLDEST day on the page
  // (the start of the tournament) — that's the last past-day bucket in
  // the relevance-first order, since past days run most-recent-first.
  // null when nothing is in the past, which hides the link.
  const oldestPastKey = useMemo(() => {
    const pastDays = dayBuckets.filter((d) => d.isPast);
    return pastDays.length > 0
      ? pastDays[pastDays.length - 1].sortKey
      : null;
  }, [dayBuckets]);

  const visibleCount = dayBuckets.reduce((n, d) => n + d.items.length, 0);

  if (visibleCount === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">
        No matches to show.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {dayBuckets.map((day) => (
        <div
          key={day.sortKey}
          id={day.sortKey === oldestPastKey ? PAST_MATCHES_ANCHOR_ID : undefined}
          // scroll-mt keeps the day heading clear of the sticky app
          // header when the "View Past Matches" link jumps here.
          className={day.sortKey === oldestPastKey ? "scroll-mt-20" : undefined}
        >
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
            {day.heading}
          </h3>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
            {day.items.map((match) =>
              rowVariant === "trends" ? (
                <TrendsRow
                  key={match.id}
                  match={match}
                  poolSlug={poolSlug}
                  distribution={pickDistributions[match.id]}
                  distributionVisible={
                    match.phase === "group" ? groupLocked : knockoutLocked
                  }
                />
              ) : (
                <MatchRow
                  key={match.id}
                  match={match}
                  poolSlug={poolSlug}
                  // In date mode matches from different groups intermix,
                  // so surface the group letter (knockout rows simply
                  // have no group and render nothing here).
                  showGroupLetter
                  kickoffLabel={formatPacificTime(match.scheduled_at)}
                  distribution={pickDistributions[match.id]}
                  distributionVisible={
                    match.phase === "group" ? groupLocked : knockoutLocked
                  }
                  showFifaRankings={showFifaRankings}
                />
              )
            )}
          </div>
        </div>
      ))}

      <p className="text-xs text-[var(--color-text-muted)] text-center pt-1">
        {visibleCount} match{visibleCount !== 1 ? "es" : ""}
      </p>
    </div>
  );
}

function MatchTableView({
  matches,
  groups,
  poolSlug,
  pickDistributions,
  groupLocked,
  knockoutLocked,
  showFifaRankings,
  rowVariant = "standard",
  filter,
}: MatchBrowserProps & {
  rowVariant?: "standard" | "trends";
  filter: GridFilter;
}) {
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

  // Visibility flags derived from the shared filter
  const showGroupPhase = filter === "all" || filter === "group";
  const showKnockoutPhase = filter === "all" || filter === "knockout";

  // Which groups to render — all of them (no per-group sub-filter now)
  const groupsToShow = useMemo(
    () => (showGroupPhase ? sortedGroups : []),
    [showGroupPhase, sortedGroups]
  );

  // Which knockout phases to render — all of them, in stable order
  const phasesToShow = useMemo(
    () => (showKnockoutPhase ? phaseOrder : []),
    [showKnockoutPhase] // eslint-disable-line react-hooks/exhaustive-deps
  );

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
      {/* Group phase sections */}
      {showGroupPhase && groupsToShow.length > 0 && (
        <section className="space-y-4">
          {filter === "all" && (
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
                  {gMatches.map((match) =>
                    rowVariant === "trends" ? (
                      <TrendsRow
                        key={match.id}
                        match={match}
                        poolSlug={poolSlug}
                        distribution={pickDistributions[match.id]}
                        distributionVisible={groupLocked}
                      />
                    ) : (
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
                    )
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Knockout phase sections */}
      {showKnockoutPhase && phasesToShow.length > 0 && (
        <section className="space-y-4">
          {filter === "all" && (
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
                  {phaseMatches.map((match) =>
                    rowVariant === "trends" ? (
                      <TrendsRow
                        key={match.id}
                        match={match}
                        poolSlug={poolSlug}
                        distribution={pickDistributions[match.id]}
                        distributionVisible={knockoutLocked}
                      />
                    ) : (
                    <MatchRow
                      key={match.id}
                      match={match}
                      poolSlug={poolSlug}
                      showGroupLetter={false}
                      distribution={pickDistributions[match.id]}
                      distributionVisible={knockoutLocked}
                      showFifaRankings={showFifaRankings}
                    />
                    )
                  )}
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
  kickoffLabel,
  distribution,
  distributionVisible,
  showFifaRankings,
}: {
  match: MatchWithTeams;
  poolSlug: string;
  showGroupLetter: boolean;
  /**
   * Optional kickoff time (e.g. "12:00 PM PT") shown in the right-hand
   * meta cluster. Passed by the by-date view, where the day is already
   * the section header so only the time-of-day adds information. Omitted
   * (undefined) in the by-group/phase views, which don't surface a time.
   */
  kickoffLabel?: string | null;
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
          {kickoffLabel && (
            <span className="text-2xs text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
              {kickoffLabel}
            </span>
          )}
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
 * Which side is the betting favorite. Lower (more negative) money line
 * wins; if lines aren't on file we fall back to the better (lower) FIFA
 * ranking; if neither is available we default to "home" so the layout
 * still has a deterministic favorite/underdog assignment. Draw lines
 * are irrelevant to favorite vs underdog and ignored here.
 */
function favoriteSide(match: MatchWithTeams): "home" | "away" {
  const h = match.home_money_line;
  const a = match.away_money_line;
  if (h != null && a != null) return h <= a ? "home" : "away";

  const hr = match.home_team?.fifa_ranking ?? null;
  const ar = match.away_team?.fifa_ranking ?? null;
  if (hr != null && ar != null) return hr <= ar ? "home" : "away";

  return "home";
}

/**
 * Trends row — the matchup as a single horizontal pick-distribution
 * bar. Favorite team (by betting line) anchors the LEFT with the blue
 * segment of the bar; the underdog anchors the RIGHT with the green
 * segment; draws (plus any knockout "other"/eliminated-team picks) form
 * the grey centre. This matches the bar's colour order so each team
 * sits above its own colour.
 *
 * Team-name styling reuses teamTextStyle: completed → winner bold /
 * loser struck through, in-progress/scheduled → italic. On mobile the
 * names collapse to 3-letter short codes to leave room for the bar.
 *
 * No percentages are shown — the bar is purely a visual; exact numbers
 * live on the match drilldown (the whole row links there).
 */
function TrendsRow({
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
  const hasTeams = match.home_team && match.away_team;

  // TBD / placeholder matches have no favorite/underdog structure —
  // fall back to the plain label row the table view uses for them.
  if (!hasTeams) {
    return (
      <Link
        href={`/${poolSlug}/match/${match.id}`}
        className="flex items-center gap-2 px-4 py-3 hover:bg-[var(--color-surface-raised)] transition-colors"
      >
        <span className="text-2xs text-[var(--color-text-muted)] w-6 shrink-0">
          #{match.match_number}
        </span>
        <span className="text-sm text-[var(--color-text-muted)] italic">
          {match.label || "Teams TBD"}
        </span>
      </Link>
    );
  }

  const favSide = favoriteSide(match);
  const underSide = favSide === "home" ? "away" : "home";
  const favTeam = match[`${favSide}_team`]!;
  const underTeam = match[`${underSide}_team`]!;

  const showBar =
    distributionVisible && !!distribution && distribution.total > 0;

  return (
    <Link
      href={`/${poolSlug}/match/${match.id}`}
      className="flex items-center gap-2 sm:gap-3 px-4 py-3 hover:bg-[var(--color-surface-raised)] transition-colors"
    >
      <span className="text-2xs text-[var(--color-text-muted)] w-6 shrink-0 hidden sm:inline">
        #{match.match_number}
      </span>

      {/* Favorite — left. Flag then name (short code on mobile). */}
      <div className="flex items-center gap-1.5 shrink-0 w-[4.5rem] sm:w-40 justify-start">
        <TeamFlag
          flagCode={favTeam.flag_code}
          teamName={favTeam.name}
          shortCode={favTeam.short_code}
          size="24x18"
        />
        <span className={cn("text-sm truncate sm:hidden", teamTextStyle(match, favSide))}>
          {favTeam.short_code}
        </span>
        <span className={cn("text-sm truncate hidden sm:inline", teamTextStyle(match, favSide))}>
          {favTeam.name}
        </span>
      </div>

      {/* The bar */}
      <div className="flex-1 min-w-0">
        <TrendsBar
          match={match}
          favSide={favSide}
          distribution={showBar ? distribution! : undefined}
        />
      </div>

      {/* Underdog — right. Name (short code on mobile) then flag. */}
      <div className="flex items-center gap-1.5 shrink-0 w-[4.5rem] sm:w-40 justify-end">
        <span className={cn("text-sm truncate text-right sm:hidden", teamTextStyle(match, underSide))}>
          {underTeam.short_code}
        </span>
        <span className={cn("text-sm truncate text-right hidden sm:inline", teamTextStyle(match, underSide))}>
          {underTeam.name}
        </span>
        <TeamFlag
          flagCode={underTeam.flag_code}
          teamName={underTeam.name}
          shortCode={underTeam.short_code}
          size="24x18"
        />
      </div>

      <svg
        className="h-4 w-4 text-[var(--color-text-muted)] shrink-0 hidden sm:block"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

/**
 * The horizontal stacked bar for a Trends row.
 *
 *   [ blue: favorite picks | grey: draw + other | green: underdog picks ]
 *
 * Segment widths are proportional to pick counts (no labels/%); the
 * favorite/underdog mapping comes from favSide so home/away counts land
 * on the correct colour regardless of which team is home. For knockout
 * matches `draw` is always 0 and `other` (picks for an eliminated team)
 * folds into the grey centre — it's neither the favorite nor the
 * underdog winning, so the middle bucket is the honest home for it.
 *
 * With no distribution yet (pre-lock, or zero picks) we render an empty
 * neutral track so the row still reads as a matchup with a bar to come.
 */
function TrendsBar({
  match,
  favSide,
  distribution,
}: {
  match: MatchWithTeams;
  favSide: "home" | "away";
  distribution: MatchPickDistribution | undefined;
}) {
  if (!distribution) {
    return (
      <div
        className="h-6 w-full rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
        aria-hidden="true"
      />
    );
  }

  const underSide = favSide === "home" ? "away" : "home";
  const favCount = distribution[favSide];
  const underCount = distribution[underSide];
  const middleCount = distribution.draw + distribution.other;
  const total = distribution.total || 1;

  const favPct = (favCount / total) * 100;
  const midPct = (middleCount / total) * 100;
  const underPct = (underCount / total) * 100;

  const favLabel = match[`${favSide}_team`]?.name ?? "Favorite";
  const underLabel = match[`${underSide}_team`]?.name ?? "Underdog";

  return (
    <div
      className="flex h-6 w-full rounded-md overflow-hidden bg-[var(--color-surface-raised)]"
      role="img"
      aria-label={`Pick distribution: ${favLabel} favorite ${Math.round(
        favPct
      )}%, draw or other ${Math.round(midPct)}%, ${underLabel} underdog ${Math.round(
        underPct
      )}%`}
    >
      {favPct > 0 && (
        <div className="h-full bg-sky-400" style={{ width: `${favPct}%` }} />
      )}
      {midPct > 0 && (
        <div className="h-full bg-gray-400" style={{ width: `${midPct}%` }} />
      )}
      {underPct > 0 && (
        <div className="h-full bg-pitch-500" style={{ width: `${underPct}%` }} />
      )}
    </div>
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
