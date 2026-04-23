"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";

// ---- Types ----

export type CountryActionResult = {
  success: boolean;
  error?: string;
  message?: string;
};

// ---- Schemas ----

/**
 * Validation for editing a team/country.
 *
 * Field constraints mirror the `teams` table:
 *   - name: TEXT NOT NULL (we enforce 1..60 chars for sanity)
 *   - short_code: CHAR(3) NOT NULL (exactly 3 chars; we store uppercase)
 *   - flag_code: VARCHAR(6) NOT NULL (2–6 chars lowercase letters/hyphens,
 *     e.g. "us", "gb-eng", "gb-sct")
 */
const updateTeamSchema = z.object({
  poolSlug: z.string(),
  poolId: z.string().uuid(),
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
 * Update a team's name, short_code, and/or flag_code — DEMO POOLS ONLY.
 *
 * Real pools read from the global `teams` rows (pool_id IS NULL), which are
 * shared across every real pool. Letting one pool's admin mutate those rows
 * would silently affect every other pool. Global team edits have been moved
 * to /super-admin/countries; this action hard-rejects any attempt to edit a
 * global row and points the admin there.
 *
 * Demo pools keep their own private team rows (pool_id = pool.id), so this
 * action still works for them end-to-end.
 */
export async function updateTeamAction(
  _prev: CountryActionResult,
  formData: FormData
): Promise<CountryActionResult> {
  const parsed = updateTeamSchema.safeParse({
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    teamId: formData.get("teamId"),
    name: formData.get("name"),
    shortCode: formData.get("shortCode"),
    flagCode: formData.get("flagCode"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { poolSlug, poolId, teamId, name, shortCode, flagCode } = parsed.data;

  // Normalize: short_code uppercase, flag_code lowercase (enforced by regex
  // but be defensive in case the regex is relaxed in the future).
  const normalizedShort = shortCode.toUpperCase();
  const normalizedFlag = flagCode.toLowerCase();

  // Auth
  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Load pool to check demo-vs-real
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("is_demo")
    .eq("id", poolId)
    .single();

  if (!pool) {
    return { success: false, error: "Pool not found." };
  }

  if (!pool.is_demo) {
    return {
      success: false,
      error:
        "Country edits for real pools are managed by a super-admin at /super-admin/countries.",
    };
  }

  // Load the existing row so we can (a) diff for the audit log and
  // (b) confirm this team belongs to this demo pool.
  const { data: oldTeam, error: readError } = await supabaseAdmin
    .from("teams")
    .select("id, name, short_code, flag_code, pool_id")
    .eq("id", teamId)
    .single();

  if (readError || !oldTeam) {
    return { success: false, error: "Team not found." };
  }

  if (oldTeam.pool_id !== poolId) {
    return {
      success: false,
      error: "This team does not belong to this demo pool.",
    };
  }

  // No-op short-circuit: nothing changed.
  if (
    oldTeam.name === name &&
    oldTeam.short_code === normalizedShort &&
    oldTeam.flag_code === normalizedFlag
  ) {
    return { success: true, message: "No changes to save." };
  }

  // Write
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

  // Audit — only log the fields that actually changed.
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

  await logAdminAction(
    session,
    AuditAction.EDIT_TEAM,
    AuditEntity.TEAM,
    teamId,
    oldValue,
    newValue
  );

  // Revalidate anywhere team names/flags are rendered.
  revalidatePath(`/${poolSlug}/admin/countries`);
  revalidatePath(`/${poolSlug}/admin/matches`);
  revalidatePath(`/${poolSlug}/admin/knockout-setup`);
  revalidatePath(`/${poolSlug}/standings`);
  revalidatePath(`/${poolSlug}/picks`);
  revalidatePath(`/${poolSlug}/matches`);

  return { success: true, message: `${name} updated.` };
}
