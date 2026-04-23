"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSuperAdminSession } from "@/lib/auth/super-admin-session";
import { logAuditEvent, AuditAction, AuditEntity } from "@/lib/audit";

// ---- Types ----

export type GlobalCountryActionResult = {
  success: boolean;
  error?: string;
  message?: string;
};

// ---- Schemas ----

/**
 * Same field rules as the per-pool (demo) action:
 *   - name: 1..60 chars
 *   - short_code: exactly 3 letters, stored uppercase
 *   - flag_code: 2..6 chars, lowercase letters with optional "-xxx" suffix
 *     (e.g. "us", "gb-eng", "gb-sct")
 */
const updateGlobalTeamSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required.").max(60, "Name is too long."),
  shortCode: z
    .string()
    .trim()
    .length(3, "Short code must be exactly 3 characters.")
    .regex(/^[A-Za-z]{3}$/, "Short code must be 3 letters."),
  flagCode: z
    .string()
    .trim()
    .min(2, "Flag code must be at least 2 characters.")
    .max(6, "Flag code must be at most 6 characters.")
    .regex(
      /^[a-z]{2}(-[a-z]{2,3})?$/,
      "Flag code must be lowercase (e.g. 'us', 'gb-eng')."
    ),
});

// ---- Action ----

/**
 * Super-admin: update a GLOBAL team (teams.pool_id IS NULL).
 *
 * Demo pools each have their own private `teams` rows that the pool's own
 * admin edits via /{slug}/admin/countries. This action is strictly for the
 * shared global rows every real pool reads from — editing them is a
 * site-wide change.
 *
 * Writes to audit_log with pool_id NULL (enabled by Migration 009) and
 * action EDIT_GLOBAL_TEAM. These entries won't appear in any pool's
 * /audit-log page — they're surfaced separately (future super-admin audit
 * viewer).
 */
export async function updateGlobalTeamAction(
  _prev: GlobalCountryActionResult,
  formData: FormData
): Promise<GlobalCountryActionResult> {
  // Auth — super-admin session required.
  const session = await getSuperAdminSession();
  if (!session) {
    return { success: false, error: "Unauthorized." };
  }

  const parsed = updateGlobalTeamSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
    shortCode: formData.get("shortCode"),
    flagCode: formData.get("flagCode"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { teamId, name, shortCode, flagCode } = parsed.data;

  // Normalize.
  const normalizedShort = shortCode.toUpperCase();
  const normalizedFlag = flagCode.toLowerCase();

  // Load existing row and confirm it's actually a global row. If a
  // super-admin somehow points this action at a demo-pool team row, we
  // refuse — those belong to the pool admin's surface.
  const { data: oldTeam, error: readError } = await supabaseAdmin
    .from("teams")
    .select("id, name, short_code, flag_code, pool_id")
    .eq("id", teamId)
    .single();

  if (readError || !oldTeam) {
    return { success: false, error: "Team not found." };
  }

  if (oldTeam.pool_id !== null) {
    return {
      success: false,
      error:
        "This team belongs to a specific pool, not global tournament data. Edit it from that pool's admin page.",
    };
  }

  // No-op short-circuit.
  if (
    oldTeam.name === name &&
    oldTeam.short_code === normalizedShort &&
    oldTeam.flag_code === normalizedFlag
  ) {
    return { success: true, message: "No changes to save." };
  }

  // Write.
  const { error: updateError } = await supabaseAdmin
    .from("teams")
    .update({
      name,
      short_code: normalizedShort,
      flag_code: normalizedFlag,
    })
    .eq("id", teamId);

  if (updateError) {
    return {
      success: false,
      error: `Failed to update team: ${updateError.message}`,
    };
  }

  // Audit — field-level diff, NULL pool_id, super_admin actor_role.
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  if (oldTeam.name !== name) {
    oldValue.name = oldTeam.name;
    newValue.name = name;
  }
  if (oldTeam.short_code !== normalizedShort) {
    oldValue.short_code = oldTeam.short_code;
    newValue.short_code = normalizedShort;
  }
  if (oldTeam.flag_code !== normalizedFlag) {
    oldValue.flag_code = oldTeam.flag_code;
    newValue.flag_code = normalizedFlag;
  }

  await logAuditEvent({
    poolId: null,
    actor: { id: null, email: session.email, role: "super_admin" },
    action: AuditAction.EDIT_GLOBAL_TEAM,
    entityType: AuditEntity.TEAM,
    entityId: teamId,
    oldValue,
    newValue,
  });

  // Global team data is read by every real pool's pages. Revalidate the
  // super-admin view we were on; rely on Next's per-request revalidation
  // for pool pages. For heavily trafficked deployments you'd want a
  // broader revalidateTag strategy — not needed here since team edits
  // are rare.
  revalidatePath("/super-admin/countries");

  return { success: true, message: `${name} updated.` };
}
