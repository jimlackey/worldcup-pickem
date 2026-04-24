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

// Vertical rhythm constants — one-sided bracket layout.
// Each R32 slot is SLOT_H tall. Later rounds scale up so their vertical
// centers align to the midpoint of their feeders.
const SLOT_H = 36;
const BRACKET_H = SLOT_H * 16;

// Minimum bracket width. Was 460 originally, then 400 in the first pass.
// Now 360: at the sm breakpoint inside max-w-5xl, the picker column is
// ~370px, so the bracket needs to fit within that. Achieved by:
//   - gap-0 between bracket columns (was gap-1 originally)
//   - Per-slot horizontal padding px-1 (was px-1.5)
//   - 5 columns * ~72px content each ≈ 360
//
// If the user is on a narrower-than-sm-but-still-sm viewport (possible in
// e.g. split-screen), the outer overflow-x-auto wrapper provides a
// horizontal scroll safety net INSIDE the bracket column — the what-if
// page itself does not horizontally scroll, only the bracket does.
const BRACKET_MIN_W = 360;

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
      if (match?.actual_status === "completed") return;

      const nextWinners = { ...overrides.knockoutWinners };
      const oldPick = nextWinners[matchId];

      if (oldPick === teamId) {
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

  // ---- Column definitions, top-to-bottom ----
  // Unlike the tournament's traditional bracket (left half / right half), this
  // is a one-sided layout — all 16 R32 matches stack top-to-bottom.
  const r32Order = [
    73, 74, 75, 76, 77, 78, 79, 80,
    81, 82, 83, 84, 85, 86, 87, 88,
  ];
  const r16Order = [89, 90, 91, 92, 93, 94, 95, 96];
  const qfOrder = [97, 98, 99, 100];
  const sfOrder = [101, 102];
  const finalOrder = [103];

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-display font-bold">Knockout Bracket — What If</h2>

      {/*
        overflow-x-auto inside the section means if the bracket needs more
        than its column provides, IT scrolls horizontally — the page itself
        doesn't, so the standings table stays put on the right.
        gap-0 between the 5 bracket columns: every pixel counts at this width,
        and the column dividers already provide enough visual separation.
      */}
      <div className="overflow-x-auto -mx-1 px-1 pb-2">
        <div
          className="flex items-stretch"
          style={{ height: BRACKET_H, minWidth: BRACKET_MIN_W }}
        >
          <BracketColumn
            matchNumbers={r32Order}
            slotHeight={SLOT_H}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
          />
          <BracketColumn
            matchNumbers={r16Order}
            slotHeight={SLOT_H * 2}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
          />
          <BracketColumn
            matchNumbers={qfOrder}
            slotHeight={SLOT_H * 4}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
          />
          <BracketColumn
            matchNumbers={sfOrder}
            slotHeight={SLOT_H * 8}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
          />
          <BracketColumn
            matchNumbers={finalOrder}
            slotHeight={SLOT_H * 16}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={handlePick}
            isFinal
          />
        </div>
      </div>
    </section>
  );
}

// ---- Column helper ----
// Each match is centered within its allotted vertical space. That vertical
// center aligns to the midpoint of its two feeders in the previous column,
// because the feeder column allocates half the vertical per slot.

function BracketColumn({
  matchNumbers,
  slotHeight,
  matchByNumber,
  getMatchTeams,
  overrides,
  onPick,
  isFinal,
}: {
  matchNumbers: number[];
  slotHeight: number;
  matchByNumber: Map<number, MatchInfo>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  overrides: WhatIfOverrides;
  onPick: (matchId: string, teamId: string) => void;
  isFinal?: boolean;
}) {
  return (
    // px-0.5 inside each column provides a tiny bit of visual breathing room
    // between the slot borders of adjacent columns, without costing the
    // meaningful pixels that a full gap-1 would.
    <div className="flex flex-col flex-1 min-w-0 px-0.5">
      {matchNumbers.map((mn) => (
        <div
          key={mn}
          className="flex items-center justify-center"
          style={{ height: slotHeight }}
        >
          <BracketMatch
            matchNumber={mn}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            overrides={overrides}
            onPick={onPick}
            isFinal={isFinal}
          />
        </div>
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
  isFinal,
}: {
  matchNumber: number;
  matchByNumber: Map<number, MatchInfo>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  overrides: WhatIfOverrides;
  onPick: (matchId: string, teamId: string) => void;
  isFinal?: boolean;
}) {
  const match = matchByNumber.get(matchNumber);
  if (!match) return <div />;

  const { home, away } = getMatchTeams(matchNumber);

  const isDecided = match.actual_status === "completed" && !!match.actual_result;
  const actualWinnerId = isDecided
    ? match.actual_result === "home"
      ? match.home_team_id
      : match.away_team_id
    : null;

  const whatIfWinnerId = overrides.knockoutWinners[match.id] ?? null;
  const effectiveWinnerId = actualWinnerId ?? whatIfWinnerId;

  return (
    <div
      className={cn(
        "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden w-full",
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
              "w-full flex items-center gap-1 text-left transition-colors px-1 py-0.5",
              i === 0 && "border-b border-[var(--color-border)]",
              !team && "opacity-40 cursor-default",
              // Tiny rounding on the winner row in the completed state so the
              // inset ring reads as a pill around the team, not flush with
              // the card edges. Mirrors the pattern used in PickSetBracketView.
              isLocked && isWinner && "rounded-sm",
              isLocked
                ? isWinner
                  // Completed winner: green text + green outline (ring) +
                  // soft green fill. Matches /picks/{id} BracketSlot's
                  // "picked + correct" treatment so the two surfaces read
                  // the same to users who move between them.
                  ? "ring-2 ring-inset ring-correct bg-correct/10 text-correct font-semibold cursor-default"
                  // Completed loser: muted + strikethrough — same as the
                  // "eliminated, not picked" row in PickSetBracketView.
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
                <span className="text-2xs truncate">{team.short_code}</span>
              </>
            ) : (
              <span className="text-2xs italic text-[var(--color-text-muted)]">
                TBD
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
