// ============================================================================
// Bracket wiring constants
// ----------------------------------------------------------------------------
// Single source of truth for how knockout matches feed into one another,
// including the optional Consolation (3rd-place) match. Used by:
//
//   - The player-facing bracket picker
//   - The What-If bracket picker
//   - The admin auto-advance logic in src/app/[poolSlug]/admin/actions.ts
//   - The read-only PickSetBracketView
//   - The KnockoutPickRow fallback in pick-set-detail
//   - Demo seed scripts
//
// Centralising it here means we don't have five copies of "match 89 is fed
// by 73 and 74" drifting independently. Pre-migration 013 the file held
// only the championship bracket (R32 → Final, 31 matches). Post-013 it
// also models the consolation match (#104), which is fed by the LOSERS of
// the two semifinals (#101 and #102).
// ============================================================================

import type { MatchPhase, MatchWithTeams, Pool } from "@/types/database";

// ----------------------------------------------------------------------------
// Match-number ranges
// ----------------------------------------------------------------------------
// Group matches:    #1 – #72
// R32:              #73 – #88
// R16:              #89 – #96
// QF:               #97 – #100
// SF:               #101, #102
// Final:            #103
// Consolation:      #104 (only present when pool.consolation_match_enabled)
// ----------------------------------------------------------------------------
export const CONSOLATION_MATCH_NUMBER = 104;
export const FINAL_MATCH_NUMBER = 103;
export const SEMIFINAL_MATCH_NUMBERS = [101, 102] as const;

// ----------------------------------------------------------------------------
// BRACKET_FEEDERS — championship-only path (the original 31-match bracket).
//
// Key: match_number of the LATER match.
// Value: [feederA_match_number, feederB_match_number] — the two earlier
//        matches whose WINNERS advance into this slot (winner of feederA
//        goes to home, winner of feederB goes to away).
//
// This is the map every existing site of code uses for "who feeds the
// home/away of match N", since every match in the original bracket is
// fed purely by feeder winners. The Consolation match flips that polarity
// (it's fed by feeder LOSERS) so it lives in a separate map below.
// ----------------------------------------------------------------------------
export const BRACKET_FEEDERS: Record<number, [number, number]> = {
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

// ----------------------------------------------------------------------------
// CONSOLATION_FEEDERS — separate map for the consolation match because its
// teams come from feeder LOSERS, not feeder winners. Resolution priority
// in the picker is:
//
//   1. If a feeder semifinal is completed, the team that lost that match.
//   2. Otherwise, the team a player picked AGAINST in that semifinal.
//      i.e. if the player picked France to beat Spain in SF1, the
//      consolation match's "France-side" slot is Spain.
//   3. If the player hasn't picked the feeder semifinal, the slot is TBD.
//
// The order of feeders matches the visual layout in the screenshot —
// feederA (#101) → home/top side, feederB (#102) → away/bottom side.
// ----------------------------------------------------------------------------
export const CONSOLATION_FEEDERS: [number, number] = [101, 102];

// ----------------------------------------------------------------------------
// BRACKET_NEXT — used by the admin auto-advance logic when results are
// entered. After a match completes, the winner is dropped into the home
// or away slot of the next match, per this map.
//
// The Consolation match is fed by feeder LOSERS, so it has its own entry
// per semifinal that records both the next match (#104) and a marker
// saying "advance the LOSER". Semifinal winners still advance to the
// Final via the existing championship entry — see
// SEMIFINAL_LOSER_ADVANCE below for the consolation half.
// ----------------------------------------------------------------------------
export const BRACKET_NEXT: Record<number, { nextMatch: number; slot: "home" | "away" }> = {
  // R32 → R16
  73: { nextMatch: 89, slot: "home" }, 74: { nextMatch: 89, slot: "away" },
  75: { nextMatch: 90, slot: "home" }, 76: { nextMatch: 90, slot: "away" },
  77: { nextMatch: 91, slot: "home" }, 78: { nextMatch: 91, slot: "away" },
  79: { nextMatch: 92, slot: "home" }, 80: { nextMatch: 92, slot: "away" },
  81: { nextMatch: 93, slot: "home" }, 82: { nextMatch: 93, slot: "away" },
  83: { nextMatch: 94, slot: "home" }, 84: { nextMatch: 94, slot: "away" },
  85: { nextMatch: 95, slot: "home" }, 86: { nextMatch: 95, slot: "away" },
  87: { nextMatch: 96, slot: "home" }, 88: { nextMatch: 96, slot: "away" },
  // R16 → QF
  89: { nextMatch: 97, slot: "home" }, 90: { nextMatch: 97, slot: "away" },
  91: { nextMatch: 98, slot: "home" }, 92: { nextMatch: 98, slot: "away" },
  93: { nextMatch: 99, slot: "home" }, 94: { nextMatch: 99, slot: "away" },
  95: { nextMatch: 100, slot: "home" }, 96: { nextMatch: 100, slot: "away" },
  // QF → SF
  97: { nextMatch: 101, slot: "home" }, 98: { nextMatch: 101, slot: "away" },
  99: { nextMatch: 102, slot: "home" }, 100: { nextMatch: 102, slot: "away" },
  // SF → Final
  101: { nextMatch: 103, slot: "home" }, 102: { nextMatch: 103, slot: "away" },
};

/**
 * Companion to BRACKET_NEXT for the loser-of-semifinal → consolation flow.
 *
 * When a semifinal completes, advanceLoserToConsolation() drops the loser
 * into the appropriate slot of match #104. We keep this separate from
 * BRACKET_NEXT because BRACKET_NEXT's contract is "winner advances to
 * next match"; conflating winners and losers in one map would invite
 * subtle bugs in the admin auto-advance code.
 *
 * Slot layout: SF1 loser → home, SF2 loser → away. Mirrors the visual
 * layout in the bracket UI and matches the order of CONSOLATION_FEEDERS.
 */
export const SEMIFINAL_LOSER_ADVANCE: Record<number, { nextMatch: number; slot: "home" | "away" }> = {
  101: { nextMatch: CONSOLATION_MATCH_NUMBER, slot: "home" },
  102: { nextMatch: CONSOLATION_MATCH_NUMBER, slot: "away" },
};

// ----------------------------------------------------------------------------
// Knockout match-number lists, exported for the various bracket layouts.
// ----------------------------------------------------------------------------
export const ALL_R32_MATCH_NUMBERS = [
  73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88,
] as const;

export const ALL_R16_MATCH_NUMBERS = [
  89, 90, 91, 92, 93, 94, 95, 96,
] as const;

export const ALL_QF_MATCH_NUMBERS = [97, 98, 99, 100] as const;
export const ALL_SF_MATCH_NUMBERS = [101, 102] as const;

// ----------------------------------------------------------------------------
// Pool-aware helpers
// ----------------------------------------------------------------------------

/**
 * Returns true if the given match should be visible/active for the pool.
 *
 * The consolation match exists in the DB regardless of the pool flag, so
 * pages need to filter it out client-side based on the pool's setting.
 * Every other match is always active.
 */
export function isMatchActiveForPool(
  match: { phase: MatchPhase },
  pool: Pick<Pool, "consolation_match_enabled">
): boolean {
  if (match.phase === "consolation" && !pool.consolation_match_enabled) {
    return false;
  }
  return true;
}

/**
 * Filter out matches that are inactive for this pool. Today the only
 * gated phase is 'consolation', but the helper is shaped to be the
 * single chokepoint if more get added later.
 */
export function filterMatchesForPool<T extends { phase: MatchPhase }>(
  matches: T[],
  pool: Pick<Pool, "consolation_match_enabled">
): T[] {
  if (pool.consolation_match_enabled) return matches;
  return matches.filter((m) => m.phase !== "consolation");
}

/**
 * Total number of knockout matches a player needs to fill out a complete
 * bracket for this pool. 31 without consolation, 32 with.
 *
 * Used by the My Picks dashboard progress bar denominator and the
 * "X/Y picks made" indicator on the bracket picker.
 */
export function knockoutTotalCount(
  pool: Pick<Pool, "consolation_match_enabled">
): number {
  return pool.consolation_match_enabled ? 32 : 31;
}

/**
 * Phase order including consolation. Renderers that group matches by
 * phase use this to drive their iteration.
 *
 * Consolation comes after Final since that's the natural reading order
 * for a third-place playoff (after the championship has been decided).
 */
export const KNOCKOUT_PHASE_ORDER: MatchPhase[] = [
  "r32",
  "r16",
  "qf",
  "sf",
  "final",
  "consolation",
];

/**
 * Convenience wrapper for callers that have a flat MatchWithTeams[] and
 * just want it filtered. Identical behaviour to filterMatchesForPool —
 * exists only because it's the most common shape and TypeScript inference
 * works better with a concrete signature than the generic above.
 */
export function filterKnockoutMatchesForPool(
  matches: MatchWithTeams[],
  pool: Pick<Pool, "consolation_match_enabled">
): MatchWithTeams[] {
  return filterMatchesForPool(matches, pool);
}
