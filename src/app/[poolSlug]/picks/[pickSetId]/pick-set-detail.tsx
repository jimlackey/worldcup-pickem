"use client";

import { useState } from "react";
import Link from "next/link";
import type { MatchWithTeams, Group, Team, MatchPhase, Pool } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { PickSetBracketView } from "@/components/picks/pick-set-bracket-view";
import {
  BRACKET_FEEDERS,
  CONSOLATION_FEEDERS,
  CONSOLATION_MATCH_NUMBER,
} from "@/lib/picks/bracket-wiring";

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
  /**
   * Pool — needed to drive the read-only bracket view's consolation
   * rendering and to control whether consolation matches appear in the
   * phase 2/3 list view.
   */
  pool: Pick<Pool, "consolation_match_enabled">;
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
  pool,
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

  // Group knockout matches by phase (for the list view in phases 2 and 3).
  // Includes "consolation" so the third-place match shows up at the bottom
  // of the knockout list when the pool has it enabled (the upstream filter
  // strips it from `matches` when the flag is off, so it's safe to leave
  // unconditionally in the order here).
  const phaseOrder: MatchPhase[] = ["r32", "r16", "qf", "sf", "final", "consolation"];
  const knockoutByPhase = new Map<MatchPhase, MatchWithTeams[]>();
  for (const p of phaseOrder) {
    const phaseMatches = knockoutMatches.filter((m) => m.phase === p);
    if (phaseMatches.length > 0) knockoutByPhase.set(p, phaseMatches);
  }

  // -------------------------------------------------------------------------
  // Phase-4 toggles: user can independently show/hide the Group and Knockout
  // sections by tapping the preview tiles. Both default to ON.
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

      {/* Stats tiles. */}
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

      {(() => {
        const groupSection =
          totalGroupPicks > 0 && groupVisible ? (
            <section key="group" className="space-y-4">
              <h2 className="text-lg font-display font-bold">Group Phase</h2>
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
                  pool={pool}
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
// Group pick row
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
// Knockout pick row (used in phases 2/3 list view)
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

  // Derive matchup from feeder results when teams aren't directly assigned.
  //
  // For the championship bracket (R16-Final) we use feeder WINNERS — the
  // standard advancement path. For the consolation match (#104) we use
  // feeder LOSERS, since the consolation is contested between the two
  // teams that lost their semifinals. The two paths use different maps
  // imported from bracket-wiring.ts so the polarity is explicit.
  let derivedHome: Team | null = homeTeam ?? null;
  let derivedAway: Team | null = awayTeam ?? null;

  if ((!derivedHome || !derivedAway) && allMatches && match.match_number) {
    const matchByNum = new Map(allMatches.map((m) => [m.match_number, m]));

    if (match.match_number === CONSOLATION_MATCH_NUMBER) {
      // Consolation: home from loser of feederA, away from loser of feederB
      const [feederA, feederB] = CONSOLATION_FEEDERS;
      const feeders = [feederA, feederB];
      for (let fi = 0; fi < 2; fi++) {
        const feeder = matchByNum.get(feeders[fi]);
        if (feeder?.status === "completed" && feeder.result) {
          const loserId =
            feeder.result === "home" ? feeder.away_team_id : feeder.home_team_id;
          const loser = loserId ? teamMap.get(loserId) ?? null : null;
          if (fi === 0) derivedHome = derivedHome ?? loser;
          else derivedAway = derivedAway ?? loser;
        }
      }
    } else {
      // Championship advancement: feeder winners
      const feederNums = BRACKET_FEEDERS[match.match_number];
      if (feederNums) {
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
