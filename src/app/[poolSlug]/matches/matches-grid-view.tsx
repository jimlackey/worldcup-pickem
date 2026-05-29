"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MatchWithTeams, Group, MatchPhase } from "@/types/database";
import type { MatchPickDistribution } from "@/lib/picks/match-pick-counts";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { BRACKET_FEEDERS, CONSOLATION_FEEDERS, CONSOLATION_MATCH_NUMBER } from "@/lib/picks/bracket-wiring";

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

type GridFilter = "all" | "group" | "knockout";

interface MatchesGridViewProps {
  matches: MatchWithTeams[];
  groups: Group[];
  poolSlug: string;
  pickDistributions: Record<string, MatchPickDistribution>;
  groupLocked: boolean;
  knockoutLocked: boolean;
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

export function MatchesGridView({
  matches,
  groups,
  poolSlug,
  pickDistributions,
  groupLocked,
  knockoutLocked,
}: MatchesGridViewProps) {
  const [filter, setFilter] = useState<GridFilter>("all");

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

  const filters: { value: GridFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "group", label: "Group" },
    { value: "knockout", label: "Knockout" },
  ];

  const groupCount = groupMatches.length;
  const knockoutCount = knockoutMatches.length;
  const visibleCount =
    (showGroup ? groupCount : 0) + (showKnockout ? knockoutCount : 0);

  return (
    <div className="space-y-5">
      {/* Phase filter — All | Group | Knockout (Grid view only) */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors tap-target",
              filter === f.value
                ? "bg-pitch-600 text-white"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Group phase — compressed two-column list */}
      {showGroup && sortedGroups.length > 0 && (
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
      )}

      {/* Knockout phase — one-sided bracket */}
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
                  {match.home_team!.short_code}
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
                  {match.away_team!.short_code}
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

// ============================================================================
// One-sided knockout bracket
// ----------------------------------------------------------------------------
// Columns left → right: R32 (16), R16 (8), QF (4), SF (2), Final (1), and —
// when present — a Consolation cell tucked under the Final. The whole thing
// scrolls horizontally on narrow screens (the columns have fixed widths so
// the bracket never collapses into an unreadable squeeze).
//
// Each later-round cell is vertically centred against the midpoint of the two
// feeder cells beneath it by giving every column the same flex layout with
// `justify-around`, so a column with half as many cells spaces them to line
// up with their feeders' midpoints. This is the same trick the what-if /
// pick-set bracket uses for its one-sided mobile layout.
//
// Columns are flexible (flex-1) with a minimum width: on a wide / high-res
// screen they grow to fill the available page width rather than sitting in a
// narrow left-aligned block; on a narrow screen they hold COLUMN_MIN_W and
// the whole bracket scrolls horizontally instead of squeezing illegibly.
// ============================================================================

const COLUMN_MIN_W = 160; // px — minimum bracket column width (grows to fill)
const CELL_MIN_H = 68; // px — min height per R32 cell; later rounds grow via flex

const BRACKET_COLUMNS: { phase: MatchPhase; matchNumbers: number[] }[] = [
  { phase: "r32", matchNumbers: [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88] },
  { phase: "r16", matchNumbers: [89, 90, 91, 92, 93, 94, 95, 96] },
  { phase: "qf", matchNumbers: [97, 98, 99, 100] },
  { phase: "sf", matchNumbers: [101, 102] },
  { phase: "final", matchNumbers: [103] },
];

function KnockoutBracket({
  knockoutMatches,
  poolSlug,
  pickDistributions,
  distributionVisible,
}: {
  knockoutMatches: MatchWithTeams[];
  poolSlug: string;
  pickDistributions: Record<string, MatchPickDistribution>;
  distributionVisible: boolean;
}) {
  const byNumber = useMemo(() => {
    const map = new Map<number, MatchWithTeams>();
    for (const m of knockoutMatches) {
      if (m.match_number != null) map.set(m.match_number, m);
    }
    return map;
  }, [knockoutMatches]);

  // The consolation match (#104) only exists in `knockoutMatches` when the
  // pool has it enabled (the server strips it otherwise), so its presence
  // here is the signal to render the extra cell beneath the Final.
  const consolation = byNumber.get(CONSOLATION_MATCH_NUMBER);

  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
      <div className="flex gap-2 min-w-max md:min-w-0">
        {BRACKET_COLUMNS.map((col) => (
          <div
            key={col.phase}
            className="flex flex-col justify-around flex-1"
            style={{ minWidth: COLUMN_MIN_W }}
          >
            <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide text-center">
              {PHASE_LABELS[col.phase]}
            </h3>
            <div className="flex flex-col justify-around flex-1 gap-2">
              {col.matchNumbers.map((mn) => {
                const match = byNumber.get(mn);
                if (!match) {
                  return (
                    <BracketCellPlaceholder key={mn} matchNumber={mn} />
                  );
                }
                return (
                  <BracketCell
                    key={match.id}
                    match={match}
                    byNumber={byNumber}
                    poolSlug={poolSlug}
                    distribution={pickDistributions[match.id]}
                    distributionVisible={distributionVisible}
                  />
                );
              })}
            </div>
            {/* Consolation cell rides under the Final column so the 3rd-place
                match is visible without its own full column. */}
            {col.phase === "final" && consolation && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide text-center">
                  {PHASE_LABELS.consolation}
                </h3>
                <BracketCell
                  match={consolation}
                  byNumber={byNumber}
                  poolSlug={poolSlug}
                  distribution={pickDistributions[consolation.id]}
                  distributionVisible={distributionVisible}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Resolve the two sides of a knockout match for display. Prefers teams
 * directly assigned on the match row; when absent (later rounds before the
 * feeders complete) it derives them from the feeder results — winners for
 * the championship bracket, losers for the consolation match — mirroring the
 * KnockoutPickRow fallback in pick-set-detail so the two read identically.
 */
function resolveSides(
  match: MatchWithTeams,
  byNumber: Map<number, MatchWithTeams>
): { home: MatchWithTeams["home_team"]; away: MatchWithTeams["away_team"] } {
  let home = match.home_team ?? null;
  let away = match.away_team ?? null;

  if ((!home || !away) && match.match_number != null) {
    if (match.match_number === CONSOLATION_MATCH_NUMBER) {
      const feeders = CONSOLATION_FEEDERS;
      for (let fi = 0; fi < 2; fi++) {
        const feeder = byNumber.get(feeders[fi]);
        if (feeder?.status === "completed" && feeder.result) {
          const loser =
            feeder.result === "home" ? feeder.away_team : feeder.home_team;
          if (fi === 0) home = home ?? loser ?? null;
          else away = away ?? loser ?? null;
        }
      }
    } else {
      const feederNums = BRACKET_FEEDERS[match.match_number];
      if (feederNums) {
        for (let fi = 0; fi < 2; fi++) {
          const feeder = byNumber.get(feederNums[fi]);
          if (feeder?.status === "completed" && feeder.result) {
            const winner =
              feeder.result === "home" ? feeder.home_team : feeder.away_team;
            if (fi === 0) home = home ?? winner ?? null;
            else away = away ?? winner ?? null;
          }
        }
      }
    }
  }

  return { home, away };
}

/**
 * One bracket match cell. Clickable → the match drilldown. Stacks its detail
 * vertically (home line, score/"v", away line, then the optional pick split)
 * so it stays legible inside a narrow bracket column. Short codes only.
 */
function BracketCell({
  match,
  byNumber,
  poolSlug,
  distribution,
  distributionVisible,
}: {
  match: MatchWithTeams;
  byNumber: Map<number, MatchWithTeams>;
  poolSlug: string;
  distribution: MatchPickDistribution | undefined;
  distributionVisible: boolean;
}) {
  const { home, away } = resolveSides(match, byNumber);
  const hasMatchup = !!(home && away);
  const isCompleted = match.status === "completed" && !!match.result;
  const showDistribution =
    hasMatchup && distributionVisible && !!distribution && distribution.total > 0;

  // When the pick split is visible we fold each team's percentage/count onto
  // that team's own row (compressed layout), so compute the per-row stat data
  // up front. The "Other" bucket has no team row to attach to, so it stays on
  // its own line beneath the matchup (rendered separately below).
  const total = distribution?.total ?? 0;
  const homePct =
    showDistribution && total > 0
      ? Math.round((distribution!.home / total) * 100)
      : null;
  const awayPct =
    showDistribution && total > 0
      ? Math.round((distribution!.away / total) * 100)
      : null;

  return (
    <Link
      href={`/${poolSlug}/match/${match.id}`}
      style={{ minHeight: CELL_MIN_H }}
      className="flex flex-col justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 hover:bg-[var(--color-surface-raised)] hover:border-pitch-400 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-2xs text-[var(--color-text-muted)] tabular-nums">
          #{match.match_number}
        </span>
        {isCompleted && (
          <span className="text-2xs font-medium text-pitch-600">Final</span>
        )}
      </div>

      {hasMatchup ? (
        <div className="mt-1 space-y-1">
          <BracketTeamLine
            flagCode={home!.flag_code}
            teamName={home!.name}
            shortCode={home!.short_code}
            score={isCompleted ? match.home_score : null}
            className={teamTextStyle(match, "home")}
            pct={homePct}
            count={showDistribution ? distribution!.home : null}
            outcome={isCompleted ? match.result === "home" : null}
          />
          <BracketTeamLine
            flagCode={away!.flag_code}
            teamName={away!.name}
            shortCode={away!.short_code}
            score={isCompleted ? match.away_score : null}
            className={teamTextStyle(match, "away")}
            pct={awayPct}
            count={showDistribution ? distribution!.away : null}
            outcome={isCompleted ? match.result === "away" : null}
          />
        </div>
      ) : (
        <p className="mt-1 text-sm text-[var(--color-text-muted)] italic truncate">
          {match.label || "TBD"}
        </p>
      )}

      {/* "Other" pick bucket — picks for a team that never reached this
          match. No team row to fold into, so it stays on its own line. */}
      {showDistribution && distribution!.other > 0 && (
        <OtherPickLine
          count={distribution!.other}
          pct={total > 0 ? Math.round((distribution!.other / total) * 100) : 0}
          // After completion every "Other" pick is wrong (the picked team
          // isn't in the match), so it always reads as an incorrect outcome.
          isLoser={isCompleted}
        />
      )}
    </Link>
  );
}

/**
 * One team's row inside a bracket cell. Holds, left → right:
 *   [flag] CODE  ·  score  ·  pct% (count)  ·  outcome icon
 *
 * The pick-stat half (pct / count / icon) only renders when `pct` is
 * non-null (i.e. the phase has locked and the split is visible). It uses
 * the smaller text-2xs sizing and is muted, sitting to the right of the
 * matchup so each team's "how everyone picked it" reads on the same line —
 * the compressed layout. The bold/strike/italic `className` from
 * teamTextStyle is applied to the code + score so the win/loss styling is
 * preserved; the stat text stays neutral.
 */
function BracketTeamLine({
  flagCode,
  teamName,
  shortCode,
  score,
  className,
  pct,
  count,
  outcome,
}: {
  flagCode: string;
  teamName: string;
  shortCode: string;
  score: number | null;
  className?: string;
  /** Pick percentage for this team, or null when the split isn't shown. */
  pct?: number | null;
  /** Raw pick count for this team, or null when the split isn't shown. */
  count?: number | null;
  /**
   * Whether this team is the winning outcome (true), losing (false), or the
   * match isn't completed yet (null). Drives the check / × icon next to the
   * stat. Only meaningful when pct is non-null.
   */
  outcome?: boolean | null;
}) {
  const showStat = pct != null && count != null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex items-center gap-1.5 min-w-0">
        <TeamFlag flagCode={flagCode} teamName={teamName} shortCode={shortCode} size="24x18" />
        <span className={cn("text-sm", className)}>{shortCode}</span>
      </span>
      {score != null && (
        <span className={cn("text-sm tabular-nums", className)}>{score}</span>
      )}
      {showStat && (
        <span className="ml-auto flex items-center gap-1 text-2xs text-[var(--color-text-secondary)]">
          <span className="tabular-nums">{pct}%</span>
          <span className="tabular-nums text-[var(--color-text-muted)]">
            ({count})
          </span>
          <span className="inline-flex w-3.5 items-center justify-center">
            {outcome === true && <CorrectIcon />}
            {outcome === false && <IncorrectIcon />}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * The "Other" pick row beneath the two team rows — pick sets that backed a
 * team eliminated before this match. Right-aligned to sit under the team
 * rows' stat column, same text-2xs sizing.
 */
function OtherPickLine({
  count,
  pct,
  isLoser,
}: {
  count: number;
  pct: number;
  isLoser: boolean;
}) {
  return (
    <div className="mt-1 flex items-center gap-1 text-2xs text-[var(--color-text-secondary)]">
      <span className="ml-auto flex items-center gap-1">
        <span>Other</span>
        <span className="tabular-nums">{pct}%</span>
        <span className="tabular-nums text-[var(--color-text-muted)]">
          ({count})
        </span>
        <span className="inline-flex w-3.5 items-center justify-center">
          {isLoser && <IncorrectIcon />}
        </span>
      </span>
    </div>
  );
}

/** Empty bracket slot for a knockout match that doesn't exist yet. */
function BracketCellPlaceholder({ matchNumber }: { matchNumber: number }) {
  return (
    <div
      style={{ minHeight: CELL_MIN_H }}
      className="flex flex-col justify-center rounded-md border border-dashed border-[var(--color-border)] px-2.5 py-2"
    >
      <span className="text-2xs text-[var(--color-text-muted)] tabular-nums">
        #{matchNumber}
      </span>
      <p className="text-sm text-[var(--color-text-muted)] italic">TBD</p>
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
