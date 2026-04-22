"use client";

import { useCallback, useMemo } from "react";
import type { Team } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import type {
  MatchInfo,
  WhatIfOverrides,
} from "@/lib/what-if/scoring-engine";
import { cn } from "@/lib/utils/cn";

interface WhatIfBracketPickerProps {
  matches: MatchInfo[];
  teams: Team[];
  overrides: WhatIfOverrides;
  onChange: (next: WhatIfOverrides) => void;
}

// Bracket wiring mirrors src/app/[poolSlug]/my-picks/[pickSetId]/knockout/bracket-picker.tsx
const BRACKET_FEEDERS: Record<number, [number, number]> = {
  89: [73, 74], 90: [75, 76], 91: [77, 78], 92: [79, 80],
  93: [81, 82], 94: [83, 84], 95: [85, 86], 96: [87, 88],
  97: [89, 90], 98: [91, 92], 99: [93, 94], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  103: [101, 102],
};

export function WhatIfBracketPicker({
  matches,
  teams,
  overrides,
  onChange,
}: WhatIfBracketPickerProps) {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const matchByNumber = useMemo(() => {
    const m = new Map<number, MatchInfo>();
    for (const match of matches) {
      if (match.match_number) m.set(match.match_number, match);
    }
    return m;
  }, [matches]);
  const matchById = useMemo(
    () => new Map(matches.map((m) => [m.id, m])),
    [matches]
  );

  /**
   * Resolve the effective home/away teams for a bracket slot.
   *
   * Priority per side:
   *   1. Actual completed feeder → real winner
   *   2. Admin-assigned team (for R32 first round)
   *   3. What-If pick on the feeder match
   */
  const getMatchTeams = useCallback(
    (matchNumber: number): { home: Team | null; away: Team | null } => {
      const match = matchByNumber.get(matchNumber);
      if (!match) return { home: null, away: null };

      const feeders = BRACKET_FEEDERS[matchNumber];
      if (!feeders) {
        // R32 — teams come from admin assignment.
        const home = match.home_team_id
          ? teamMap.get(match.home_team_id) ?? null
          : null;
        const away = match.away_team_id
          ? teamMap.get(match.away_team_id) ?? null
          : null;
        return { home, away };
      }

      // Later round — compute each side.
      const [feederA, feederB] = feeders;
      const resolveSide = (feederNum: number): Team | null => {
        const feeder = matchByNumber.get(feederNum);
        if (!feeder) return null;
        // Real result wins.
        if (feeder.actual_status === "completed" && feeder.actual_result) {
          const winnerId =
            feeder.actual_result === "home"
              ? feeder.home_team_id
              : feeder.away_team_id;
          return winnerId ? teamMap.get(winnerId) ?? null : null;
        }
        // Otherwise use what-if pick on that feeder.
        const overrideWinner = overrides.knockoutWinners[feeder.id];
        return overrideWinner ? teamMap.get(overrideWinner) ?? null : null;
      };

      return { home: resolveSide(feederA), away: resolveSide(feederB) };
    },
    [matchByNumber, teamMap, overrides.knockoutWinners]
  );

  // Recursively clear downstream what-if picks if the team they referenced
  // is no longer in that slot.
  const clearDownstream = useCallback(
    (
      workingWinners: Record<string, string>,
      changedMatchId: string,
      eliminatedTeamId: string
    ): void => {
      const changedMatch = matchById.get(changedMatchId);
      if (!changedMatch?.match_number) return;
      for (const [laterNumStr, feeders] of Object.entries(BRACKET_FEEDERS)) {
        const [fA, fB] = feeders;
        if (changedMatch.match_number !== fA && changedMatch.match_number !== fB) {
          continue;
        }
        const laterMatch = matchByNumber.get(parseInt(laterNumStr, 10));
        if (!laterMatch) continue;
        if (workingWinners[laterMatch.id] === eliminatedTeamId) {
          delete workingWinners[laterMatch.id];
          clearDownstream(workingWinners, laterMatch.id, eliminatedTeamId);
        }
      }
    },
    [matchById, matchByNumber]
  );

  const handlePick = useCallback(
    (matchId: string, teamId: string) => {
      const match = matchById.get(matchId);
      // Block picks on real completed matches — belt + suspenders (UI also prevents)
      if (match?.actual_status === "completed") return;

      const nextWinners = { ...overrides.knockoutWinners };
      const oldPick = nextWinners[matchId];

      if (oldPick === teamId) {
        // Tap again to clear
        delete nextWinners[matchId];
        if (oldPick) clearDownstream(nextWinners, matchId, oldPick);
      } else {
        nextWinners[matchId] = teamId;
        if (oldPick && oldPick !== teamId) {
          clearDownstream(nextWinners, matchId, oldPick);
        }
      }

      onChange({ ...overrides, knockoutWinners: nextWinners });
    },
    [clearDownstream, matchById, onChange, overrides]
  );

  // Column layouts match the existing bracket picker.
  const leftR32 = [73, 74, 75, 76, 77, 78, 79, 80];
  const rightR32 = [81, 82, 83, 84, 85, 86, 87, 88];
  const leftR16 = [89, 90, 91, 92];
  const rightR16 = [93, 94, 95, 96];
  const leftQF = [97, 98];
  const rightQF = [99, 100];
  const leftSF = [101];
  const rightSF = [102];
  const finalMatch = [103];

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-display font-bold">Knockout Bracket — What If</h2>
      <p className="text-xs text-[var(--color-text-muted)]">
        Tap a team to advance them. Tap again to clear.
      </p>

      <div className="overflow-x-auto -mx-4 px-4 pb-4">
        <div
          className="min-w-[900px] grid grid-cols-9 gap-x-1 items-center"
          style={{ minHeight: 720 }}
        >
          <Column
            matchNumbers={leftR32}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
            compact
          />
          <Column
            matchNumbers={leftR16}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
            compact
          />
          <Column
            matchNumbers={leftQF}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
          />
          <Column
            matchNumbers={leftSF}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
          />

          {/* Final column */}
          <div className="flex flex-col justify-center h-full">
            <div className="text-center text-xs font-bold text-[var(--color-text-muted)] mb-2">
              FINAL
            </div>
            {finalMatch.map((mn) => (
              <BracketMatch
                key={mn}
                matchNumber={mn}
                matchByNumber={matchByNumber}
                getMatchTeams={getMatchTeams}
                overrides={overrides}
                onPick={handlePick}
                isFinal
              />
            ))}
          </div>

          <Column
            matchNumbers={rightSF}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
          />
          <Column
            matchNumbers={rightQF}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
          />
          <Column
            matchNumbers={rightR16}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
            compact
          />
          <Column
            matchNumbers={rightR32}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
            compact
          />
        </div>
      </div>
    </section>
  );
}

// ---- Column helper ----

function Column({
  matchNumbers,
  matchByNumber,
  getMatchTeams,
  overrides,
  onPick,
  compact,
}: {
  matchNumbers: number[];
  matchByNumber: Map<number, MatchInfo>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  overrides: WhatIfOverrides;
  onPick: (matchId: string, teamId: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col justify-around h-full gap-1">
      {matchNumbers.map((mn) => (
        <BracketMatch
          key={mn}
          matchNumber={mn}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          overrides={overrides}
          onPick={onPick}
          compact={compact}
        />
      ))}
    </div>
  );
}

// ---- Single bracket slot ----

function BracketMatch({
  matchNumber,
  matchByNumber,
  getMatchTeams,
  overrides,
  onPick,
  compact,
  isFinal,
}: {
  matchNumber: number;
  matchByNumber: Map<number, MatchInfo>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  overrides: WhatIfOverrides;
  onPick: (matchId: string, teamId: string) => void;
  compact?: boolean;
  isFinal?: boolean;
}) {
  const match = matchByNumber.get(matchNumber);
  if (!match) return <div className="h-16" />;

  const { home, away } = getMatchTeams(matchNumber);

  // Real result locks the match.
  const isDecided = match.actual_status === "completed" && !!match.actual_result;
  const actualWinnerId = isDecided
    ? match.actual_result === "home"
      ? match.home_team_id
      : match.away_team_id
    : null;

  const whatIfWinnerId = overrides.knockoutWinners[match.id] ?? null;
  const effectiveWinnerId = actualWinnerId ?? whatIfWinnerId;

  const labelSize = compact ? "text-2xs" : "text-xs";
  const padding = compact ? "px-1.5 py-1" : "px-2 py-1.5";

  return (
    <div
      className={cn(
        "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden",
        isFinal && "ring-1 ring-gold-300"
      )}
    >
      {[
        { team: home, slot: "home" as const },
        { team: away, slot: "away" as const },
      ].map(({ team, slot }, i) => {
        const isWinner = team?.id && effectiveWinnerId === team.id;
        const isLocked = isDecided;

        return (
          <button
            key={slot}
            type="button"
            disabled={isLocked || !team}
            onClick={() => team && onPick(match.id, team.id)}
            className={cn(
              "w-full flex items-center gap-1.5 text-left transition-colors",
              padding,
              i === 0 && "border-b border-[var(--color-border)]",
              !team && "opacity-40 cursor-default",
              isLocked
                ? isWinner
                  ? "bg-gray-100 text-gray-700 cursor-default"
                  : "text-[var(--color-text-muted)] cursor-default line-through decoration-1"
                : isWinner
                  ? "bg-pitch-100 text-pitch-700 font-semibold"
                  : "hover:bg-[var(--color-surface-raised)]"
            )}
          >
            {team ? (
              <>
                <TeamFlag
                  flagCode={team.flag_code}
                  teamName={team.name}
                  shortCode={team.short_code}
                  size="16x12"
                />
                <span className={cn(labelSize, "truncate")}>
                  {team.short_code}
                </span>
              </>
            ) : (
              <span className={cn(labelSize, "italic text-[var(--color-text-muted)]")}>
                TBD
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
