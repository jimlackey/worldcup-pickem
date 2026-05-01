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

// One-sided bracket order — same column sequence as the mobile path of the
// My Picks bracket-picker. R32 stacks 16 deep in the leftmost column,
// R16 has 8 cards each twice the slot height of R32, etc., so each
// later-round card's centre aligns with its feeder pair midpoint.
const R32 = [
  73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88,
];
const R16 = [89, 90, 91, 92, 93, 94, 95, 96];
const QF = [97, 98, 99, 100];
const SF = [101, 102];
const FINAL_MATCH = [103];

// Vertical rhythm constants — kept identical to the My Picks mobile path
// so the two views read as siblings.
//
// Card content per row: 27px (the dense path used on mobile My Picks)
// Card total: 27 + 27 + 1 (row divider) + 2 (outer border) = 57px
// Slot height: 59px → 2px of leftover splits as 1px above + 1px below
// the card via flex centring, giving a 2px visible gap between
// adjacent stacked R32 cards. Just enough to read as separate matches.
//
// Total bracket height: 16 × 59 = 944px. That's a long mobile scroll;
// on desktop the bracket sits in a sm:max-w-[340px] column next to the
// standings, so the user scrolls the page (or nothing, if the standings
// is taller anyway).
const SLOT_H = 59;

// Bracket horizontal floor. Below this width the bracket scrolls inside
// its overflow-x-auto wrapper rather than letting the page scroll. 440
// matches the My Picks mobile bracket (`bracket-picker.tsx`'s
// `ONE_SIDED_MIN_W`) so the two views render at exactly the same scale.
//
// Per column at 440 floor: 440 / 5 = 88px. Card content ≈ 70px
// (12px padding + 16px flag + 6px gap + ~22px short code + ~12px
// checkmark + 2px border), so there's ~18px of slack per column — the
// short code never truncates and the trailing checkmark always has
// somewhere comfortable to land via ml-auto.
//
// Earlier this was 360 which packed the columns tightly enough that
// `truncate` on the label span kicked in and produced "C..." / "J..."
// abbreviations of perfectly-short codes like "CPV" / "JPN".
const ONE_SIDED_MIN_W = 440;

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

  const ctx: SlotRenderContext = {
    matchByNumber,
    getMatchTeams,
    overrides,
    onPick: handlePick,
  };

  const totalH = SLOT_H * R32.length;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-display font-bold">Knockout Bracket — What If</h2>

      {/*
        One-sided bracket — same layout at every viewport size. The shell
        (what-if-shell.tsx) chooses whether to put the standings to the
        right (sm+) or below (mobile); this picker doesn't change either
        way. Mirrors the mobile path of bracket-picker.tsx so the two
        bracket views feel like siblings.

        overflow-x-auto on the wrapper means: if the picker container is
        narrower than ONE_SIDED_MIN_W, the bracket scrolls horizontally
        inside its own box rather than pushing the page wider than the
        viewport.
      */}
      <div className="overflow-x-auto -mx-1 px-1 pb-2">
        <div
          className="flex items-stretch"
          style={{ height: totalH, minWidth: ONE_SIDED_MIN_W }}
        >
          <BracketColumn
            matchNumbers={R32}
            slotHeight={SLOT_H}
            ctx={ctx}
          />
          <BracketColumn
            matchNumbers={R16}
            slotHeight={SLOT_H * 2}
            ctx={ctx}
          />
          <BracketColumn
            matchNumbers={QF}
            slotHeight={SLOT_H * 4}
            ctx={ctx}
          />
          <BracketColumn
            matchNumbers={SF}
            slotHeight={SLOT_H * 8}
            ctx={ctx}
          />
          <BracketColumn
            matchNumbers={FINAL_MATCH}
            slotHeight={SLOT_H * 16}
            ctx={ctx}
            isFinal
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared render context
// ---------------------------------------------------------------------------

interface SlotRenderContext {
  matchByNumber: Map<number, MatchInfo>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  overrides: WhatIfOverrides;
  onPick: (matchId: string, teamId: string) => void;
}

// ---------------------------------------------------------------------------
// Column helper
// ---------------------------------------------------------------------------
//
// Each match is centred within its allotted vertical space (slotHeight).
// That vertical centre aligns to the midpoint of its two feeders in the
// previous column, because the feeder column allocates half the vertical
// space per slot.
//
// `flex-1 min-w-0 px-0.5` mirrors the My Picks mobile column. flex-1 lets
// columns share whatever horizontal space the parent has — at the bracket's
// minWidth (360) each column gets ≈ 71px, which fits flag + 3-char code +
// gap + checkmark comfortably.

function BracketColumn({
  matchNumbers,
  slotHeight,
  ctx,
  isFinal,
}: {
  matchNumbers: number[];
  slotHeight: number;
  ctx: SlotRenderContext;
  isFinal?: boolean;
}) {
  return (
    <div className="flex flex-col flex-1 min-w-0 px-0.5">
      {matchNumbers.map((mn) => (
        <div
          key={mn}
          className="flex items-center justify-center"
          style={{ height: slotHeight }}
        >
          <BracketMatch
            matchNumber={mn}
            ctx={ctx}
            isFinal={isFinal}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single bracket match (two-row card: home / away)
// ---------------------------------------------------------------------------

function BracketMatch({
  matchNumber,
  ctx,
  isFinal,
}: {
  matchNumber: number;
  ctx: SlotRenderContext;
  isFinal?: boolean;
}) {
  const match = ctx.matchByNumber.get(matchNumber);
  if (!match) return <div />;

  const { home, away } = ctx.getMatchTeams(matchNumber);

  // What gets the green / grey treatment depends on whether the match is
  // already decided. Once decided we colour by the actual result and lock
  // the row from further interaction; until then we colour by the
  // hypothetical pick (if any), and clicking flips the pick.
  const isDecided = match.actual_status === "completed" && !!match.actual_result;
  const actualWinnerId = isDecided
    ? match.actual_result === "home"
      ? match.home_team_id
      : match.away_team_id
    : null;

  const whatIfWinnerId = ctx.overrides.knockoutWinners[match.id] ?? null;

  return (
    <div
      className={cn(
        "rounded border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden w-full",
        isFinal && "border-gold-300 shadow-sm"
      )}
    >
      <TeamSlot
        team={home}
        isHypothetical={!isDecided && whatIfWinnerId === home?.id}
        isActualWinner={isDecided && actualWinnerId === home?.id}
        isActualLoser={isDecided && actualWinnerId !== home?.id && home !== null}
        onClick={() => home && ctx.onPick(match.id, home.id)}
        disabled={isDecided || !home}
      />
      <div className="border-t border-[var(--color-border)]" />
      <TeamSlot
        team={away}
        isHypothetical={!isDecided && whatIfWinnerId === away?.id}
        isActualWinner={isDecided && actualWinnerId === away?.id}
        isActualLoser={isDecided && actualWinnerId !== away?.id && away !== null}
        onClick={() => away && ctx.onPick(match.id, away.id)}
        disabled={isDecided || !away}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single team row inside a match card. Visual states:
//
//   1. !team                — empty placeholder, "TBD" italic muted
//   2. isActualWinner       — completed match, this team won.
//                              Subtle grey fill (bg-gray-500/15) + bold
//                              text + white ✓. Mirrors the SHAPE of My
//                              Picks' winner treatment (which uses
//                              bg-correct/10 + green ✓), just neutralised
//                              from green to grey because in this view
//                              green is reserved for hypothetical picks.
//   3. isActualLoser        — completed match, this team lost.
//                              Muted text + strikethrough, locked.
//   4. isHypothetical       — open match, this team is the player's
//                              what-if pick. Light-green bg + green
//                              checkmark. Mirrors the My Picks
//                              "selected" state for visual consistency.
//   5. open + not picked    — open match, no pick or pick is the other
//                              side. Neutral, hoverable, clickable.
//
// Mirrors the row anatomy of the My Picks mobile path: dense h-[27px]
// rows, px-1.5 horizontal padding, gap-1.5 between flag and label,
// text-2xs short-code label, ml-auto checkmark.
// ---------------------------------------------------------------------------

function TeamSlot({
  team,
  isHypothetical,
  isActualWinner,
  isActualLoser,
  onClick,
  disabled,
}: {
  team: Team | null;
  isHypothetical: boolean;
  isActualWinner: boolean;
  isActualLoser: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  if (!team) {
    return (
      <div className="px-1.5 h-[27px] flex items-center text-2xs text-[var(--color-text-muted)] italic">
        TBD
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-1.5 text-left transition-all px-1.5 py-1 h-[27px]",
        // Decided states (locked).
        //
        // Winner: clearly visible grey fill + bold text + white ✓
        // (rendered below). Mirrors the SHAPE of the My Picks bracket's
        // "winner" treatment (which uses bg-correct/10 + green ✓), just
        // swapped from green to neutral grey because in the What-If
        // view, green is reserved for HYPOTHETICAL picks — applying it
        // to actual winners would make the two readings collide.
        //
        // bg-gray-500/40 chosen specifically for visible contrast in
        // dark mode. Earlier 15% and 30% opacities both rendered too
        // subtle — gray-500 is desaturated, so even at moderate opacity
        // it disappears against a dark surface. 40% gives the row a
        // clearly noticeable lift in both light and dark modes without
        // requiring explicit dark-mode overrides in globals.css.
        isActualWinner &&
          "bg-gray-500/40 text-[var(--color-text)] font-semibold cursor-default",
        isActualLoser &&
          "text-[var(--color-text-muted)] cursor-default line-through decoration-1",
        // Open states.
        !disabled && !isHypothetical && "cursor-pointer hover:bg-pitch-50/50",
        isHypothetical && "bg-pitch-50 font-semibold cursor-pointer",
      )}
    >
      <TeamFlag
        flagCode={team.flag_code}
        teamName={team.name}
        shortCode={team.short_code}
        size="16x12"
      />
      <span className="truncate min-w-0 text-2xs">{team.short_code}</span>
      {/*
        Trailing checkmark — sits on the right of the row via ml-auto.
        Two flavours:
          - Hypothetical (open, picked): green tick, matches the My Picks
            selected-pick treatment.
          - Actual winner (decided): white tick on the grey-tinted row, so
            the eye reads a definite "this team won" without the colour
            mixing with the green hypothetical hue used elsewhere.
      */}
      {isHypothetical && (
        <span className="ml-auto text-pitch-600 text-2xs">✓</span>
      )}
      {isActualWinner && (
        <span className="ml-auto text-white text-2xs">✓</span>
      )}
    </button>
  );
}
