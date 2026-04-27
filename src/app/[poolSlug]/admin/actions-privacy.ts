"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import type { AdminActionResult } from "./actions";

// ---- Pool Privacy: requires_login_to_view toggle ----

/**
 * Toggle whether viewing this pool's contents requires a logged-in session.
 *
 * When TRUE (the default for new pools), unauthenticated visitors hitting
 * any /{slug}/* path other than /{slug}/auth/* are bounced to the login
 * page by [poolSlug]/layout.tsx.
 *
 * When FALSE, the pool reverts to publicly readable — anyone with the
 * URL can see standings, picks, matches, etc.
 *
 * This is independent of `is_listed`, which controls whether the pool
 * appears on the root landing page. A pool can be listed-but-private
 * (visible on the landing page, login required for contents) or
 * unlisted-and-public (hidden from listing, anyone with the link can
 * read).
 */
export async function togglePoolLoginRequiredAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const requiresLogin = formData.get("requiresLogin") === "true";

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Read the previous value so the audit log captures both sides.
  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select("requires_login_to_view")
    .eq("id", poolId)
    .single();

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ requires_login_to_view: requiresLogin })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.TOGGLE_LOGIN_REQUIRED,
    AuditEntity.POOL,
    poolId,
    { requires_login_to_view: oldPool?.requires_login_to_view ?? null },
    { requires_login_to_view: requiresLogin }
  );

  // Revalidate everything under the pool slug since the gate decision
  // happens in the pool layout and is cached per request.
  revalidatePath(`/${poolSlug}`, "layout");
  revalidatePath("/");

  return {
    success: true,
    message: requiresLogin
      ? "Pool now requires login to view."
      : "Pool is now publicly viewable.",
  };
}
