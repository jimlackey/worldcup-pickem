"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import type { AdminActionResult } from "./actions";
import type { ConsolationMode } from "@/types/database";

// ---- Pool Bracket: consolation mode selector ----

/**
 * Set the pool's consolation_mode to one of:
 *
 *   "none"           — no consolation feature
 *   "bracket"        — in-bracket #104 consolation match (the original
 *                      consolation feature from migration 013)
 *   "preseason_pick" — optional pre-tournament 3rd-place pick made during
 *                      the Group Phase (migration 024)
 *
 * The DB trigger pools_sync_consolation_columns keeps the legacy
 * consolation_match_enabled boolean in sync — TRUE iff mode='bracket'.
 * That means every pre-024 code path that reads the boolean continues
 * to work unchanged: bracket-wiring, what-if/queries, the read-only
 * bracket view, the about page, the picks dashboard progress counters
 * — all of them keep getting the right answer.
 *
 * Lives in its own file (mirroring actions-privacy.ts, and the
 * pre-existing togglePoolConsolationMatchAction below) so the new code
 * doesn't have to be intermixed with the much larger actions.ts.
 *
 * BACKCOMPAT: the older togglePoolConsolationMatchAction is preserved
 * below for any external integration that still posts to it. It's no
 * longer wired into the settings UI — the new 3-way selector calls
 * setPoolConsolationModeAction instead — but removing it would break
 * direct callers (Slack bots, future API surface, etc.) so it stays
 * as a thin wrapper that maps the boolean to a mode and delegates.
 */

const setModeSchema = z.object({
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
  mode: z.enum(["none", "bracket", "preseason_pick"]),
});

export async function setPoolConsolationModeAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = setModeSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    mode: formData.get("mode"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolId, poolSlug, mode } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Read the previous mode so the audit log captures both sides. We
  // intentionally read consolation_mode (the source of truth) rather
  // than consolation_match_enabled — the boolean only has 2 states
  // and would lose the difference between 'none' and 'preseason_pick'
  // in the old-value column.
  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select("consolation_mode")
    .eq("id", poolId)
    .single();

  const previousMode = (oldPool?.consolation_mode as ConsolationMode | undefined) ?? null;

  // No-op short circuit. Saves an audit row and a DB write when the
  // admin clicks the option that's already selected.
  if (previousMode === mode) {
    return {
      success: true,
      message: "No change.",
    };
  }

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ consolation_mode: mode })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.SET_CONSOLATION_MODE,
    AuditEntity.POOL,
    poolId,
    { consolation_mode: previousMode },
    { consolation_mode: mode }
  );

  // Revalidate everything under the pool slug — the mode changes what
  // pages render across many surfaces (bracket, dashboard, picks,
  // what-if, my-picks card, payments).
  revalidatePath(`/${poolSlug}`, "layout");

  return {
    success: true,
    message:
      mode === "bracket"
        ? "Consolation match is now part of the bracket."
        : mode === "preseason_pick"
          ? "Players can now make a pre-tournament 3rd-place pick."
          : "Consolation feature disabled.",
  };
}

// ---------------------------------------------------------------------------
// Legacy: pre-024 single-boolean toggle.
// ---------------------------------------------------------------------------
//
// Kept for backward compatibility with any code still posting to this
// action. The new 3-way selector in /admin/settings uses
// setPoolConsolationModeAction above; this wrapper maps the legacy
// "enabled" boolean to a mode value and writes via the same path.
//
// A boolean toggle can only choose between 'none' and 'bracket' — there's
// no way to express 'preseason_pick' through it. If the previous mode
// was 'preseason_pick' and an admin flips the legacy boolean, that's an
// implicit downgrade to 'none' or 'bracket'; the audit row captures both
// values so the change is recoverable.

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
    .select("consolation_match_enabled, consolation_mode")
    .eq("id", poolId)
    .single();

  const targetMode: ConsolationMode = enabled ? "bracket" : "none";

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ consolation_mode: targetMode })
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
      consolation_mode:
        (oldPool?.consolation_mode as ConsolationMode | undefined) ?? null,
    },
    {
      consolation_match_enabled: enabled,
      consolation_mode: targetMode,
    }
  );

  revalidatePath(`/${poolSlug}`, "layout");

  return {
    success: true,
    message: enabled
      ? "Consolation match is now part of the bracket."
      : "Consolation match removed from the bracket.",
  };
}
