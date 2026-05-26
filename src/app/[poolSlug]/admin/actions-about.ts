"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import type { AdminActionResult } from "./actions";

// ---- Pool About-page configuration ----
//
// Lives in its own file (mirroring actions-consolation.ts and
// actions-privacy.ts) so the new code doesn't have to be intermixed
// with the much larger actions.ts.
//
// One server action covers the whole About-page form: three section
// toggles plus nine free-text fields. Submitting the form writes
// everything in a single UPDATE — there's no value in per-field
// granularity here because the admin saves the whole form at once
// and the audit log is more useful if a single save produces a
// single audit row.

// Matches the CHECK constraints added by migration 023. Keeping the
// same number here means the Zod layer rejects oversize input before
// the DB has to.
const MAX_TEXT = 5000;

const aboutConfigSchema = z.object({
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),

  // Toggles arrive as "true" / "false" strings from hidden inputs that
  // the toggle controls flip. Coerced to booleans here.
  about_show_stages: z.enum(["true", "false"]).transform((v) => v === "true"),
  about_show_scoring: z.enum(["true", "false"]).transform((v) => v === "true"),
  about_show_payout: z.enum(["true", "false"]).transform((v) => v === "true"),

  // Free-text fields. `.max(MAX_TEXT)` matches the DB-side cap so a
  // user pasting a wall of text gets a friendly error instead of a
  // raw Postgres constraint violation. Empty strings are allowed —
  // an admin might intentionally blank out the footer.
  about_header_text: z.string().max(MAX_TEXT),
  about_stages_intro_text: z.string().max(MAX_TEXT),
  about_stage1_text: z.string().max(MAX_TEXT),
  about_stage2_text: z.string().max(MAX_TEXT),
  about_stage3_text: z.string().max(MAX_TEXT),
  about_stage4_text: z.string().max(MAX_TEXT),
  about_scoring_text: z.string().max(MAX_TEXT),
  about_payout_text: z.string().max(MAX_TEXT),
  about_footer_text: z.string().max(MAX_TEXT),
});

type AboutConfigUpdate = Omit<
  z.infer<typeof aboutConfigSchema>,
  "poolId" | "poolSlug"
>;

/**
 * Update the per-pool About-page configuration.
 *
 * Authorised to the pool's own admin role (NOT super-admin) per the
 * feature spec — about-page copy is pool-specific content the pool
 * admin owns.
 *
 * Writes every field in one UPDATE and emits a single audit row
 * (UPDATE_ABOUT_CONFIG) whose new_value JSON carries the full
 * post-save state. old_value carries the pre-save state of the same
 * fields so the audit log can show a full diff on inspection.
 */
export async function updatePoolAboutConfigAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = aboutConfigSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    about_show_stages: formData.get("about_show_stages"),
    about_show_scoring: formData.get("about_show_scoring"),
    about_show_payout: formData.get("about_show_payout"),
    about_header_text: formData.get("about_header_text") ?? "",
    about_stages_intro_text: formData.get("about_stages_intro_text") ?? "",
    about_stage1_text: formData.get("about_stage1_text") ?? "",
    about_stage2_text: formData.get("about_stage2_text") ?? "",
    about_stage3_text: formData.get("about_stage3_text") ?? "",
    about_stage4_text: formData.get("about_stage4_text") ?? "",
    about_scoring_text: formData.get("about_scoring_text") ?? "",
    about_payout_text: formData.get("about_payout_text") ?? "",
    about_footer_text: formData.get("about_footer_text") ?? "",
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { poolId, poolSlug, ...update } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Snapshot the previous values for the audit log. Selecting only the
  // about_* columns keeps the snapshot focused — there's no value in
  // dragging the entire pool row into the audit blob.
  const aboutColumns: (keyof AboutConfigUpdate)[] = [
    "about_show_stages",
    "about_show_scoring",
    "about_show_payout",
    "about_header_text",
    "about_stages_intro_text",
    "about_stage1_text",
    "about_stage2_text",
    "about_stage3_text",
    "about_stage4_text",
    "about_scoring_text",
    "about_payout_text",
    "about_footer_text",
  ];

  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select(aboutColumns.join(","))
    .eq("id", poolId)
    .single();

  const { error } = await supabaseAdmin
    .from("pools")
    .update(update as Record<string, unknown>)
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.UPDATE_ABOUT_CONFIG,
    AuditEntity.POOL,
    poolId,
    (oldPool as Record<string, unknown> | null) ?? null,
    update as unknown as Record<string, unknown>
  );

  // The About page itself is what changes for players, so revalidate
  // exactly that route. The admin form re-fetches via the page render
  // on the next request — revalidating the About route alone is
  // sufficient.
  revalidatePath(`/${poolSlug}/about`);
  revalidatePath(`/${poolSlug}/admin/about`);

  return {
    success: true,
    message: "About page updated.",
  };
}
