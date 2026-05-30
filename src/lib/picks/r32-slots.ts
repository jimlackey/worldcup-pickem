// ----------------------------------------------------------------------------
// Official FIFA 2026 Round-of-32 slot definitions.
//
// Each of the 16 hand-assigned R32 matches (match_number 73–88) has two
// slots whose eligible teams are constrained by the official bracket layout:
//
//   - A "winner" slot (e.g. 1E) accepts only the winner of one group, so it's
//     constrained to the teams in that single group.
//   - A "runner-up" slot (e.g. 2B) accepts only the runner-up of one group,
//     so it too is constrained to that single group.
//   - A "third-place" slot (e.g. 3ABCDF) accepts one of the best third-placed
//     teams from a specific set of groups, so it's constrained to the teams
//     across those several groups.
//
// In every case the eligible TEAMS are simply "the teams in the listed
// group(s)" — the placement (1st / 2nd / 3rd) determines the hint label, but
// the filtering only needs the set of group letters, since a country can only
// finish 1st/2nd/3rd within its own group. So each slot carries:
//
//   hint   — the short code shown in the empty <select> option and as the
//            field label ("1E", "2B", "3ABCDF"), exactly as the official
//            bracket prints it.
//   groups — the set of group letters whose teams are eligible for the slot.
//
// The match_number → { home, away } assignment mirrors the visual bracket
// (and the screenshot the admin provided): left column top→bottom = 73–80,
// right column top→bottom = 81–88. The home slot is the upper team in each
// pair, the away slot the lower. This is purely about WHICH groups feed each
// slot; the winner-advancement wiring (BRACKET_FEEDERS / BRACKET_NEXT in
// bracket-wiring.ts) is independent and unchanged.
// ----------------------------------------------------------------------------

export interface R32Slot {
  /** Short bracket code shown as the hint / label, e.g. "1E" or "3ABCDF". */
  hint: string;
  /** Group letters whose teams are eligible for this slot. */
  groups: string[];
}

export interface R32SlotPair {
  home: R32Slot;
  away: R32Slot;
}

// Small constructors keep the table below compact and readable.
const slot = (hint: string, groups: string): R32Slot => ({
  hint,
  // "ABCDF" → ["A","B","C","D","F"]; "E" → ["E"].
  groups: groups.split(""),
});

/**
 * match_number (73–88) → the two slots of that R32 match.
 *
 * Source of truth: the official FIFA 2026 bracket. Left side first (73–80,
 * top→bottom), then right side (81–88, top→bottom).
 */
export const R32_SLOTS: Record<number, R32SlotPair> = {
  // ---- Left side (73–80) ----
  73: { home: slot("1E", "E"), away: slot("3ABCDF", "ABCDF") },
  74: { home: slot("1I", "I"), away: slot("3CDFGH", "CDFGH") },
  75: { home: slot("2A", "A"), away: slot("2B", "B") },
  76: { home: slot("1F", "F"), away: slot("2C", "C") },
  77: { home: slot("2K", "K"), away: slot("2L", "L") },
  78: { home: slot("1H", "H"), away: slot("2J", "J") },
  79: { home: slot("1D", "D"), away: slot("3BEFIJ", "BEFIJ") },
  80: { home: slot("1G", "G"), away: slot("3AEHIJ", "AEHIJ") },
  // ---- Right side (81–88) ----
  81: { home: slot("1C", "C"), away: slot("2F", "F") },
  82: { home: slot("2E", "E"), away: slot("2I", "I") },
  83: { home: slot("1A", "A"), away: slot("3CEFHI", "CEFHI") },
  84: { home: slot("1L", "L"), away: slot("3EHIJK", "EHIJK") },
  85: { home: slot("1J", "J"), away: slot("2H", "H") },
  86: { home: slot("2D", "D"), away: slot("2G", "G") },
  87: { home: slot("1B", "B"), away: slot("3EFGIJ", "EFGIJ") },
  88: { home: slot("1K", "K"), away: slot("3DEIJL", "DEIJL") },
};

/**
 * Look up the slot pair for a given match number. Returns null for any match
 * outside the standard hand-assigned R32 range (e.g. the non-standard
 * "Other Matches" fallback the setup page renders), in which case callers
 * should fall back to the unconstrained Home/Away behaviour.
 */
export function getR32Slots(matchNumber: number | null): R32SlotPair | null {
  if (matchNumber == null) return null;
  return R32_SLOTS[matchNumber] ?? null;
}
