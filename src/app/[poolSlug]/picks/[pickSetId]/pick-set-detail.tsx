"use client";

import Link from "next/link";
import type { MatchWithTeams, Group, Team, MatchPhase } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

interface PickSetDetailProps {
  pickSetName: string;
  participantName: string;
  matches: MatchWithTeams[];
  groups: Group[];
  teams: Team[];
  groupPicksMap: Record<string, { pick: string; is_correct: boolean | null }>;
  knockoutPicksMap: Record<string, { picked_team_id: string; is_correct: boolean | null }>;
  groupCorrect: number;
  knockoutCorrect: number;
  totalGroupPicks: number;
  totalKnockoutPicks: number;
  knockoutPicksHidden?: boolean;
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
  totalGroupPicks,
  totalKnockoutPicks,
  knockoutPicksHidden,
  poolSlug,
}: PickSetDetailProps) {
  const sortedGroups = [...groups].sort((a, b) => a.letter.localeCompare(b.letter));
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

  // Group knockout matches by phase
  const phaseOrder: MatchPhase[] = ["r32", "r16", "qf", "sf", "final"];
  const knockoutByPhase = new Map<MatchPhase, MatchWithTeams[]>();
  for (const phase of phaseOrder) {
    const phaseMatches = knockoutMatches.filter((m) => m.phase === phase);
    if (phaseMatches.length > 0) knockoutByPhase.set(phase, phaseMatches);
  }

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

      {/* Stats */}
      <div className="flex gap-3">
        {totalGroupPicks > 0 && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
            <p className="text-xs text-[var(--color-text-muted)]">Group Picks</p>
            <p className="font-bold">
              <span className="text-correct">{groupCorrect}</span>
              <span className="text-[var(--color-text-muted)]">/{totalGroupPicks}</span>
            </p>
          </div>
        )}
        {totalKnockoutPicks > 0 && !knockoutPicksHidden && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
            <p className="text-xs text-[var(--color-text-muted)]">Knockout Picks</p>
            <p className="font-bold">
              <span className="text-correct">{knockoutCorrect}</span>
              <span className="text-[var(--color-text-muted)]">/{totalKnockoutPicks}</span>
            </p>
          </div>
        )}
      </div>

      {/* Group phase picks */}
      {totalGroupPicks > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-display font-bold">Group Phase</h2>

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
        </section>
      )}

      {/* Knockout picks */}
      {knockoutPicksHidden && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Knockout bracket picks will be visible once the knockout phase begins and picks are locked.
          </p>
        </div>
      )}

      {totalKnockoutPicks > 0 && !knockoutPicksHidden && (
        <section className="space-y-4">
          <h2 className="text-lg font-display font-bold">Knockout Phase</h2>

          {phaseOrder.map((phase) => {
            const phaseMatches = knockoutByPhase.get(phase);
            if (!phaseMatches) return null;

            return (
              <div key={phase}>
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">
                  {PHASE_LABELS[phase]}
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
  );
}

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
            {match.home_team.name}
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
            {match.away_team.name}
          </span>
        </div>
      </div>

      <span
        className={cn(
          "text-xs font-bold px-2 py-1 rounded shrink-0",
          pickData?.is_correct === true && "bg-correct/15 text-correct",
          pickData?.is_correct === false && "bg-incorrect/15 text-incorrect",
          pickData?.is_correct === null && "bg-gray-100 text-gray-500",
          !pickData && "text-[var(--color-text-muted)]"
        )}
      >
        {pickedTeamForLabel ? (
          <>
            <span className="sm:hidden">{pickedTeamForLabel.short_code}</span>
            <span className="hidden sm:inline">{pickedTeamForLabel.name}</span>
          </>
        ) : (
          plainPickLabel
        )}
      </span>
    </Link>
  );
}

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
  const homeTeam = match.home_team_id ? teamMap.get(match.home_team_id) ?? null : null;
  const awayTeam = match.away_team_id ? teamMap.get(match.away_team_id) ?? null : null;
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
          const winnerId = feeder.result === "home" ? feeder.home_team_id : feeder.away_team_id;
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
