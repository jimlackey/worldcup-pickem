"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { addFavorite, removeFavorite } from "@/lib/favorites/queries";

/**
 * Server action: toggle the "favorite" flag on a specific pick set in
 * this pool. Called by the star button on each Standings / What-If row.
 *
 * Why a single toggle action rather than separate add/remove actions:
 *   - The client always knows the current state (it's reading the
 *     server-supplied favorite pick set IDs set), so it sends the
 *     desired state as a boolean. That keeps the wire-format trivial
 *     and avoids a read-modify-write race where two near-simultaneous
 *     clicks could end up with the wrong final state.
 *   - The DB upsert / delete are themselves idempotent, so even if the
 *     client is slightly out of sync, neither path produces an error.
 *
 * SECURITY:
 *   - `participantId` is taken from the validated session — never from
 *     the form payload — so a malicious caller cannot toggle favorites
 *     on behalf of another user.
 *   - The target pick set is verified to belong to THIS pool before we
 *     insert. Without that check, a caller could craft a form POST
 *     with a pick_set_id from a DIFFERENT pool and create a
 *     cross-pool favorite row that would never render anywhere (the
 *     standings page only loads pick sets for its own pool) but would
 *     pollute the table.
 */
export type FavoriteActionResult = {
  success: boolean;
  error?: string;
};

const toggleSchema = z.object({
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
  targetPickSetId: z.string().uuid(),
  // "true" if the row is currently NOT favorited and we should add it,
  // "false" if it is favorited and we should remove it. Sent as a
  // string because <button> form payloads stringify everything.
  desired: z.enum(["true", "false"]),
});

export async function toggleFavoriteAction(
  _prev: FavoriteActionResult,
  formData: FormData
): Promise<FavoriteActionResult> {
  const parsed = toggleSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    targetPickSetId: formData.get("targetPickSetId"),
    desired: formData.get("desired"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { poolId, poolSlug, targetPickSetId, desired } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session) {
    return {
      success: false,
      error: "You must be logged in to manage favorites.",
    };
  }

  // Cross-pool guard: verify the target pick set actually belongs to
  // this pool. Cheap single-row read; skipped when removing because the
  // delete query is already scoped by (pool_id, participant_id,
  // favorite_pick_set_id) and a no-match is a clean no-op.
  if (desired === "true") {
    const { data: pickSet } = await supabaseAdmin
      .from("pick_sets")
      .select("pool_id, is_active")
      .eq("id", targetPickSetId)
      .single();

    if (!pickSet || pickSet.pool_id !== poolId || !pickSet.is_active) {
      return {
        success: false,
        error: "That pick set is not available in this pool.",
      };
    }
  }

  try {
    if (desired === "true") {
      await addFavorite(poolId, session.participantId, targetPickSetId);
    } else {
      await removeFavorite(poolId, session.participantId, targetPickSetId);
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update favorite.",
    };
  }

  // Both the standings and the what-if pages read favorites server-side,
  // so revalidate both whenever the list changes.
  revalidatePath(`/${poolSlug}/standings`);
  revalidatePath(`/${poolSlug}/what-if`);

  return { success: true };
}
