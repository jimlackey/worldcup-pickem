import type { Pool } from "@/types/database";

/**
 * Check if group phase picks are still open for a pool.
 */
export function isGroupPhaseOpen(pool: Pool): boolean {
  if (!pool.group_lock_at) return true; // No lock set = always open
  return new Date() < new Date(pool.group_lock_at);
}

/**
 * Check if knockout phase is open for picks.
 * Must be after knockout_open_at and before knockout_lock_at.
 */
export function isKnockoutPhaseOpen(pool: Pool): boolean {
  const now = new Date();

  // Must have an open date set
  if (!pool.knockout_open_at) return false;
  if (now < new Date(pool.knockout_open_at)) return false;

  // If lock date is set, must be before it
  if (pool.knockout_lock_at && now >= new Date(pool.knockout_lock_at)) {
    return false;
  }

  return true;
}

/**
 * Check if a participant can create another pick set in this pool.
 */
export function canCreatePickSet(
  currentCount: number,
  maxAllowed: number
): boolean {
  return currentCount < maxAllowed;
}

/**
 * Validate pick value for group phase.
 */
export function isValidGroupPick(
  pick: string
): pick is "home" | "draw" | "away" {
  return ["home", "draw", "away"].includes(pick);
}
