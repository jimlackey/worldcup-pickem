"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import type { AdminActionResult } from "./actions";

// ---------------------------------------------------------------------------
// Toggle: show FIFA rankings on the group picks form
// ---------------------------------------------------------------------------

/**
 * Flip the per-pool `show_fifa_rankings` flag.
 *
 * When TRUE, the group picks form (/{slug}/my-picks/{pickSetId}) renders
 * each team's FIFA ranking inline beside the team name. Default FALSE.
 *
 * Lives in its own file (mirroring actions-privacy.ts and
 * actions-consolation.ts) so the much larger actions.ts doesn't have to
 * grow further.
 */
export async function togglePoolShowFifaRankingsAction(
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

  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select("show_fifa_rankings")
    .eq("id", poolId)
    .single();

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ show_fifa_rankings: enabled })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.TOGGLE_SHOW_FIFA_RANKINGS,
    AuditEntity.POOL,
    poolId,
    { show_fifa_rankings: oldPool?.show_fifa_rankings ?? null },
    { show_fifa_rankings: enabled }
  );

  revalidatePath(`/${poolSlug}`, "layout");

  return {
    success: true,
    message: enabled
      ? "FIFA rankings will now be shown on the picks form."
      : "FIFA rankings will no longer be shown on the picks form.",
  };
}

// ---------------------------------------------------------------------------
// Toggle: show match money lines on the group picks form
// ---------------------------------------------------------------------------

/**
 * Flip the per-pool `show_match_lines` flag.
 *
 * When TRUE, the group picks form renders each match's home / draw / away
 * money lines underneath the corresponding pick buttons. Default FALSE.
 */
export async function togglePoolShowMatchLinesAction(
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

  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select("show_match_lines")
    .eq("id", poolId)
    .single();

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ show_match_lines: enabled })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.TOGGLE_SHOW_MATCH_LINES,
    AuditEntity.POOL,
    poolId,
    { show_match_lines: oldPool?.show_match_lines ?? null },
    { show_match_lines: enabled }
  );

  revalidatePath(`/${poolSlug}`, "layout");

  return {
    success: true,
    message: enabled
      ? "Match lines will now be shown on the picks form."
      : "Match lines will no longer be shown on the picks form.",
  };
}
