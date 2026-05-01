"use client";

import { useActionState, useState, useCallback, useMemo } from "react";
import { submitKnockoutPicksAction } from "../../actions";
import type { PickActionResult } from "../../actions";
import type { MatchWithTeams, Team, Pool } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

interface BracketPickerProps {
  matches: MatchWithTeams[];
  teams: Team[];
  existingPicks: Record<string, string>;
  pickSetId: string;
  pool: Pool;
  isLocked: boolean;
}

// Bracket wiring: which matches feed into which next match.
// Key = match_number of the later match, value = [feederA_match_number, feederB_match_number]
// The winner of feederA goes to home slot, winner of feederB goes to away slot.
// R32 (73-88) → R16 (89-96) → QF (97-100) → SF (101-102) → Final (103)
const BRACKET_FEEDERS: Record<number, [number, number]> = {
  // R16 fed by R32 pairs
  89: [73, 74], 90: [75, 76], 91: [77, 78], 92: [79, 80],
  93: [81, 82], 94: [83, 84], 95: [85, 86], 96: [87, 88],
  // QF fed by R16 pairs
  97: [89, 90], 98: [91, 92], 99: [93, 94], 100: [95, 96],
  // SF fed by QF pairs
  101: [97, 98], 102: [99, 100],
  // Final fed by SF
  103: [101, 102],
};

// Two-sided bracket order (desktop, md+). Standard March-Madness split:
// left half / right half, with the Final in the centre.
const LEFT_R32 = [73, 74, 75, 76, 77, 78, 79, 80];
const RIGHT_R32 = [81, 82, 83, 84, 85, 86, 87, 88];
const LEFT_R16 = [89, 90, 91, 92];
const RIGHT_R16 = [93, 94, 95, 96];
const LEFT_QF = [97, 98];
const RIGHT_QF = [99, 100];
const LEFT_SF = [101];
const RIGHT_SF = [102];
const FINAL_MATCH = [103];

// One-sided bracket order (mobile, < md). All 16 R32 matches stack
// top-to-bottom, then later rounds scale up in vertical height so each
// slot's centre lines up with the midpoint of its two feeders.
// Mirrors PickSetBracketView's mobile layout for consistency across the
// site.
const ONE_SIDED_R32 = [...LEFT_R32, ...RIGHT_R32];
const ONE_SIDED_R16 = [...LEFT_R16, ...RIGHT_R16];
const ONE_SIDED_QF = [...LEFT_QF, ...RIGHT_QF];
const ONE_SIDED_SF = [...LEFT_SF, ...RIGHT_SF];

// Vertical rhythm for the one-sided (mobile) layout. The R32 column has
// 16 slots of SLOT_H height; later rounds use slotHeight = SLOT_H * 2^n
// so each card's vertical centre aligns to its feeder pair midpoint.
const ONE_SIDED_SLOT_H = 40;
const ONE_SIDED_MIN_W = 440;

type BracketPicks = Record<string, string | null>; // matchId → teamId

const initial: PickActionResult = { success: false };

/**
 * Truncate a team name to a maximum of 13 characters. Names 13 chars or
 * shorter pass through unchanged; longer names are cut to their first 10
 * characters plus "..." (so the maximum rendered length is always 13).
 *
 * Used by the desktop (md+) bracket view, where every round renders the
 * truncated full name. Mirrors the same rule used elsewhere in the project
 * (pick-set-bracket-view, pick-set-detail, game-drilldown). Defined locally
 * rather than shared since those modules don't export the helper and the
 * function is three lines.
 *
 * Mobile (< md) uses the 3-letter `team.short_code` directly — no truncation
 * needed because short codes are always ≤3 chars.
 */
function truncateTeamName(name: string): string {
  if (name.length <= 13) return name;
  return name.slice(0, 10) + "...";
}

export function BracketPicker({
  matches,
  teams,
  existingPicks,
  pickSetId,
  pool,
  isLocked,
}: BracketPickerProps) {
  const [state, action, pending] = useActionState(submitKnockoutPicksAction, initial);

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const matchByNumber = useMemo(() => {
    const m = new Map<number, MatchWithTeams>();
    for (const match of matches) {
      if (match.match_number) m.set(match.match_number, match);
    }
    return m;
  }, [matches]);
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  // Initialize picks state from existing picks
  const [picks, setPicks] = useState<BracketPicks>(() => {
    const p: BracketPicks = {};
    for (const m of matches) {
      p[m.id] = existingPicks[m.id] ?? null;
    }
    return p;
  });

  // Get the effective teams for a match (admin-set teams + cascaded winners)
  const getMatchTeams = useCallback(
    (matchNumber: number): { home: Team | null; away: Team | null } => {
      const match = matchByNumber.get(matchNumber);
      if (!match) return { home: null, away: null };

      const feeders = BRACKET_FEEDERS[matchNumber];
      if (!feeders) {
        // R32 match — teams come from admin assignment
        const home = match.home_team_id ? teamMap.get(match.home_team_id) ?? null : null;
        const away = match.away_team_id ? teamMap.get(match.away_team_id) ?? null : null;
        return { home, away };
      }

      // Later round — teams come from winners of feeder matches
      const [feederA, feederB] = feeders;
      const feederAMatch = matchByNumber.get(feederA);
      const feederBMatch = matchByNumber.get(feederB);

      let home: Team | null = null;
      let away: Team | null = null;

      // Check if admin has set the team (actual result), else use player's pick
      if (feederAMatch) {
        if (feederAMatch.status === "completed" && feederAMatch.result) {
          // Actual result — use the real winner
          const winnerId =
            feederAMatch.result === "home"
              ? feederAMatch.home_team_id
              : feederAMatch.away_team_id;
          home = winnerId ? teamMap.get(winnerId) ?? null : null;
        } else {
          // Use player's pick as the cascading winner
          const pickedId = picks[feederAMatch.id];
          home = pickedId ? teamMap.get(pickedId) ?? null : null;
        }
      }

      if (feederBMatch) {
        if (feederBMatch.status === "completed" && feederBMatch.result) {
          const winnerId =
            feederBMatch.result === "home"
              ? feederBMatch.home_team_id
              : feederBMatch.away_team_id;
          away = winnerId ? teamMap.get(winnerId) ?? null : null;
        } else {
          const pickedId = picks[feederBMatch.id];
          away = pickedId ? teamMap.get(pickedId) ?? null : null;
        }
      }

      return { home, away };
    },
    [matchByNumber, teamMap, picks]
  );

  // Pick a winner — cascade: clear downstream picks if the eliminated team was picked there
  const handlePick = useCallback(
    (matchId: string, teamId: string) => {
      if (isLocked) return;

      setPicks((prev) => {
        const next = { ...prev };
        const oldPick = next[matchId];
        next[matchId] = teamId;

        // If changing a pick, clear downstream picks that depended on the old winner
        if (oldPick && oldPick !== teamId) {
          clearDownstreamPicks(next, matchId, oldPick);
        }

        return next;
      });
    },
    [isLocked]
  );

  // Recursively clear picks in later rounds if they referenced an eliminated team
  function clearDownstreamPicks(
    picksState: BracketPicks,
    changedMatchId: string,
    eliminatedTeamId: string
  ) {
    const changedMatch = matchById.get(changedMatchId);
    if (!changedMatch?.match_number) return;

    // Find any match that is fed by this match
    for (const [laterNum, [feederA, feederB]] of Object.entries(BRACKET_FEEDERS)) {
      if (
        changedMatch.match_number === feederA ||
        changedMatch.match_number === feederB
      ) {
        const laterMatch = matchByNumber.get(parseInt(laterNum));
        if (!laterMatch) continue;

        // If the later match's pick was the eliminated team, clear it
        if (picksState[laterMatch.id] === eliminatedTeamId) {
          picksState[laterMatch.id] = null;
          // Recurse further downstream
          clearDownstreamPicks(picksState, laterMatch.id, eliminatedTeamId);
        }
      }
    }
  }

  // Count picks made
  const totalSlots = matches.filter((m) => {
    const mn = m.match_number;
    if (!mn) return false;
    if (mn >= 73 && mn <= 88) {
      // R32 — only count if admin has assigned teams
      return m.home_team_id && m.away_team_id;
    }
    return true;
  }).length;
  const filledPicks = Object.values(picks).filter(Boolean).length;

  // Shared render context — flows down through the column / slot tree so we
  // don't have to thread a long parameter list through every nesting level.
  const ctx: SlotRenderContext = {
    matchByNumber,
    getMatchTeams,
    picks,
    onPick: handlePick,
    isLocked,
  };

  return (
    <form action={action}>
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="pickSetId" value={pickSetId} />

      {/* Hidden inputs for form submission */}
      {Object.entries(picks).map(
        ([matchId, teamId]) =>
          teamId && (
            <input key={matchId} type="hidden" name={`knockout_${matchId}`} value={teamId} />
          )
      )}

      {/* Save bar */}
      <div className="sticky top-14 z-30 bg-[var(--color-bg)] border-b border-[var(--color-border)] -mx-4 px-4 py-3 mb-4 flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-secondary)]">
          {filledPicks}/{totalSlots} picks
        </span>
        <div className="flex items-center gap-2">
          {state.error && <span className="text-xs text-red-600">{state.error}</span>}
          {state.success && <span className="text-xs text-pitch-600">{state.message}</span>}
          {!isLocked && (
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Saving..." : "Save Bracket"}
            </button>
          )}
        </div>
      </div>

      {/* Desktop: two-sided March-Madness layout. Hidden below md. */}
      <div className="hidden md:block">
        <TwoSidedBracket ctx={ctx} />
      </div>

      {/* Mobile: one-sided bracket, R32 stacked top-to-bottom on the left.
          Shown below md. Mirrors the responsive split used in
          PickSetBracketView so all bracket views share the same behaviour. */}
      <div className="md:hidden">
        <OneSidedBracket ctx={ctx} />
      </div>

      {/* Mobile-friendly bottom save */}
      {!isLocked && (
        <div className="pt-4">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-pitch-600 px-4 py-3 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors tap-target"
          >
            {pending ? "Saving..." : "Save Bracket"}
          </button>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared render context
// ---------------------------------------------------------------------------

interface SlotRenderContext {
  matchByNumber: Map<number, MatchWithTeams>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  picks: BracketPicks;
  onPick: (matchId: string, teamId: string) => void;
  isLocked: boolean;
}

// ---------------------------------------------------------------------------
// Desktop: two-sided bracket (md+)
// ---------------------------------------------------------------------------
//
// 9-column grid. Final sits in the centre column with left SF / QF / R16 /
// R32 fanning out to its left and right SF / QF / R16 / R32 to its right.
// min-w-[900px] is the floor for legibility once labels become full-name
// truncated; if the viewport is narrower than that (rare at md+ inside the
// app's max-w-5xl container) the bracket scrolls horizontally inside its
// own overflow-x-auto wrapper rather than letting the page scroll.
// ---------------------------------------------------------------------------

function TwoSidedBracket({ ctx }: { ctx: SlotRenderContext }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-4">
      <div
        className="min-w-[900px] grid grid-cols-9 gap-x-1 items-center"
        style={{ minHeight: 720 }}
      >
        {/* Col 1: Left R32 (8 matches) */}
        <BracketMatchColumn matchNumbers={LEFT_R32} ctx={ctx} compact />

        {/* Col 2: Left R16 (4 matches) */}
        <BracketMatchColumn matchNumbers={LEFT_R16} ctx={ctx} compact />

        {/* Col 3: Left QF (2 matches) */}
        <BracketMatchColumn matchNumbers={LEFT_QF} ctx={ctx} />

        {/* Col 4: Left SF (1 match) */}
        <BracketMatchColumn matchNumbers={LEFT_SF} ctx={ctx} />

        {/* Col 5: Final (centre) — single match with a "FINAL" label above */}
        <div className="flex flex-col justify-center h-full">
          <div className="text-center text-xs font-bold text-[var(--color-text-muted)] mb-2">
            FINAL
          </div>
          {FINAL_MATCH.map((mn) => (
            <BracketMatch
              key={mn}
              matchNumber={mn}
              ctx={ctx}
              isFinal
            />
          ))}
        </div>

        {/* Col 6: Right SF (1 match) */}
        <BracketMatchColumn matchNumbers={RIGHT_SF} ctx={ctx} />

        {/* Col 7: Right QF (2 matches) */}
        <BracketMatchColumn matchNumbers={RIGHT_QF} ctx={ctx} />

        {/* Col 8: Right R16 (4 matches) */}
        <BracketMatchColumn matchNumbers={RIGHT_R16} ctx={ctx} compact />

        {/* Col 9: Right R32 (8 matches) */}
        <BracketMatchColumn matchNumbers={RIGHT_R32} ctx={ctx} compact />
      </div>
    </div>
  );
}

/**
 * Generic vertical column of bracket-match cards. Used by both halves of
 * the desktop bracket — the matches are vertically distributed via
 * justify-around so each card sits roughly at the midpoint of its two
 * feeder cards in the previous column.
 */
function BracketMatchColumn({
  matchNumbers,
  ctx,
  compact,
}: {
  matchNumbers: number[];
  ctx: SlotRenderContext;
  compact?: boolean;
}) {
  // The 1-match columns (SF, single-Final wrapper) don't need justify-around;
  // we still use it because flex's default 1-item behaviour is identical.
  return (
    <div className="flex flex-col justify-around h-full gap-1">
      {matchNumbers.map((mn) => (
        <BracketMatch
          key={mn}
          matchNumber={mn}
          ctx={ctx}
          compact={compact}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile: one-sided bracket (< md)
// ---------------------------------------------------------------------------
//
// Same conceptual sequence as desktop, but unfolded into a single horizontal
// flow — R32 (16 stacked) → R16 (8) → QF (4) → SF (2) → Final (1). Each
// later round's slotHeight is 2x the previous so its cards' vertical
// midpoints align with their feeder pairs.
// ---------------------------------------------------------------------------

function OneSidedBracket({ ctx }: { ctx: SlotRenderContext }) {
  const totalH = ONE_SIDED_SLOT_H * ONE_SIDED_R32.length;

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2">
      <div
        className="flex items-stretch"
        style={{ height: totalH, minWidth: ONE_SIDED_MIN_W }}
      >
        <OneSidedColumn
          matchNumbers={ONE_SIDED_R32}
          slotHeight={ONE_SIDED_SLOT_H}
          ctx={ctx}
        />
        <OneSidedColumn
          matchNumbers={ONE_SIDED_R16}
          slotHeight={ONE_SIDED_SLOT_H * 2}
          ctx={ctx}
        />
        <OneSidedColumn
          matchNumbers={ONE_SIDED_QF}
          slotHeight={ONE_SIDED_SLOT_H * 4}
          ctx={ctx}
        />
        <OneSidedColumn
          matchNumbers={ONE_SIDED_SF}
          slotHeight={ONE_SIDED_SLOT_H * 8}
          ctx={ctx}
        />
        <OneSidedColumn
          matchNumbers={FINAL_MATCH}
          slotHeight={ONE_SIDED_SLOT_H * 16}
          ctx={ctx}
          isFinal
        />
      </div>
    </div>
  );
}

function OneSidedColumn({
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
            compact
            isFinal={isFinal}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual bracket match (used by both desktop and mobile layouts)
// ---------------------------------------------------------------------------

function BracketMatch({
  matchNumber,
  ctx,
  compact,
  isFinal,
}: {
  matchNumber: number;
  ctx: SlotRenderContext;
  compact?: boolean;
  isFinal?: boolean;
}) {
  const match = ctx.matchByNumber.get(matchNumber);
  if (!match) return <div className="h-16" />;

  const { home, away } = ctx.getMatchTeams(matchNumber);
  const currentPick = ctx.picks[match.id];

  // Check if match has an actual completed result
  const isDecided = match.status === "completed" && !!match.result;
  const actualWinner = isDecided
    ? match.result === "home"
      ? match.home_team_id
      : match.away_team_id
    : null;

  return (
    <div
      className={cn(
        "rounded border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden w-full",
        isFinal && "border-gold-300 shadow-sm"
      )}
    >
      <TeamSlot
        team={home}
        isSelected={currentPick === home?.id}
        isWinner={actualWinner === home?.id}
        isLoser={isDecided && actualWinner !== home?.id && home !== null}
        onClick={() => home && ctx.onPick(match.id, home.id)}
        disabled={ctx.isLocked || !home}
        compact={compact}
      />
      <div className="border-t border-[var(--color-border)]" />
      <TeamSlot
        team={away}
        isSelected={currentPick === away?.id}
        isWinner={actualWinner === away?.id}
        isLoser={isDecided && actualWinner !== away?.id && away !== null}
        onClick={() => away && ctx.onPick(match.id, away.id)}
        disabled={ctx.isLocked || !away}
        compact={compact}
      />
    </div>
  );
}

function TeamSlot({
  team,
  isSelected,
  isWinner,
  isLoser,
  onClick,
  disabled,
  compact,
}: {
  team: Team | null;
  isSelected: boolean;
  isWinner: boolean;
  isLoser: boolean;
  onClick: () => void;
  disabled: boolean;
  compact?: boolean;
}) {
  if (!team) {
    return (
      <div className={cn("px-2 py-1.5 text-2xs text-[var(--color-text-muted)] italic", compact ? "h-7" : "h-8")}>
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
        "w-full flex items-center gap-1.5 text-left transition-all",
        compact ? "px-1.5 py-1 h-7" : "px-2 py-1.5 h-8",
        !disabled && "cursor-pointer hover:bg-pitch-50/50",
        disabled && "cursor-default",
        isSelected && !isWinner && !isLoser && "bg-pitch-50 font-semibold",
        isWinner && "bg-correct/10 font-semibold",
        isLoser && "opacity-40",
      )}
    >
      <TeamFlag
        flagCode={team.flag_code}
        teamName={team.name}
        shortCode={team.short_code}
        size="16x12"
      />
      {/*
        Responsive label rule, shared across every bracket view in the app:
          - Mobile (< md): 3-letter short_code, e.g. "BRA"
          - Desktop (md+): full name, truncated to ≤13 chars (10 chars + "...")
        Two spans toggled via Tailwind responsive classes — only the visible
        one renders, so there's no flash on resize. text-xs on desktop gives
        the bracket a more readable label; text-2xs on mobile keeps the
        compact short codes fitting comfortably inside the narrow R32 cards.
      */}
      <span className="truncate min-w-0 text-2xs md:hidden">
        {team.short_code}
      </span>
      <span className="truncate min-w-0 hidden md:inline text-xs">
        {truncateTeamName(team.name)}
      </span>
      {isSelected && !isWinner && (
        <span className="ml-auto text-pitch-600 text-2xs">✓</span>
      )}
      {isWinner && (
        <span className="ml-auto text-correct text-2xs">✓</span>
      )}
    </button>
  );
}
