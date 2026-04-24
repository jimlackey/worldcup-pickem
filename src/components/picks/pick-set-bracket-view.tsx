"use client";

import { useMemo } from "react";
import type { MatchWithTeams, Team } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

// Bracket wiring: which matches feed into which next match.
// Key = match_number of the later match, value = [feederA_match_number, feederB_match_number]
// The winner of feederA takes the home slot, winner of feederB takes the away slot.
// R32 (73–88) → R16 (89–96) → QF (97–100) → SF (101–102) → Final (103)
const BRACKET_FEEDERS: Record<number, [number, number]> = {
  89: [73, 74], 90: [75, 76], 91: [77, 78], 92: [79, 80],
  93: [81, 82], 94: [83, 84], 95: [85, 86], 96: [87, 88],
  97: [89, 90], 98: [91, 92], 99: [93, 94], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  103: [101, 102],
};

// Two-sided bracket order (desktop). Final sits in the centre column with
// left SF / QF / R16 / R32 fanning out to its left, right SF / QF / R16 / R32
// fanning out to its right. Using the standard first-half / second-half split.
const LEFT_R32 = [73, 74, 75, 76, 77, 78, 79, 80];
const RIGHT_R32 = [81, 82, 83, 84, 85, 86, 87, 88];
const LEFT_R16 = [89, 90, 91, 92];
const RIGHT_R16 = [93, 94, 95, 96];
const LEFT_QF = [97, 98];
const RIGHT_QF = [99, 100];
const LEFT_SF = [101];
const RIGHT_SF = [102];
const FINAL = [103];

// One-sided bracket order (mobile). All 16 R32 matches stack top-to-bottom,
// later rounds scale up in height to align to the midpoint of their feeders.
// Mirrors the what-if bracket picker's layout.
const ONE_SIDED_R32 = [...LEFT_R32, ...RIGHT_R32];
const ONE_SIDED_R16 = [...LEFT_R16, ...RIGHT_R16];
const ONE_SIDED_QF = [...LEFT_QF, ...RIGHT_QF];
const ONE_SIDED_SF = [...LEFT_SF, ...RIGHT_SF];

// Vertical rhythm for the one-sided layout.
const SLOT_H = 40;
const BRACKET_H = SLOT_H * 16;
const ONE_SIDED_MIN_W = 360;

interface PickSetBracketViewProps {
  matches: MatchWithTeams[];
  teams: Team[];
  /** The pick set's knockout picks, keyed by match_id → picked_team_id. */
  knockoutPicksMap: Record<
    string,
    { picked_team_id: string; is_correct: boolean | null }
  >;
}

/**
 * Read-only bracket visualisation of a player's knockout picks.
 *
 * Desktop (md+):  two-sided bracket, 16 R32 matches on each side, Final in the middle.
 * Mobile (< md):  one-sided bracket, all 32 R32 slots stacked top-to-bottom.
 *
 * Per-match display rules:
 *   - Each slot shows both competing teams (admin-assigned for R32, derived
 *     from the player's picks for later rounds).
 *   - The team the player PICKED is highlighted.
 *   - If the match is completed, the picked team is tinted green if the pick
 *     was correct and red if incorrect (mirroring the What-If bracket view).
 *   - If the match is completed and the player didn't pick, we still show the
 *     actual winner as the "decided" team in neutral green so downstream
 *     slots read correctly.
 */
export function PickSetBracketView({
  matches,
  teams,
  knockoutPicksMap,
}: PickSetBracketViewProps) {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const matchByNumber = useMemo(() => {
    const m = new Map<number, MatchWithTeams>();
    for (const match of matches) {
      if (match.match_number != null) m.set(match.match_number, match);
    }
    return m;
  }, [matches]);

  /**
   * Resolve the effective home/away teams for a bracket slot.
   * Priority per side:
   *   1. Actual completed feeder → real winner  (ground truth)
   *   2. Admin-assigned team (for R32 first round)
   *   3. Player's pick on the feeder match      (cascades hypothetical picks)
   */
  const getMatchTeams = (
    matchNumber: number
  ): { home: Team | null; away: Team | null } => {
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
    const resolveSide = (fn: number): Team | null => {
      const feeder = matchByNumber.get(fn);
      if (!feeder) return null;

      // Admin directly set teams on this match (unusual for later rounds,
      // but handle it anyway).
      //
      // For later rounds we prefer: actual winner → player's pick.
      if (feeder.status === "completed" && feeder.result) {
        const winnerId =
          feeder.result === "home" ? feeder.home_team_id : feeder.away_team_id;
        return winnerId ? teamMap.get(winnerId) ?? null : null;
      }

      const picked = knockoutPicksMap[feeder.id]?.picked_team_id;
      return picked ? teamMap.get(picked) ?? null : null;
    };

    return { home: resolveSide(feederA), away: resolveSide(feederB) };
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-display font-bold">Knockout Bracket</h2>

      {/* Desktop: two-sided bracket. Hidden below md. */}
      <div className="hidden md:block">
        <TwoSidedBracket
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />
      </div>

      {/* Mobile: single-sided bracket. Shown below md. */}
      <div className="md:hidden">
        <OneSidedBracket
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Desktop: two-sided bracket (16 left / 16 right, Final in middle)
// ----------------------------------------------------------------------------

function TwoSidedBracket({
  matchByNumber,
  getMatchTeams,
  knockoutPicksMap,
}: {
  matchByNumber: Map<number, MatchWithTeams>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  knockoutPicksMap: PickSetBracketViewProps["knockoutPicksMap"];
}) {
  return (
    // overflow-x-auto provides a horizontal scroll safety net on just-under-md
    // viewports where the 9-column grid still doesn't fit comfortably.
    <div className="overflow-x-auto -mx-4 px-4 pb-4">
      <div
        className="min-w-[900px] grid grid-cols-9 gap-x-1 items-center"
        style={{ minHeight: 720 }}
      >
        {/* Col 1: Left R32 (8) */}
        <BracketColumn
          matchNumbers={LEFT_R32}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
          compact
        />

        {/* Col 2: Left R16 (4) */}
        <BracketColumn
          matchNumbers={LEFT_R16}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
          compact
        />

        {/* Col 3: Left QF (2) */}
        <BracketColumn
          matchNumbers={LEFT_QF}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />

        {/* Col 4: Left SF (1) */}
        <BracketColumn
          matchNumbers={LEFT_SF}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />

        {/* Col 5: Final (center) */}
        <div className="flex flex-col justify-center h-full">
          <div className="text-center text-xs font-bold text-[var(--color-text-muted)] mb-2">
            FINAL
          </div>
          {FINAL.map((mn) => (
            <BracketSlot
              key={mn}
              matchNumber={mn}
              matchByNumber={matchByNumber}
              getMatchTeams={getMatchTeams}
              knockoutPicksMap={knockoutPicksMap}
              isFinal
            />
          ))}
        </div>

        {/* Col 6: Right SF (1) */}
        <BracketColumn
          matchNumbers={RIGHT_SF}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />

        {/* Col 7: Right QF (2) */}
        <BracketColumn
          matchNumbers={RIGHT_QF}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />

        {/* Col 8: Right R16 (4) */}
        <BracketColumn
          matchNumbers={RIGHT_R16}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
          compact
        />

        {/* Col 9: Right R32 (8) */}
        <BracketColumn
          matchNumbers={RIGHT_R32}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
          compact
        />
      </div>
    </div>
  );
}

function BracketColumn({
  matchNumbers,
  matchByNumber,
  getMatchTeams,
  knockoutPicksMap,
  compact,
}: {
  matchNumbers: number[];
  matchByNumber: Map<number, MatchWithTeams>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  knockoutPicksMap: PickSetBracketViewProps["knockoutPicksMap"];
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col justify-around h-full gap-1">
      {matchNumbers.map((mn) => (
        <BracketSlot
          key={mn}
          matchNumber={mn}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
          compact={compact}
        />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Mobile: one-sided bracket (32 R32 stacked, later rounds scale up vertically)
// ----------------------------------------------------------------------------

function OneSidedBracket({
  matchByNumber,
  getMatchTeams,
  knockoutPicksMap,
}: {
  matchByNumber: Map<number, MatchWithTeams>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  knockoutPicksMap: PickSetBracketViewProps["knockoutPicksMap"];
}) {
  // BRACKET_H is based on 16 R32 slots; for a one-sided layout with all 32
  // slots we double it so each R32 still gets SLOT_H vertical space.
  const height = SLOT_H * ONE_SIDED_R32.length;

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2">
      <div
        className="flex items-stretch"
        style={{ height, minWidth: ONE_SIDED_MIN_W }}
      >
        <OneSidedColumn
          matchNumbers={ONE_SIDED_R32}
          slotHeight={SLOT_H}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />
        <OneSidedColumn
          matchNumbers={ONE_SIDED_R16}
          slotHeight={SLOT_H * 2}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />
        <OneSidedColumn
          matchNumbers={ONE_SIDED_QF}
          slotHeight={SLOT_H * 4}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />
        <OneSidedColumn
          matchNumbers={ONE_SIDED_SF}
          slotHeight={SLOT_H * 8}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
        />
        <OneSidedColumn
          matchNumbers={FINAL}
          slotHeight={SLOT_H * 16}
          matchByNumber={matchByNumber}
          getMatchTeams={getMatchTeams}
          knockoutPicksMap={knockoutPicksMap}
          isFinal
        />
      </div>
    </div>
  );
}

function OneSidedColumn({
  matchNumbers,
  slotHeight,
  matchByNumber,
  getMatchTeams,
  knockoutPicksMap,
  isFinal,
}: {
  matchNumbers: number[];
  slotHeight: number;
  matchByNumber: Map<number, MatchWithTeams>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  knockoutPicksMap: PickSetBracketViewProps["knockoutPicksMap"];
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
          <BracketSlot
            matchNumber={mn}
            matchByNumber={matchByNumber}
            getMatchTeams={getMatchTeams}
            knockoutPicksMap={knockoutPicksMap}
            compact
            isFinal={isFinal}
          />
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Individual bracket slot
// ----------------------------------------------------------------------------

function BracketSlot({
  matchNumber,
  matchByNumber,
  getMatchTeams,
  knockoutPicksMap,
  compact,
  isFinal,
}: {
  matchNumber: number;
  matchByNumber: Map<number, MatchWithTeams>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  knockoutPicksMap: PickSetBracketViewProps["knockoutPicksMap"];
  compact?: boolean;
  isFinal?: boolean;
}) {
  const match = matchByNumber.get(matchNumber);
  if (!match) return <div className="h-16" />;

  const { home, away } = getMatchTeams(matchNumber);

  const isDecided = match.status === "completed" && !!match.result;
  const actualWinnerId = isDecided
    ? match.result === "home"
      ? match.home_team_id
      : match.away_team_id
    : null;

  const pickData = knockoutPicksMap[match.id];
  const pickedTeamId = pickData?.picked_team_id ?? null;
  const isPickCorrect = pickData?.is_correct ?? null;

  return (
    <div
      className={cn(
        // The outer card holds two team rows. Individual-row "pick" rings
        // use ring-inset so they sit inside each row's padding and read
        // as a highlighted pill around the picked team.
        "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden w-full",
        isFinal && "ring-1 ring-gold-300"
      )}
    >
      {[
        { team: home, slot: "home" as const },
        { team: away, slot: "away" as const },
      ].map(({ team, slot }, i) => {
        const isPicked = !!team && team.id === pickedTeamId;
        const isActualWinner = !!team && team.id === actualWinnerId;

        // ------- Visual model -------
        // The picked team always gets a colored ring around its row — this
        // is the primary "this is what the player picked" signal. The ring
        // color encodes correctness once the match is decided:
        //   - undecided → gold/yellow (TBD)
        //   - correct   → green
        //   - wrong     → red
        //
        // The actual winner (when decided) gets a subtle background tint
        // but no ring, so it doesn't compete with the pick ring.
        //
        // Losing teams that weren't picked fade out.
        let rowStyle = "";
        let ringStyle = "";

        if (isPicked) {
          // Ring indicates pick + correctness
          if (isDecided && isPickCorrect === true) {
            ringStyle = "ring-2 ring-inset ring-correct bg-correct/10 text-correct font-semibold";
          } else if (isDecided && isPickCorrect === false) {
            ringStyle =
              "ring-2 ring-inset ring-incorrect bg-incorrect/10 text-incorrect font-semibold";
          } else {
            // Undecided pick — yellow/gold ring, "this is my pick, TBD"
            ringStyle = "ring-2 ring-inset ring-gold-400 bg-gold-100/40 text-gold-700 font-semibold";
          }
        } else if (isDecided && isActualWinner) {
          // Player didn't pick this slot, but this team won — subtle green
          // fill keeps the bracket readable downstream without stealing
          // attention from the pick ring.
          rowStyle = "bg-pitch-500/10 text-pitch-600";
        } else if (isDecided && team && !isActualWinner) {
          // Eliminated team, not picked — fade + strikethrough
          rowStyle = "text-[var(--color-text-muted)] line-through decoration-1";
        }

        return (
          <div
            key={slot}
            className={cn(
              "w-full flex items-center gap-1 px-1 relative",
              compact ? "py-0.5" : "py-1",
              i === 0 && "border-b border-[var(--color-border)]",
              // Tiny rounding on the picked row so the ring actually
              // reads as a "circle" (pill) around the team, not as a
              // square box flush with the card edges. The inset ring
              // sits just inside this radius.
              isPicked && "rounded-sm",
              !team && "opacity-40",
              ringStyle || rowStyle
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
          </div>
        );
      })}
    </div>
  );
}
