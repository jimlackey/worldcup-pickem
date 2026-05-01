"use client";

import { useMemo } from "react";
import type { MatchWithTeams, Team, Pool } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";
import {
  CONSOLATION_FEEDERS,
  CONSOLATION_MATCH_NUMBER,
} from "@/lib/picks/bracket-wiring";

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

// Vertical rhythm for the one-sided (mobile) layout.
const SLOT_H = 40;
const ONE_SIDED_MIN_W = 440;

// ---- Desktop column width ----
//
// Every bracket block in the desktop two-sided layout is locked to this
// fixed width. With every block the same size, the bracket reads as a
// uniform grid rather than ragged columns of different widths driven by
// each round's longest country name.
//
// 90px is sized to comfortably hold a 13-char-truncated country name at
// text-2xs:
//   2px border + 4px slot padding + 16px flag + 2px gap +
//   ~65-70px text (13 chars × ~5px each at text-2xs)
//   ≈ 89px content
// — sat right at the edge but works because the inner text is `truncate`
// so any minor pixel overrun gets clipped via "..." rather than wrapping
// or breaking the layout.
//
// Total bracket width: 10 cols × 90 + 9 × 2px column gap (gap-x-0.5)
// ≈ 918px. Fits comfortably inside the app's max-w-5xl (~992px usable
// after px-4) on desktop without horizontal scroll.
const DESKTOP_COLUMN_W = 90;

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
  /**
   * The pool — needed so the view can decide whether to render the
   * consolation slot. Optional for backwards compatibility with callers
   * that haven't been threaded with the pool object yet (those callers
   * silently behave as if consolation is OFF, which is the safer default
   * for a read-only view).
   */
  pool?: Pick<Pool, "consolation_match_enabled">;
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
 * Consolation match: when the pool has it enabled, we render a single
 * pick slot directly below the FINAL block (desktop) or at the bottom of
 * the picks stack (mobile). It's not a champion's path — the bracket
 * looks the same with it on or off, just with one extra labeled slot
 * tucked under the final.
 */
export function PickSetBracketView({
  matches,
  teams,
  knockoutPicksMap,
  pool,
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
   * Note: this includes the consolation match. If a team loses the
   * consolation match they're "eliminated" in the technical sense — but
   * since nothing is downstream of consolation, that designation has no
   * downstream effect anyway.
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

  const ctx: SlotRenderContext = {
    matchByNumber,
    teamMap,
    knockoutPicksMap,
    eliminatedTeamIds,
    getR32MatchTeams,
  };

  // Whether to render the consolation slot. Defaults to false when no pool
  // is supplied so we don't surprise older callers.
  const showConsolation = !!pool?.consolation_match_enabled
    && matchByNumber.has(CONSOLATION_MATCH_NUMBER);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-display font-bold">Knockout Bracket</h2>

      {/* Desktop: two-sided bracket. Hidden below md. */}
      <div className="hidden md:block">
        <TwoSidedBracket ctx={ctx} showConsolation={showConsolation} />
      </div>

      {/* Mobile: single-sided bracket. Shown below md. */}
      <div className="md:hidden">
        <OneSidedBracket ctx={ctx} showConsolation={showConsolation} />
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
// 10-column CSS grid. Every column is locked to DESKTOP_COLUMN_W (90px)
// via an inline gridTemplateColumns. The center FINAL block spans 2 of
// those columns (180px wide) so the two SF cards each land in a
// regular-column-width slot, with the Final pick centered underneath at
// half-block-width (= 1 column = 90px).
//
// Why fixed-width instead of `1fr`:
//   - Earlier versions used `grid-cols-10` (= repeat(10, 1fr)) inside
//     `min-w-[960px]`. That made every column the SAME width as every
//     other column, but the width was driven by the bracket's overall
//     min-width — long-name picks like "Bosnia and..." landed inside an
//     ~96px column with little trailing whitespace, while QF columns
//     holding shorter picks like "Iraq" or "Egypt" had identical
//     ~96px width but with 30+ pixels of trailing whitespace inside
//     each card. Locking the column to exactly the worst-case label's
//     width drops that wasted space — the bracket as a whole shrinks to
//     ~918px and every card sizes to its label without overflow.
// ----------------------------------------------------------------------------

function TwoSidedBracket({
  ctx,
  showConsolation,
}: {
  ctx: SlotRenderContext;
  showConsolation: boolean;
}) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-4">
      <div
        className="grid gap-x-0.5 items-center"
        style={{
          gridTemplateColumns: `repeat(10, ${DESKTOP_COLUMN_W}px)`,
          minHeight: 400,
        }}
      >
        {/* Col 1: Left R32 matchups (8) — plain home vs away cards */}
        <MatchupColumn matchNumbers={LEFT_R32} ctx={ctx} compact />

        {/* Col 2: Left R32 picks (8) — one picked country per match */}
        <PickColumn matchNumbers={LEFT_R32} ctx={ctx} compact />

        {/* Col 3: Left R16 picks (4) */}
        <PickColumn matchNumbers={LEFT_R16} ctx={ctx} compact />

        {/* Col 4: Left QF picks (2) */}
        <PickColumn matchNumbers={LEFT_QF} ctx={ctx} />

        {/* Cols 5–6: Center — FINAL block and (optionally) the Consolation
            pick stacked beneath. Takes 2 grid tracks so each SF card has
            the same width as a regular pick column. */}
        <FinalsCenterBlock ctx={ctx} showConsolation={showConsolation} />

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
 * Center block for the Final area, with the optional Consolation match
 * tucked underneath. Structure:
 *
 *       FINAL
 *   [ LSF ] [ RSF ]   ← side by side, each same width as a wing column
 *     [ Final pick ]  ← centered under the pair, SF-card-width
 *
 *     CONSOLATION     ← only when the pool has it enabled
 *   [ Consolation pick ]
 *
 * The consolation pick is rendered as a standard PickSlot for the
 * consolation match. The match exists in matchByNumber if and only if
 * the pool has it enabled (we filter upstream).
 *
 * The block spans 2 grid columns (col-span-2 = 180px at COLUMN_W=90).
 * The two SF cards live in an inner 2-col grid so each lands in a
 * 90px slot — exactly one wing-column-width — and the Final and
 * Consolation picks are constrained to `w-1/2` (= 90px, again one
 * wing-column-width) and centered, so they visually straddle the gap
 * between the two SF cards.
 */
function FinalsCenterBlock({
  ctx,
  showConsolation,
}: {
  ctx: SlotRenderContext;
  showConsolation: boolean;
}) {
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

      {showConsolation && (
        <div className="mt-3">
          <div className="text-center text-xs font-bold text-[var(--color-text-muted)] mb-1">
            CONSOLATION
          </div>
          <div className="flex justify-center">
            <div className="w-1/2">
              <PickSlot
                matchNumber={CONSOLATION_MATCH_NUMBER}
                ctx={ctx}
                compact
              />
            </div>
          </div>
        </div>
      )}
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
// Same conceptual column sequence as desktop, laid out one-sided top to
// bottom. The fixed-column-width treatment used on desktop doesn't apply
// here — mobile renders 3-letter short codes (~22px text) instead of
// truncated full names, so the cards naturally hug their content via
// flex-1 sharing the bracket's modest min-width budget.
// ----------------------------------------------------------------------------

function OneSidedBracket({
  ctx,
  showConsolation,
}: {
  ctx: SlotRenderContext;
  showConsolation: boolean;
}) {
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

      {/* Consolation as a small standalone block underneath the bracket
          on mobile. The doubling-height-per-round trick that drives the
          rest of the layout doesn't help here — the consolation slot
          isn't fed by the previous column, it's a sibling to the Final
          fed by SF losers. So we just label and lay it out flat. */}
      {showConsolation && (
        <div className="mt-3 flex flex-col items-center">
          <div className="text-2xs font-bold text-[var(--color-text-muted)] mb-1">
            CONSOLATION
          </div>
          <div style={{ minWidth: 140 }} className="max-w-[180px] w-full">
            <PickSlot
              matchNumber={CONSOLATION_MATCH_NUMBER}
              ctx={ctx}
              compact
            />
          </div>
        </div>
      )}
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
 * Used for every pick on the bracket including the Final and the
 * consolation slot. There's no special "Final" or "Consolation" variant —
 * the pick rules are identical regardless of which match the slot belongs
 * to.
 *
 * Special note for the consolation slot: a "wrong" pick can fire even
 * before #104 is decided, if the picked team didn't end up being a
 * semifinal loser. eliminatedTeamIds catches part of that — if Spain wins
 * the Final, they're not in eliminatedTeamIds at all and a consolation
 * pick on Spain stays neutral until the consolation match is graded. The
 * server-side is_correct = false grading after the match completes is the
 * authoritative signal in that edge case.
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

  // Wrong status:
  //   (a) match decided and the pick didn't win, OR
  //   (b) match undecided but the picked team is eliminated.
  // For the consolation slot specifically, a team being "eliminated" is
  // what makes them eligible to play in the consolation match — so we
  // suppress (b) for #104 to avoid showing the row red just because the
  // picked team lost their semi (which is, in fact, why they're playing
  // in the consolation).
  const isConsolation = matchNumber === CONSOLATION_MATCH_NUMBER;
  const eliminatedNow =
    !!pickedTeamId && eliminatedTeamIds.has(pickedTeamId) && !isConsolation;

  const isWrong =
    isCorrect === false || (isCorrect === null && eliminatedNow);
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
      className={cn(
        "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] w-full overflow-hidden",
        rowStyle
      )}
    >
      <div
        className={cn(
          "w-full flex items-center gap-0.5 px-0.5",
          compact ? "py-0.5" : "py-1",
          !pickedTeam && "opacity-50"
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
