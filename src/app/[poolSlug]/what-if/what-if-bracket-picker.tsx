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

// Vertical rhythm — each R32 slot is SLOT_H tall; later rounds get
// powers-of-two multiples so each card's centre aligns to its feeder pair
// midpoint.
//
// SLOT_H = 44 sized to the card's content height at text-xs:
//   2 rows × (16px text-xs line-height + 4px py-0.5 padding) +
//   1px row divider + 2px outer border ≈ 43px.
// At SLOT_H = 36 (used while the bracket rendered in text-2xs) cards
// would have overflowed their slot allotments after the font bump,
// producing the same "stacked on top of each other" overlap we hit on
// the My Picks bracket-picker mobile layout.
const SLOT_H = 44;
const BRACKET_H = SLOT_H * 16;

// Bracket sizing: fixed column width.
//
// Every bracket column gets the same fixed width via COLUMN_W. This is
// chosen to comfortably hold the worst-case label — an 11-char
// truncated country name like "Bosnia a..." (8 chars + "...") at
// text-xs — with a small buffer so the longest names don't kiss the
// right edge of their card. Slot anatomy at the budget:
//
//   2px border + 4px slot padding + 16px flag + 2px gap +
//   ≈66px text (11 chars at text-xs ≈ 6px per char average; the
//   trailing "..." is narrower than three regular characters)
//   + ~10px buffer
//   ≈ 100px per column
//
// We arrived at 100px after the user asked for a more 50/50-ish
// horizontal split between the bracket and the standings panel. The
// previous 80px / text-2xs combo left the bracket feeling cramped and
// the standings feeling sparse, since the bracket only used ~410px and
// the standings absorbed ~580px of mostly-whitespace. Bumping the
// label font from text-2xs → text-xs reads more comfortably and grew
// the bracket's natural width to ≈510px, much closer to the standings'
// natural usage.
//
// Earlier we also tried per-column content-driven widths (each round
// sizing independently to its widest card). That got rid of trailing
// whitespace inside long-label cards but produced columns of visibly
// different widths, which made the bracket read as ragged. Fixed
// COLUMN_W gives every match block the same footprint regardless of
// which round or which pick.
//
// Bracket overall width: 5 columns × COLUMN_W + 5 × 2px column padding
// ≈ 510px. The picker container's max-width in what-if-shell.tsx is
// set just above that so the bracket fits without triggering its own
// horizontal scroll. `overflow-x-auto` on the bracket wrapper stays as
// a safety net.
const COLUMN_W = 100;

/**
 * Truncate a team name to a maximum of 11 characters. Names 11 chars or
 * shorter pass through unchanged; longer names are cut to their first 8
 * characters plus "..." (so the maximum rendered length is always 11).
 *
 * This is the What If bracket's own tighter rule — the rest of the
 * project (pick-set-bracket-view, pick-set-detail, my-picks knockout
 * bracket-picker) uses 13 chars / 10 + "...". The What If bracket lives
 * in a column shared with the standings table on the right, so the
 * 11-char rule keeps each bracket column at COLUMN_W = 100 even at the
 * larger text-xs font size — small enough to leave the standings room
 * to breathe but big enough to read comfortably.
 */
function truncateTeamName(name: string): string {
  if (name.length <= 11) return name;
  return name.slice(0, 8) + "...";
}

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

      const [feederA, feederB] = feeders;

      const resolveSide = (feederNumber: number): Team | null => {
        const feeder = matchByNumber.get(feederNumber);
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

  // Column definitions, top-to-bottom. One-sided layout — all 16 R32
  // matches stack top-to-bottom, R16 below them gets 8 cards each twice
  // as tall as an R32 slot, etc. This is the same layout regardless of
  // viewport size: the What If page intentionally keeps the bracket
  // narrow so the standings table on the right has room to breathe.
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
        The bracket sizes to its content — the sum of its 5 columns'
        intrinsic widths. Each column independently sizes to its widest
        card's text label, so rounds with short picks stay narrow while
        rounds with longer picks expand as needed. We no longer set a
        minWidth here: the natural width IS the right width.

        overflow-x-auto stays as a safety net for cases where a future
        change blows the budget — if total content width ever exceeds the
        picker container, the bracket scrolls horizontally inside its own
        wrapper rather than pushing the standings table off-screen.
      */}
      <div className="overflow-x-auto -mx-1 px-1 pb-2">
        <div
          className="flex items-stretch"
          style={{ height: BRACKET_H }}
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
//
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
    // Fixed COLUMN_W via inline style — every column gets the same width
    // so every match block ends up the same width too (cards stretch to
    // fill their column via `w-full` inside BracketMatch). This is the
    // uniform-width look: a column whose widest pick is "Iraq" reserves
    // the same horizontal slice as a column whose widest pick is
    // "Bosnia and...", at the cost of a little trailing whitespace
    // inside short-label cards. The trade was worth it — independently
    // sized columns made the bracket read as ragged.
    //
    // shrink-0 keeps the column at its full COLUMN_W even when the
    // parent flex row would otherwise compress it.
    //
    // px-px (1px each side) is the absolute minimum breathing room
    // between adjacent columns. Anything more bloats the bracket width;
    // anything less and adjacent column borders kiss visually.
    <div
      className="flex flex-col shrink-0 px-px"
      style={{ width: COLUMN_W }}
    >
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
              // Tight horizontal padding — px-0.5 (2px each side) keeps
              // the truncated 11-char label inside the COLUMN_W = 100
              // budget without giving up legibility. gap-0.5 (2px)
              // between flag and label is the minimum that still reads
              // as separate elements.
              "w-full flex items-center gap-0.5 text-left transition-colors px-0.5 py-0.5",
              i === 0 && "border-b border-[var(--color-border)]",
              !team && "opacity-40 cursor-default",
              // Tiny rounding on the winner row in the completed state so the
              // inset ring reads as a pill around the team, not flush with
              // the card edges. Mirrors the pattern used in PickSetBracketView.
              isLocked && isWinner && "rounded-sm",
              isLocked
                ? isWinner
                  // Completed winner: neutral text + bold + very-light-grey
                  // ring. Intentionally NOT green — green is reserved for
                  // hypothetical (what-if) picks in the undecided rows, so
                  // we don't want the same hue doing double-duty on
                  // already-decided rows.
                  ? "ring-2 ring-inset ring-gray-200 text-[var(--color-text)] font-bold cursor-default"
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
                <span className="text-xs truncate min-w-0">
                  {truncateTeamName(team.name)}
                </span>
              </>
            ) : (
              <span className="text-xs italic text-[var(--color-text-muted)]">
                TBD
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
