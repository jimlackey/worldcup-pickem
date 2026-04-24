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
const ONE_SIDED_MIN_W = 440;

/**
 * Desktop label for a team — returns the full country name if it's 13 chars
 * or fewer, otherwise the first 10 chars followed by an ellipsis (so the
 * maximum rendered length is 13). Kept short enough to fit inside a bracket
 * column without wrapping while still being much more readable than the
 * 3-letter short code we use on mobile.
 */
function truncateTeamName(name: string): string {
  if (name.length <= 13) return name;
  return name.slice(0, 10) + "...";
}

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
 * Desktop (md+):  two-sided bracket, left/right fanning out around a central
 *                 Final. Each side columns, outer-to-inner:
 *                   R32 matchups → R32 picks → R16 picks → QF picks → SF pick
 *                 so every round of picks sits in its own column. The R32
 *                 matchups column is the only one that shows two teams —
 *                 it's a reference to who was admin-assigned to play.
 * Mobile (< md):  same column sequence, laid out one-sided, top to bottom.
 *
 * Per-column display rules:
 *
 * R32 matchups (match numbers 73–88) are NOT picks — they're admin-assigned
 *   matchups. We render them as plain, two-row cards (home vs away) with no
 *   coloring, no ring, no correctness semantics. They exist as a neutral
 *   reference so readers can trace where picked teams entered the bracket.
 *
 * ALL pick columns (R32 pick, R16 pick, QF pick, SF pick, Final pick) show
 *   the ONE country the player picked for that match, regardless of whether
 *   that team actually ended up in the match. Coloring is driven purely by
 *   pick status:
 *
 *     - Correct pick (the pick won the match) → green ring + green fill
 *     - Wrong pick (either the pick lost this match, or their country has
 *       been eliminated in an earlier completed match) → red ring + red fill
 *     - Pending (match not decided, picked country still alive) → neutral
 *     - No pick at all on this match → faded "No pick" placeholder
 *
 * The view is about the player's picks and whether they're still viable,
 * not about who won which match.
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
   * Teams that have been eliminated in ANY completed knockout match.
   * A team is eliminated if it was the losing side of a completed knockout
   * match — i.e. the match's home/away_team_id that wasn't the winner.
   *
   * This drives the "turn the pick red even before this match is decided"
   * rule: if a player picked Spain to win the Final but Spain lost in R32,
   * every downstream slot picking Spain should show red immediately, not
   * wait for each future match to be played before turning red.
   *
   * We only walk knockout matches (phase !== "group") so group-phase
   * results never elbow into knockout eliminations.
   */
  const eliminatedTeamIds = useMemo(() => {
    const eliminated = new Set<string>();
    for (const m of matches) {
      if (m.phase === "group") continue;
      if (m.status !== "completed" || !m.result) continue;
      const loserId =
        m.result === "home" ? m.away_team_id : m.home_team_id;
      if (loserId) eliminated.add(loserId);
    }
    return eliminated;
  }, [matches]);

  /**
   * Resolve the admin-assigned home/away teams for an R32 match. Only used
   * by the R32 matchup column — pick columns render a single picked country
   * and don't need home/away resolution.
   */
  const getR32MatchTeams = (
    matchNumber: number
  ): { home: Team | null; away: Team | null } => {
    const match = matchByNumber.get(matchNumber);
    if (!match) return { home: null, away: null };
    const home = match.home_team_id
      ? teamMap.get(match.home_team_id) ?? null
      : null;
    const away = match.away_team_id
      ? teamMap.get(match.away_team_id) ?? null
      : null;
    return { home, away };
  };

  // Shared render context for leaf slots. Passing this instead of a long
  // parameter list keeps the tree of bracket/column/slot components from
  // turning into prop-drilling soup.
  const ctx: SlotRenderContext = {
    matchByNumber,
    teamMap,
    knockoutPicksMap,
    eliminatedTeamIds,
    getR32MatchTeams,
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-display font-bold">Knockout Bracket</h2>

      {/* Desktop: two-sided bracket. Hidden below md. */}
      <div className="hidden md:block">
        <TwoSidedBracket ctx={ctx} />
      </div>

      {/* Mobile: single-sided bracket. Shown below md. */}
      <div className="md:hidden">
        <OneSidedBracket ctx={ctx} />
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Shared render context
// ----------------------------------------------------------------------------

interface SlotRenderContext {
  matchByNumber: Map<number, MatchWithTeams>;
  teamMap: Map<string, Team>;
  knockoutPicksMap: PickSetBracketViewProps["knockoutPicksMap"];
  eliminatedTeamIds: Set<string>;
  getR32MatchTeams: (mn: number) => { home: Team | null; away: Team | null };
}

// ----------------------------------------------------------------------------
// Desktop: two-sided bracket
// ----------------------------------------------------------------------------
//
// Column layout (11 columns total). The R32-matchup columns are the "outer
// ring" and only appear once per side. Every other column is a picks column
// showing a single picked country per slot.
//
//   [Left R32 matchup] [Left R32 pick] [Left R16] [Left QF] [Left SF]
//   [Final]
//   [Right SF] [Right QF] [Right R16] [Right R32 pick] [Right R32 matchup]
//
// This mirrors the mental model the user asked for: starting from 4 teams
// (top 2 R32 matchups), you reduce to 2 picks (R32 column), then to 1 pick
// (R16 column).
// ----------------------------------------------------------------------------

function TwoSidedBracket({ ctx }: { ctx: SlotRenderContext }) {
  return (
    // overflow-x-auto stays as a safety net for narrow-md viewports, but the
    // grid is now sized to fit inside the app's max-w-5xl container (≈992px
    // of usable content width after the outer layout's px-4) so it won't
    // trigger a scrollbar at typical desktop widths. min-w-[960px] is a
    // conservative floor: tight column-gap + tight slot padding below keep
    // the whole bracket comfortably inside that budget.
    //
    // Grid uses 10 tracks: 8 "wing" columns (4 on each side, R32-matchup →
    // R32-pick → R16 → QF) plus a 2-track-wide center block that holds
    // the two SF picks side-by-side with the Final pick centered below.
    // The center block is rendered as a single cell with `col-span-2` so
    // it gets two columns' worth of width without disturbing the rest of
    // the grid's 1fr tracking.
    //
    // minHeight dropped from 720 → 400: slots were floating in a lot of
    // whitespace because `justify-around` was distributing small cards
    // across an oversized column. 400px still leaves enough room between
    // R32 pairs for the pairing to read visually, without the empty-feeling
    // gaps the old 720px produced.
    <div className="overflow-x-auto -mx-4 px-4 pb-4">
      <div
        className="min-w-[960px] grid grid-cols-10 gap-x-0.5 items-center"
        style={{ minHeight: 400 }}
      >
        {/* Col 1: Left R32 matchups (8) — plain home vs away cards */}
        <MatchupColumn matchNumbers={LEFT_R32} ctx={ctx} compact />

        {/* Col 2: Left R32 picks (8) — one picked country per match */}
        <PickColumn matchNumbers={LEFT_R32} ctx={ctx} compact />

        {/* Col 3: Left R16 picks (4) */}
        <PickColumn matchNumbers={LEFT_R16} ctx={ctx} compact />

        {/* Col 4: Left QF picks (2) */}
        <PickColumn matchNumbers={LEFT_QF} ctx={ctx} />

        {/* Cols 5–6: Center — FINAL label on top, the two SF picks side by
            side below it (as the "two opponents" in the Final), and the
            Final pick centered underneath. Takes 2 grid tracks so each SF
            card has the same width as a regular pick column. */}
        <FinalsCenterBlock ctx={ctx} />

        {/* Col 7: Right QF picks (2) */}
        <PickColumn matchNumbers={RIGHT_QF} ctx={ctx} />

        {/* Col 8: Right R16 picks (4) */}
        <PickColumn matchNumbers={RIGHT_R16} ctx={ctx} compact />

        {/* Col 9: Right R32 picks (8) */}
        <PickColumn matchNumbers={RIGHT_R32} ctx={ctx} compact />

        {/* Col 10: Right R32 matchups (8) */}
        <MatchupColumn matchNumbers={RIGHT_R32} ctx={ctx} compact />
      </div>
    </div>
  );
}

/**
 * Center block for the Final area. Structure:
 *
 *       FINAL
 *   [ LSF ] [ RSF ]   ← side by side, each same width as a wing column
 *     [ Final pick ]  ← centered under the pair, SF-card-width
 *
 * Spans 2 grid columns so the two SF cards each land in a wing-column-
 * width slot. The Final pick is constrained to 1/2 the block width (so
 * roughly one wing column) and centered, which makes it visually straddle
 * the gap between the two SF cards.
 */
function FinalsCenterBlock({ ctx }: { ctx: SlotRenderContext }) {
  return (
    <div className="col-span-2 flex flex-col justify-center items-stretch h-full gap-1">
      <div className="text-center text-xs font-bold text-[var(--color-text-muted)]">
        FINAL
      </div>
      <div className="grid grid-cols-2 gap-x-0.5">
        <PickSlot matchNumber={LEFT_SF[0]} ctx={ctx} compact />
        <PickSlot matchNumber={RIGHT_SF[0]} ctx={ctx} compact />
      </div>
      <div className="flex justify-center">
        <div className="w-1/2">
          {FINAL.map((mn) => (
            <PickSlot key={mn} matchNumber={mn} ctx={ctx} compact />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Column of matchup cards (two-row, home vs away). Only used for R32 —
 * every other column is a picks column.
 */
function MatchupColumn({
  matchNumbers,
  ctx,
  compact,
}: {
  matchNumbers: number[];
  ctx: SlotRenderContext;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col justify-around h-full gap-1">
      {matchNumbers.map((mn) => (
        <MatchupSlot
          key={mn}
          matchNumber={mn}
          ctx={ctx}
          compact={compact}
        />
      ))}
    </div>
  );
}

/**
 * Column of single-country pick cards.
 */
function PickColumn({
  matchNumbers,
  ctx,
  compact,
}: {
  matchNumbers: number[];
  ctx: SlotRenderContext;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col justify-around h-full gap-1">
      {matchNumbers.map((mn) => (
        <PickSlot key={mn} matchNumber={mn} ctx={ctx} compact={compact} />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Mobile: one-sided bracket
// ----------------------------------------------------------------------------
//
// Same conceptual column sequence as desktop, but one-sided:
//   R32 matchups (16, full height) → R32 picks (16) → R16 picks (8) →
//   QF picks (4) → SF picks (2) → Final pick (1)
// ----------------------------------------------------------------------------

function OneSidedBracket({ ctx }: { ctx: SlotRenderContext }) {
  const height = SLOT_H * ONE_SIDED_R32.length;

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2">
      <div
        className="flex items-stretch"
        style={{ height, minWidth: ONE_SIDED_MIN_W }}
      >
        <OneSidedMatchupColumn
          matchNumbers={ONE_SIDED_R32}
          slotHeight={SLOT_H}
          ctx={ctx}
        />
        <OneSidedPickColumn
          matchNumbers={ONE_SIDED_R32}
          slotHeight={SLOT_H}
          ctx={ctx}
        />
        <OneSidedPickColumn
          matchNumbers={ONE_SIDED_R16}
          slotHeight={SLOT_H * 2}
          ctx={ctx}
        />
        <OneSidedPickColumn
          matchNumbers={ONE_SIDED_QF}
          slotHeight={SLOT_H * 4}
          ctx={ctx}
        />
        <OneSidedPickColumn
          matchNumbers={ONE_SIDED_SF}
          slotHeight={SLOT_H * 8}
          ctx={ctx}
        />
        <OneSidedPickColumn
          matchNumbers={FINAL}
          slotHeight={SLOT_H * 16}
          ctx={ctx}
        />
      </div>
    </div>
  );
}

function OneSidedMatchupColumn({
  matchNumbers,
  slotHeight,
  ctx,
}: {
  matchNumbers: number[];
  slotHeight: number;
  ctx: SlotRenderContext;
}) {
  return (
    <div className="flex flex-col flex-1 min-w-0 px-0.5">
      {matchNumbers.map((mn) => (
        <div
          key={mn}
          className="flex items-center justify-center"
          style={{ height: slotHeight }}
        >
          <MatchupSlot matchNumber={mn} ctx={ctx} compact />
        </div>
      ))}
    </div>
  );
}

function OneSidedPickColumn({
  matchNumbers,
  slotHeight,
  ctx,
}: {
  matchNumbers: number[];
  slotHeight: number;
  ctx: SlotRenderContext;
}) {
  return (
    <div className="flex flex-col flex-1 min-w-0 px-0.5">
      {matchNumbers.map((mn) => (
        <div
          key={mn}
          className="flex items-center justify-center"
          style={{ height: slotHeight }}
        >
          <PickSlot matchNumber={mn} ctx={ctx} compact />
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Individual slots
// ----------------------------------------------------------------------------

/**
 * R32 matchup — plain two-row card with home/away teams, no color, no ring.
 * Purely a reference to who is admin-assigned to play in this match.
 */
function MatchupSlot({
  matchNumber,
  ctx,
  compact,
}: {
  matchNumber: number;
  ctx: SlotRenderContext;
  compact?: boolean;
}) {
  const match = ctx.matchByNumber.get(matchNumber);
  if (!match) return <div className="h-16" />;

  const { home, away } = ctx.getR32MatchTeams(matchNumber);

  return (
    <div
      className={cn(
        "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden w-full"
      )}
    >
      {[
        { team: home, slot: "home" as const },
        { team: away, slot: "away" as const },
      ].map(({ team, slot }, i) => (
        <div
          key={slot}
          className={cn(
            "w-full flex items-center gap-0.5 px-0.5",
            compact ? "py-0.5" : "py-1",
            i === 0 && "border-b border-[var(--color-border)]",
            !team && "opacity-40"
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
              <span className="text-2xs truncate md:hidden">
                {team.short_code}
              </span>
              <span className="text-2xs truncate hidden md:inline">
                {truncateTeamName(team.name)}
              </span>
            </>
          ) : (
            <span className="text-2xs italic text-[var(--color-text-muted)]">
              TBD
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Pick slot — single-row card showing the country the player picked for
 * this match, colored by pick status:
 *
 *   correct (is_correct === true) → green
 *   wrong   (is_correct === false, OR picked team already eliminated) → red
 *   pending (undecided, still viable) → neutral
 *   no pick → faded "No pick" placeholder
 *
 * Used for every pick on the bracket, including the Final. There's no
 * special "Final" variant — the championship pick follows the same rules
 * as any other pick.
 */
function PickSlot({
  matchNumber,
  ctx,
  compact,
}: {
  matchNumber: number;
  ctx: SlotRenderContext;
  compact?: boolean;
}) {
  const { matchByNumber, teamMap, knockoutPicksMap, eliminatedTeamIds } = ctx;
  const match = matchByNumber.get(matchNumber);
  if (!match) return <div className="h-8" />;

  const pickData = knockoutPicksMap[match.id];
  const pickedTeamId = pickData?.picked_team_id ?? null;
  const pickedTeam = pickedTeamId ? teamMap.get(pickedTeamId) ?? null : null;
  const isCorrect = pickData?.is_correct ?? null;

  // Wrong status is either:
  //   (a) the match is decided and the pick didn't win (is_correct === false), OR
  //   (b) the match isn't decided yet, but the picked country lost an
  //       earlier completed knockout match (team in eliminatedTeamIds).
  // is_correct === false already covers the case where the pick was for a
  // team that wasn't even in the match — because server-side grading checks
  // picked_team_id against the winner, and any other id becomes false.
  const isWrong =
    isCorrect === false ||
    (isCorrect === null &&
      !!pickedTeamId &&
      eliminatedTeamIds.has(pickedTeamId));

  // Correct is only ever the decided-and-right case.
  const isRight = isCorrect === true;

  let rowStyle = "";
  if (pickedTeam) {
    if (isRight) {
      rowStyle =
        "ring-2 ring-inset ring-correct bg-correct/10 text-correct font-semibold";
    } else if (isWrong) {
      rowStyle =
        "ring-2 ring-inset ring-incorrect bg-incorrect/10 text-incorrect font-semibold";
    }
    // else: still viable — leave neutral.
  }

  return (
    <div
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden w-full"
    >
      <div
        className={cn(
          "w-full flex items-center gap-0.5 px-0.5",
          compact ? "py-0.5" : "py-1",
          !pickedTeam && "opacity-60",
          rowStyle
        )}
      >
        {pickedTeam ? (
          <>
            <TeamFlag
              flagCode={pickedTeam.flag_code}
              teamName={pickedTeam.name}
              shortCode={pickedTeam.short_code}
              size="16x12"
            />
            <span className="text-2xs truncate md:hidden">
              {pickedTeam.short_code}
            </span>
            <span className="text-2xs truncate hidden md:inline">
              {truncateTeamName(pickedTeam.name)}
            </span>
          </>
        ) : (
          <span className="text-2xs italic text-[var(--color-text-muted)]">
            No pick
          </span>
        )}
      </div>
    </div>
  );
}
