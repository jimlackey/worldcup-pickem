"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import type { AdminActionResult } from "./actions";

// ---- Pool Bracket: consolation_match_enabled toggle ----

/**
 * Toggle whether the pool's bracket includes the consolation (3rd-place)
 * match.
 *
 * When TRUE (the default for new pools), match #104 is part of the
 * bracket: it sits below the Final, is contested between the losers of
 * the two semifinals, and counts toward each player's 32-pick total.
 * When FALSE, the pool behaves as if the match doesn't exist — pages,
 * pickers, and progress totals all skip it.
 *
 * The DB row for match #104 is created unconditionally by migration 013
 * (and per-pool by the seed scripts), so flipping this flag is purely an
 * application-layer decision. Toggling between values doesn't lose any
 * already-saved consolation picks: the picks remain in knockout_picks,
 * just hidden from the UI while the flag is off.
 *
 * Lives in its own file (mirroring actions-privacy.ts) so the new code
 * doesn't have to be intermixed with the much larger actions.ts.
 */
export async function togglePoolConsolationMatchAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const enabled = formData.get("enabled") === "true";

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Read the previous value so the audit log captures both sides.
  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select("consolation_match_enabled")
    .eq("id", poolId)
    .single();

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ consolation_match_enabled: enabled })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.TOGGLE_CONSOLATION_MATCH,
    AuditEntity.POOL,
    poolId,
    {
      consolation_match_enabled:
        oldPool?.consolation_match_enabled ?? null,
    },
    { consolation_match_enabled: enabled }
  );

  // Revalidate everything under the pool slug — the flag changes what
  // pages render across many surfaces (bracket, dashboard, picks, what-if).
  revalidatePath(`/${poolSlug}`, "layout");

  return {
    success: true,
    message: enabled
      ? "Consolation match is now part of the bracket."
      : "Consolation match removed from the bracket.",
  };
}
