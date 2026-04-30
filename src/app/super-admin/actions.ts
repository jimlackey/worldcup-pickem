"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  checkSuperAdminOtpRateLimit,
  createSuperAdminOtpRequest,
  verifySuperAdminOtp,
} from "@/lib/auth/super-admin-otp";
import {
  createSuperAdminSession,
  destroySuperAdminSession,
  getSuperAdminSession,
} from "@/lib/auth/super-admin-session";
import { isSuperAdminEmail, SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin-constants";
import { sendSuperAdminOtpEmail } from "@/lib/email/resend";
import { logAuditEvent, AuditAction, AuditEntity } from "@/lib/audit";
import { DEFAULT_POOL_DATES } from "@/lib/utils/constants";

// ---- Types ----

export type SuperAdminActionResult = {
  success: boolean;
  error?: string;
  message?: string;
};

// ---- Schemas ----

const requestOtpSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "Code must be 6 digits."),
});

const createPoolSchema = z.object({
  name: z.string().min(1, "Pool name is required.").max(100),
  slug: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "Slug must be lowercase letters, numbers, and hyphens only."
    )
    .min(3)
    .max(60),
  maxPickSets: z.coerce.number().int().min(1).max(10).default(5),
});

// ---- Request OTP ----
//
// Security note: we return a "success" response regardless of whether the
// email is in the allowlist. This avoids leaking who the super-admin is.
// We only actually send the email + create an OTP record if the email
// matches the allowlist.
export async function requestSuperAdminOtpAction(
  _prev: SuperAdminActionResult,
  formData: FormData
): Promise<SuperAdminActionResult> {
  const parsed = requestOtpSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const email = parsed.data.email.toLowerCase();

  // If not a super-admin, fail silently — show the same "success" message.
  // This prevents probing the allowlist via timing / response diffs.
  if (!isSuperAdminEmail(email)) {
    // Add a small delay so timing doesn't leak info (best effort).
    await new Promise((r) => setTimeout(r, 250));
    return { success: true };
  }

  // Rate limit
  const allowed = await checkSuperAdminOtpRateLimit(email);
  if (!allowed) {
    return {
      success: false,
      error: "Too many login attempts. Please wait a bit and try again.",
    };
  }

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? null;

  const code = await createSuperAdminOtpRequest(email, ip);
  const result = await sendSuperAdminOtpEmail(email, code);

  if (!result.success) {
    return { success: false, error: "Failed to send login code. Please try again." };
  }

  return { success: true };
}

// ---- Verify OTP ----

export async function verifySuperAdminOtpAction(
  _prev: SuperAdminActionResult,
  formData: FormData
): Promise<SuperAdminActionResult> {
  const parsed = verifyOtpSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const email = parsed.data.email.toLowerCase();

  // Enforce allowlist again here — don't trust that requestOtp was the only entry point.
  if (!isSuperAdminEmail(email)) {
    return { success: false, error: "Incorrect code. Please try again." };
  }

  const result = await verifySuperAdminOtp(email, parsed.data.code);
  if (!result.valid) {
    return { success: false, error: result.error };
  }

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? null;

  await createSuperAdminSession(email, ip);

  return redirect("/super-admin/dashboard") as never;
}

// ---- Logout ----

export async function superAdminLogoutAction(): Promise<void> {
  await destroySuperAdminSession();
  redirect("/super-admin");
}

// ---- Create Pool ----

export async function createPoolAction(
  _prev: SuperAdminActionResult,
  formData: FormData
): Promise<SuperAdminActionResult> {
  const session = await getSuperAdminSession();
  if (!session) {
    return { success: false, error: "Unauthorized." };
  }

  const parsed = createPoolSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    maxPickSets: formData.get("maxPickSets"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { name, slug, maxPickSets } = parsed.data;

  // Slug uniqueness check
  const { data: existing } = await supabaseAdmin
    .from("pools")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: `A pool with slug "${slug}" already exists.`,
    };
  }

  // Tournament ID from env
  const tournamentId = process.env.NEXT_PUBLIC_TOURNAMENT_ID;
  if (!tournamentId) {
    return {
      success: false,
      error: "NEXT_PUBLIC_TOURNAMENT_ID is not set in the environment.",
    };
  }

  // 1. Create the pool. Tournament dates are pre-filled with the canonical
  //    defaults from constants — group lock at kickoff, knockout window
  //    spanning the gap between the last group match and the first knockout
  //    match. The pool admin can override any of these from
  //    /{slug}/admin/settings if their pool is on a different schedule.
  const { data: pool, error: poolError } = await supabaseAdmin
    .from("pools")
    .insert({
      name,
      slug,
      tournament_id: tournamentId,
      max_pick_sets_per_player: maxPickSets,
      is_demo: false,
      is_active: true,
      is_listed: true,
      group_lock_at: DEFAULT_POOL_DATES.group_lock_at,
      knockout_open_at: DEFAULT_POOL_DATES.knockout_open_at,
      knockout_lock_at: DEFAULT_POOL_DATES.knockout_lock_at,
    })
    .select()
    .single();

  if (poolError || !pool) {
    return {
      success: false,
      error: `Failed to create pool: ${poolError?.message ?? "unknown error"}`,
    };
  }

  // 2. Initialize scoring config (uses existing RPC)
  const { error: scoringError } = await supabaseAdmin.rpc(
    "initialize_pool_scoring",
    { p_pool_id: pool.id }
  );
  if (scoringError) {
    // Non-fatal — admin can fix in settings. Log but continue.
    console.error("[super-admin] initialize_pool_scoring failed:", scoringError.message);
  }

  // 3. Auto-grant each super-admin email as a pool admin + whitelist entry.
  //    Per your Q3 answer: "Auto-grant jimlackey@gmail.com admin of every new pool."
  //    We iterate SUPER_ADMIN_EMAILS so if you ever add a second super-admin,
  //    they all get auto-granted.
  for (const superEmail of SUPER_ADMIN_EMAILS) {
    // Find or create participant
    const { data: existingParticipant } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("email", superEmail)
      .maybeSingle();

    let participantId = existingParticipant?.id;
    if (!participantId) {
      const { data: newParticipant, error: pErr } = await supabaseAdmin
        .from("participants")
        .insert({ email: superEmail, display_name: null })
        .select("id")
        .single();
      if (pErr || !newParticipant) {
        console.error("[super-admin] failed to create participant:", pErr?.message);
        continue;
      }
      participantId = newParticipant.id;
    }

    // Grant admin membership
    await supabaseAdmin.from("pool_memberships").upsert(
      {
        pool_id: pool.id,
        participant_id: participantId,
        role: "admin",
        is_approved: true,
        is_active: true,
      },
      { onConflict: "pool_id,participant_id" }
    );

    // Add to whitelist
    await supabaseAdmin
      .from("pool_whitelist")
      .upsert(
        { pool_id: pool.id, email: superEmail },
        { onConflict: "pool_id,email" }
      );
  }

  // 4. Audit log. Super-admin actions don't have a participant ID but the
  //    audit schema accepts actor_id NULL.
  await logAuditEvent({
    poolId: pool.id,
    actor: { id: null, email: session.email, role: "super_admin" },
    action: AuditAction.CREATE_POOL,
    entityType: AuditEntity.POOL,
    entityId: pool.id,
    oldValue: null,
    newValue: {
      name,
      slug,
      max_pick_sets_per_player: maxPickSets,
      group_lock_at: DEFAULT_POOL_DATES.group_lock_at,
      knockout_open_at: DEFAULT_POOL_DATES.knockout_open_at,
      knockout_lock_at: DEFAULT_POOL_DATES.knockout_lock_at,
    },
  });

  revalidatePath("/super-admin/dashboard");
  revalidatePath("/");

  return redirect(`/super-admin/dashboard?created=${encodeURIComponent(slug)}`) as never;
}
