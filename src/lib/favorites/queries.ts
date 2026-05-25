import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Server-side helpers for the per-pool favorites list.
 *
 * Favorites are a directed edge from the logged-in `participant_id` to
 * a specific `pick_set_id` in the same pool. They drive the "Favorites"
 * sub-tab on the Standings and What-If pages — that view is the same
 * standings calculation, filtered to the favorited pick sets.
 *
 * A user can favorite individual pick sets independently — favoriting
 * "Heather Collins 1" does not also favorite "Heather Collins 2" or
 * "Heather Collins 3". (This is the re-keyed model from migration 021;
 * the original migration-020 model was keyed on participant_id and
 * lit up all of a participant's pick sets at once.)
 *
 * All queries here use the service-role client (supabaseAdmin) and
 * therefore bypass RLS. The Next.js server layer is responsible for
 * ensuring `participant_id` is always derived from the session before
 * calling into these helpers — never trust a participant id that came
 * from a form payload.
 */

/**
 * Return the set of pick set IDs that the given user has favorited
 * inside the given pool. A Set is the right shape for the consumers
 * (standings filter + per-row star toggle): both want O(1) membership
 * checks against potentially dozens of rows.
 *
 * Empty set if no session or no rows.
 */
export async function getFavoritePickSetIds(
  poolId: string,
  participantId: string
): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("pool_favorites")
    .select("favorite_pick_set_id")
    .eq("pool_id", poolId)
    .eq("participant_id", participantId);

  if (error) {
    // Don't crash the page if the favorites read fails — degrade to an
    // empty list. The standings page must continue to render.
    console.error("getFavoritePickSetIds error:", error);
    return new Set();
  }

  return new Set(
    ((data ?? []) as { favorite_pick_set_id: string }[]).map(
      (r) => r.favorite_pick_set_id
    )
  );
}

/**
 * Add a favorite edge. Idempotent via the table's UNIQUE constraint;
 * a duplicate insert is treated as a no-op rather than an error.
 */
export async function addFavorite(
  poolId: string,
  participantId: string,
  favoritePickSetId: string
): Promise<void> {
  const { error } = await supabaseAdmin.from("pool_favorites").upsert(
    {
      pool_id: poolId,
      participant_id: participantId,
      favorite_pick_set_id: favoritePickSetId,
    },
    { onConflict: "pool_id,participant_id,favorite_pick_set_id" }
  );

  if (error) {
    throw new Error(`Failed to add favorite: ${error.message}`);
  }
}

/**
 * Remove a favorite edge. No-op if it doesn't exist.
 */
export async function removeFavorite(
  poolId: string,
  participantId: string,
  favoritePickSetId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("pool_favorites")
    .delete()
    .eq("pool_id", poolId)
    .eq("participant_id", participantId)
    .eq("favorite_pick_set_id", favoritePickSetId);

  if (error) {
    throw new Error(`Failed to remove favorite: ${error.message}`);
  }
}
