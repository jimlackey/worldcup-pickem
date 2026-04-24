"use client";

import { useState } from "react";
import Link from "next/link";
import type { MatchWithTeams, Group, Team, MatchPhase } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { PickSetBracketView } from "@/components/picks/pick-set-bracket-view";

interface PickSetDetailProps {
  pickSetName: string;
  participantName: string;
  matches: MatchWithTeams[];
  groups: Group[];
  teams: Team[];
  groupPicksMap: Record<string, { pick: string; is_correct: boolean | null }>;
  knockoutPicksMap: Record<
    string,
    { picked_team_id: string; is_correct: boolean | null }
  >;
  groupCorrect: number;
  knockoutCorrect: number;
  /** Number of this player's group picks that have been graded (is_correct != null). */
  groupGraded: number;
  /** Number of this player's knockout picks that have been graded (is_correct != null). */
  knockoutGraded: number;
  totalGroupPicks: number;
  totalKnockoutPicks: number;
  knockoutPicksHidden?: boolean;
  /**
   * Tournament phase.
   *   2 — Group games underway (no phase-4 UI; knockout section hidden)
   *   3 — Knockout picks open  (knockout picks hidden; no phase-4 UI)
   *   4 — Knockout games underway (toggleable tiles, bracket view)
   * Phase 1 is handled upstream (page.tsx) and never reaches this component.
   */
  phase: 2 | 3 | 4;
  poolSlug: string;
}

/**
 * Color class for a team's name based on match outcome.
 *   - Match not completed: no color class (inherits default)
 *   - Draw: both teams → light blue
 *   - Win/loss: winner → light green, loser → light red
 *
 * `side` is whether we're styling the home team or the away team.
 */
function teamColorClass(
  match: MatchWithTeams,
  side: "home" | "away"
): string {
  if (match.status !== "completed" || !match.result) return "";
  if (match.result === "draw") return "text-blue-400";
  return match.result === side ? "text-green-400" : "text-red-400";
}

/**
 * Truncate a team name to a maximum of 13 characters. Names 13 chars or
 * shorter pass through unchanged; longer names are cut to their first 10
 * characters plus "..." (so the maximum rendered length is always 13).
 *
 * Used by the Group Phase row to keep matchup labels on the left and the
 * pick badge on the right visually bounded — without this, a team like
 * "Korea Republic" or "Bosnia and Herzegovina" can cause the row to wrap
 * or the fixed-width badge to overflow.
 *
 * Matches the same rule used by the knockout bracket view (defined locally
 * in both places rather than shared, since pick-set-bracket-view doesn't
 * export helpers and the function is only three lines).
 */
function truncateTeamName(name: string): string {
  if (name.length <= 13) return name;
  return name.slice(0, 10) + "...";
}

export function PickSetDetail({
  pickSetName,
  participantName,
  matches,
  groups,
  teams,
  groupPicksMap,
  knockoutPicksMap,
  groupCorrect,
  knockoutCorrect,
  groupGraded,
  knockoutGraded,
  totalGroupPicks,
  totalKnockoutPicks,
  knockoutPicksHidden,
  phase,
  poolSlug,
}: PickSetDetailProps) {
  const sortedGroups = [...groups].sort((a, b) =>
    a.letter.localeCompare(b.letter)
  );
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const groupMatches = matches
    .filter((m) => m.phase === "group")
    .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));

  const knockoutMatches = matches
    .filter((m) => m.phase !== "group")
    .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));

  // Group matches by group
  const matchesByGroup = new Map<string, MatchWithTeams[]>();
  for (const m of groupMatches) {
    if (!m.group_id) continue;
    const arr = matchesByGroup.get(m.group_id) ?? [];
    arr.push(m);
    matchesByGroup.set(m.group_id, arr);
  }

  // Group knockout matches by phase (for the list view in phases 2 and 3)
  const phaseOrder: MatchPhase[] = ["r32", "r16", "qf", "sf", "final"];
  const knockoutByPhase = new Map<MatchPhase, MatchWithTeams[]>();
  for (const p of phaseOrder) {
    const phaseMatches = knockoutMatches.filter((m) => m.phase === p);
    if (phaseMatches.length > 0) knockoutByPhase.set(p, phaseMatches);
  }

  // -------------------------------------------------------------------------
  // Phase-4 toggles: user can independently show/hide the Group and Knockout
  // sections by tapping the preview tiles. Both default to ON.
  //
  // Earlier phases don't get the toggles — there's only one section to show
  // anyway, and locking it out would just be annoying.
  // -------------------------------------------------------------------------
  const isPhase4 = phase === 4;
  const [showGroup, setShowGroup] = useState(true);
  const [showKnockout, setShowKnockout] = useState(true);

  const groupVisible = isPhase4 ? showGroup : true;
  const knockoutVisible = isPhase4 ? showKnockout : !knockoutPicksHidden;

  return (
    <div className="space-y-6">
      <Link
        href={`/${poolSlug}/standings`}
        className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
      >
        ← Back to Standings
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold">{pickSetName}</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {participantName}
        </p>
      </div>

      {/* Stats tiles.
          Denominator is graded-count (picks with a decided is_correct), so a
          "31/72" tile is read as "31 correct out of 72 graded", not
          "picked 31 of 72 matches". */}
      <div className="flex gap-3 flex-wrap">
        {totalGroupPicks > 0 && (
          <StatsTile
            label="Group Picks"
            correct={groupCorrect}
            total={groupGraded}
            active={groupVisible}
            toggleable={isPhase4}
            onToggle={() => setShowGroup((v) => !v)}
          />
        )}
        {totalKnockoutPicks > 0 && !knockoutPicksHidden && (
          <StatsTile
            label="Knockout Picks"
            correct={knockoutCorrect}
            total={knockoutGraded}
            active={knockoutVisible}
            toggleable={isPhase4}
            onToggle={() => setShowKnockout((v) => !v)}
          />
        )}
      </div>

      {isPhase4 && !groupVisible && !knockoutVisible && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Both sections are hidden. Tap a tile above to show it.
          </p>
        </div>
      )}

      {/*
        Group and Knockout sections are assembled as variables so we can
        reorder them based on tournament phase. In Phase 4 (knockout games
        underway) the bracket is the most relevant view, so it renders on
        top. In Phases 2/3 the group standings are the primary content, so
        they stay on top — same as before.

        Both sections still have their own visibility checks inside their
        JSX, so either can render as `null` independently. The ordering
        logic is just about where each sits in the DOM when both are
        present.
      */}
      {(() => {
        const groupSection =
          totalGroupPicks > 0 && groupVisible ? (
            <section key="group" className="space-y-4">
              <h2 className="text-lg font-display font-bold">Group Phase</h2>

              {/*
                Desktop (md+) lays groups out as a 2-column grid so the page
                fills its width instead of leaving the right half blank under a
                long stack of group tiles. On md (768px) inside our max-w-5xl
                container each column ends up roughly 360px — plenty for a
                group tile (6 match rows at the widths used inside). Mobile
                (< md) stays one column to preserve the existing tall-scroll
                reading flow on narrow devices.

                Group tiles are uniform height (6 matches each), so the grid
                rows naturally align without any explicit equal-height rule.
              */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedGroups.map((group) => {
                  const gMatches = matchesByGroup.get(group.id) ?? [];
                  if (gMatches.length === 0) return null;

                  return (
                    <div key={group.id}>
                      <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">
                        {group.name}
                      </h3>
                      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
                        {gMatches.map((match) => {
                          const pickData = groupPicksMap[match.id];
                          return (
                            <GroupPickRow
                              key={match.id}
                              match={match}
                              pickData={pickData}
                              poolSlug={poolSlug}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null;

        const knockoutHiddenNotice = knockoutPicksHidden ? (
          <div
            key="ko-hidden"
            className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center"
          >
            <p className="text-sm text-[var(--color-text-secondary)]">
              Knockout bracket picks will be visible once the knockout phase
              begins and picks are locked.
            </p>
          </div>
        ) : null;

        const knockoutSection =
          totalKnockoutPicks > 0 && knockoutVisible && !knockoutPicksHidden ? (
            <div key="knockout">
              {isPhase4 ? (
                <PickSetBracketView
                  matches={knockoutMatches}
                  teams={teams}
                  knockoutPicksMap={knockoutPicksMap}
                />
              ) : (
                <section className="space-y-4">
                  <h2 className="text-lg font-display font-bold">
                    Knockout Phase
                  </h2>

                  {phaseOrder.map((p) => {
                    const phaseMatches = knockoutByPhase.get(p);
                    if (!phaseMatches) return null;

                    return (
                      <div key={p}>
                        <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">
                          {PHASE_LABELS[p]}
                        </h3>
                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
                          {phaseMatches.map((match) => {
                            const pickData = knockoutPicksMap[match.id];
                            return (
                              <KnockoutPickRow
                                key={match.id}
                                match={match}
                                pickData={pickData}
                                teamMap={teamMap}
                                poolSlug={poolSlug}
                                allMatches={knockoutMatches}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}
            </div>
          ) : null;

        // Phase 4: bracket first (tournament is in full swing, that's the
        // primary content). Phases 2 & 3: groups first (knockout may not
        // even be visible yet, and in Phase 2 group matches are still live).
        // The hidden-notice sits where the knockout section would go in
        // either ordering.
        return isPhase4
          ? [knockoutHiddenNotice, knockoutSection, groupSection]
          : [groupSection, knockoutHiddenNotice, knockoutSection];
      })()}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Stats tile — doubles as a section toggle in phase 4
// ----------------------------------------------------------------------------

function StatsTile({
  label,
  correct,
  total,
  active,
  toggleable,
  onToggle,
}: {
  label: string;
  correct: number;
  total: number;
  active: boolean;
  toggleable: boolean;
  onToggle: () => void;
}) {
  const base =
    "rounded-lg border bg-[var(--color-surface)] px-4 py-2.5 transition-colors text-left";
  const activeCls = active
    ? "border-pitch-500 ring-1 ring-pitch-500/40"
    : "border-[var(--color-border)] opacity-60";

  const body = (
    <>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="font-bold">
        <span className="text-correct">{correct}</span>
        <span className="text-[var(--color-text-muted)]">/{total}</span>
      </p>
    </>
  );

  if (!toggleable) {
    return (
      <div className={cn(base, "border-[var(--color-border)]")}>{body}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        base,
        activeCls,
        "hover:bg-[var(--color-surface-raised)] tap-target cursor-pointer"
      )}
    >
      {body}
    </button>
  );
}

// ----------------------------------------------------------------------------
// Group pick row (unchanged from previous version)
// ----------------------------------------------------------------------------

function GroupPickRow({
  match,
  pickData,
  poolSlug,
}: {
  match: MatchWithTeams;
  pickData?: { pick: string; is_correct: boolean | null };
  poolSlug: string;
}) {
  if (!match.home_team || !match.away_team) return null;

  // For the pick-result badge on the right, render both short-code and full-name
  // spans and toggle visibility with the same sm: breakpoint used in the matchup.
  // A plain "Draw" / "—" string renders fine at any width.
  const pickedTeamForLabel =
    pickData?.pick === "home"
      ? match.home_team
      : pickData?.pick === "away"
        ? match.away_team
        : null;
  const plainPickLabel =
    pickData?.pick === "draw" ? "Draw" : !pickData ? "—" : null;

  const isCompleted = match.status === "completed";

  return (
    <Link
      href={`/${poolSlug}/match/${match.id}`}
      className="flex items-center justify-between px-3 py-2.5 hover:bg-[var(--color-surface-raised)] transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <TeamFlag
            flagCode={match.home_team.flag_code}
            teamName={match.home_team.name}
            shortCode={match.home_team.short_code}
            size="16x12"
          />
          {/* Short code on narrow screens (<640px); full name at sm and up.
              Mirrors the pattern used on the /matches page. */}
          <span
            className={cn(
              "text-sm font-medium sm:hidden",
              teamColorClass(match, "home")
            )}
          >
            {match.home_team.short_code}
          </span>
          <span
            className={cn(
              "text-sm font-medium hidden sm:inline",
              teamColorClass(match, "home")
            )}
          >
            {truncateTeamName(match.home_team.name)}
          </span>
        </div>

        {isCompleted ? (
          <span className="text-sm font-bold tabular-nums px-1">
            {match.home_score} – {match.away_score}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">v</span>
        )}

        <div className="flex items-center gap-1.5">
          <TeamFlag
            flagCode={match.away_team.flag_code}
            teamName={match.away_team.name}
            shortCode={match.away_team.short_code}
            size="16x12"
          />
          <span
            className={cn(
              "text-sm font-medium sm:hidden",
              teamColorClass(match, "away")
            )}
          >
            {match.away_team.short_code}
          </span>
          <span
            className={cn(
              "text-sm font-medium hidden sm:inline",
              teamColorClass(match, "away")
            )}
          >
            {truncateTeamName(match.away_team.name)}
          </span>
        </div>
      </div>

      <span
        className={cn(
          // Fixed w-28 gives every badge the same horizontal footprint so
          // the right edge of each group-row badge lines up vertically down
          // the tile. text-center handles the cases where the label is
          // narrower than the badge (e.g. "Draw", "—", or short codes on
          // mobile) — the text sits in the middle instead of hugging the
          // left edge. 112px (w-28) comfortably fits a truncated 13-char
          // name at text-xs + bold + the px-2 side padding.
          "text-xs font-bold px-2 py-1 rounded shrink-0 w-28 text-center",
          pickData?.is_correct === true && "bg-correct/15 text-correct",
          pickData?.is_correct === false && "bg-incorrect/15 text-incorrect",
          pickData?.is_correct === null && "bg-gray-100 text-gray-500",
          !pickData && "text-[var(--color-text-muted)]"
        )}
      >
        {pickedTeamForLabel ? (
          <>
            <span className="sm:hidden">{pickedTeamForLabel.short_code}</span>
            <span className="hidden sm:inline">
              {truncateTeamName(pickedTeamForLabel.name)}
            </span>
          </>
        ) : (
          plainPickLabel
        )}
      </span>
    </Link>
  );
}

// ----------------------------------------------------------------------------
// Knockout pick row (used in phases 2/3 list view — still needed as fallback)
// ----------------------------------------------------------------------------

function KnockoutPickRow({
  match,
  pickData,
  teamMap,
  poolSlug,
  allMatches,
}: {
  match: MatchWithTeams;
  pickData?: { picked_team_id: string; is_correct: boolean | null };
  teamMap: Map<string, Team>;
  poolSlug: string;
  allMatches?: MatchWithTeams[];
}) {
  const homeTeam = match.home_team_id
    ? teamMap.get(match.home_team_id) ?? null
    : null;
  const awayTeam = match.away_team_id
    ? teamMap.get(match.away_team_id) ?? null
    : null;
  const pickedTeam = pickData?.picked_team_id
    ? teamMap.get(pickData.picked_team_id) ?? null
    : null;

  // Derive matchup from feeder results when teams aren't directly assigned
  let derivedHome: Team | null = homeTeam ?? null;
  let derivedAway: Team | null = awayTeam ?? null;

  if ((!derivedHome || !derivedAway) && allMatches && match.match_number) {
    const feeders: Record<number, [number, number]> = {
      89: [73, 74], 90: [75, 76], 91: [77, 78], 92: [79, 80],
      93: [81, 82], 94: [83, 84], 95: [85, 86], 96: [87, 88],
      97: [89, 90], 98: [91, 92], 99: [93, 94], 100: [95, 96],
      101: [97, 98], 102: [99, 100], 103: [101, 102],
    };
    const feederNums = feeders[match.match_number];
    if (feederNums) {
      const matchByNum = new Map(allMatches.map((m) => [m.match_number, m]));
      for (let fi = 0; fi < 2; fi++) {
        const feeder = matchByNum.get(feederNums[fi]);
        if (feeder?.status === "completed" && feeder.result) {
          const winnerId =
            feeder.result === "home" ? feeder.home_team_id : feeder.away_team_id;
          const winner = winnerId ? teamMap.get(winnerId) ?? null : null;
          if (fi === 0) derivedHome = derivedHome ?? winner;
          else derivedAway = derivedAway ?? winner;
        }
      }
    }
  }

  const hasMatchup = derivedHome && derivedAway;
  const isCompleted = match.status === "completed";

  return (
    <Link
      href={`/${poolSlug}/match/${match.id}`}
      className="flex items-center justify-between px-3 py-2.5 hover:bg-[var(--color-surface-raised)] transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
        {hasMatchup ? (
          <>
            <div className="flex items-center gap-1.5">
              <TeamFlag
                flagCode={derivedHome!.flag_code}
                teamName={derivedHome!.name}
                shortCode={derivedHome!.short_code}
                size="16x12"
              />
              {/* Short code on narrow screens (<640px); full name at sm and up. */}
              <span
                className={cn(
                  "text-sm font-medium sm:hidden",
                  teamColorClass(match, "home")
                )}
              >
                {derivedHome!.short_code}
              </span>
              <span
                className={cn(
                  "text-sm font-medium hidden sm:inline",
                  teamColorClass(match, "home")
                )}
              >
                {derivedHome!.name}
              </span>
            </div>

            {isCompleted ? (
              <span className="text-sm font-bold tabular-nums px-1">
                {match.home_score} – {match.away_score}
              </span>
            ) : (
              <span className="text-xs text-[var(--color-text-muted)]">v</span>
            )}

            <div className="flex items-center gap-1.5">
              <TeamFlag
                flagCode={derivedAway!.flag_code}
                teamName={derivedAway!.name}
                shortCode={derivedAway!.short_code}
                size="16x12"
              />
              <span
                className={cn(
                  "text-sm font-medium sm:hidden",
                  teamColorClass(match, "away")
                )}
              >
                {derivedAway!.short_code}
              </span>
              <span
                className={cn(
                  "text-sm font-medium hidden sm:inline",
                  teamColorClass(match, "away")
                )}
              >
                {derivedAway!.name}
              </span>
            </div>
          </>
        ) : (
          <span className="text-sm text-[var(--color-text-muted)] italic">
            {match.label || `Match #${match.match_number}`}
          </span>
        )}
      </div>

      {pickedTeam ? (
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded shrink-0 ml-2",
            pickData?.is_correct === true && "bg-correct/15 text-correct",
            pickData?.is_correct === false && "bg-incorrect/15 text-incorrect",
            pickData?.is_correct === null && "bg-gray-100 text-gray-500"
          )}
        >
          <TeamFlag
            flagCode={pickedTeam.flag_code}
            teamName={pickedTeam.name}
            shortCode={pickedTeam.short_code}
            size="16x12"
          />
          <span className="sm:hidden">{pickedTeam.short_code}</span>
          <span className="hidden sm:inline">{pickedTeam.name}</span>
        </span>
      ) : (
        <span className="text-xs text-[var(--color-text-muted)]">—</span>
      )}
    </Link>
  );
}
