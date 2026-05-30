"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkOtpRateLimit, createOtpRequest, verifyOtp } from "@/lib/auth/otp";
import { createPoolSession, destroyPoolSession } from "@/lib/auth/session";
import {
  sendOtpEmail,
  sendAccessRequestEmail,
} from "@/lib/email/resend";
import {
  isEmailWhitelisted,
  findOrCreateParticipant,
  findOrCreateMembership,
  getPoolAdminEmails,
  createAccessRequest,
} from "@/lib/pool/queries";
import { logAuditEvent } from "@/lib/audit";
import { AuditAction, AuditEntity } from "@/lib/audit/constants";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Pool } from "@/types/database";

// ---- Schemas ----
const requestOtpSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "Code must be 6 digits."),
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
});

const requestAccessSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
  referral: z.string().max(2000, "Please keep the referral note under 2000 characters.").optional().default(""),
});

// ---- Types ----
export type AuthActionResult = {
  success: boolean;
  error?: string;
};

// ---- Request OTP ----
export async function requestOtpAction(
  _prevState: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const parsed = requestOtpSchema.safeParse({
    email: formData.get("email"),
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { email, poolId, poolSlug } = parsed.data;

  // Fetch pool to get name for email
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("name, is_demo")
    .eq("id", poolId)
    .single();

  if (!pool) {
    return { success: false, error: "Pool not found." };
  }

  // Demo pools: skip OTP — auto-authenticate if email is a pool member
  if (pool.is_demo) {
    // Check if participant exists and is a member
    const { data: participant } = await supabaseAdmin
      .from("participants")
      .select("id, email, display_name")
      .eq("email", email.toLowerCase())
      .single();

    if (!participant) {
      return { success: false, error: "This email is not a member of this demo pool." };
    }

    const { data: membership } = await supabaseAdmin
      .from("pool_memberships")
      .select("role")
      .eq("pool_id", poolId)
      .eq("participant_id", participant.id)
      .eq("is_active", true)
      .single();

    if (!membership) {
      return { success: false, error: "This email is not a member of this demo pool." };
    }

    // Create session directly — no OTP needed
    await createPoolSession(
      poolId,
      poolSlug,
      participant.id,
      participant.email,
      participant.display_name,
      membership.role
    );

    redirect(`/${poolSlug}/my-picks`);
  }

  // Check whitelist
  const whitelisted = await isEmailWhitelisted(poolId, email);
  if (!whitelisted) {
    return {
      success: false,
      error: "This email is not on the invite list for this pool. Contact the pool admin to be added.",
    };
  }

  // Rate limit
  const allowed = await checkOtpRateLimit(email, poolId);
  if (!allowed) {
    return {
      success: false,
      error: "Too many login attempts. Please wait a bit and try again.",
    };
  }

  // Get IP address
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? null;

  // Create OTP and send email
  const code = await createOtpRequest(email, poolId, ip);
  const emailResult = await sendOtpEmail(email, code, pool.name);

  if (!emailResult.success) {
    return {
      success: false,
      error: "Failed to send login code. Please try again.",
    };
  }

  return { success: true };
}

// ---- Verify OTP ----
export async function verifyOtpAction(
  _prevState: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const parsed = verifyOtpSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { email, code, poolId, poolSlug } = parsed.data;

  // Verify the OTP
  const result = await verifyOtp(email, poolId, code);
  if (!result.valid) {
    return { success: false, error: result.error };
  }

  // OTP is valid — find or create participant and membership
  const participant = await findOrCreateParticipant(email);
  const membership = await findOrCreateMembership(poolId, participant.id);

  // Create session
  await createPoolSession(
    poolId,
    poolSlug,
    participant.id,
    participant.email,
    participant.display_name,
    membership.role
  );

  // Redirect to my-picks dashboard
  return redirect(`/${poolSlug}/my-picks`) as never;
}

// ---- Request access (self-service) ----
/**
 * A non-whitelisted visitor asks to be let into the pool. Records the
 * request with an unguessable token and emails every pool admin a
 * tokenised "Grant access" link. We deliberately return the SAME success
 * shape regardless of whether the email is already whitelisted or already
 * has a pending request, so this endpoint can't be used to probe who's on
 * the invite list.
 */
export async function requestAccessAction(
  _prevState: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const parsed = requestAccessSchema.safeParse({
    email: formData.get("email"),
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    referral: formData.get("referral") ?? "",
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { email, poolId, poolSlug, referral } = parsed.data;

  // Fetch pool for name + demo gating.
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("name, is_demo")
    .eq("id", poolId)
    .single();

  if (!pool) {
    return { success: false, error: "Pool not found." };
  }

  // Demo pools don't take access requests — membership there is seeded.
  if (pool.is_demo) {
    return {
      success: false,
      error: "This is a demo pool — access requests aren't available here.",
    };
  }

  // Rate limit reuses the OTP limiter (per email + pool) to stop someone
  // spamming admins with requests.
  const allowed = await checkOtpRateLimit(email, poolId);
  if (!allowed) {
    return {
      success: false,
      error: "Too many requests. Please wait a bit and try again.",
    };
  }

  // If already whitelisted, short-circuit WITHOUT revealing that fact:
  // present the same confirmation. They can just log in.
  const alreadyWhitelisted = await isEmailWhitelisted(poolId, email);
  if (alreadyWhitelisted) {
    return { success: true };
  }

  // Gather admins to notify. If a pool somehow has no admins, surface a
  // clear error rather than silently dropping the request.
  const adminEmails = await getPoolAdminEmails(poolId);
  if (adminEmails.length === 0) {
    return {
      success: false,
      error: "This pool has no admin to review requests right now. Please try again later.",
    };
  }

  // Create the request with a high-entropy URL-safe token.
  const token = randomBytes(32).toString("base64url");
  const request = await createAccessRequest(poolId, email, referral, token);

  // Build the absolute "Grant access" link. Prefer the configured app URL;
  // fall back to the request's forwarded host so the link still works in
  // preview deployments where NEXT_PUBLIC_APP_URL may not be set.
  const grantUrl = `${await resolveBaseUrl()}/${poolSlug}/auth/grant-access?token=${encodeURIComponent(
    token
  )}`;

  const emailResult = await sendAccessRequestEmail(adminEmails, {
    poolName: pool.name,
    requestorEmail: email,
    referralText: referral,
    grantUrl,
  });

  if (!emailResult.success) {
    return {
      success: false,
      error: "Couldn't notify the pool admins right now. Please try again.",
    };
  }

  // Audit — actor is the anonymous requestor (no participant id / role).
  await logAuditEvent({
    poolId,
    actor: { id: null, email: email.toLowerCase(), role: "requestor" },
    action: AuditAction.REQUEST_ACCESS,
    entityType: AuditEntity.ACCESS_REQUEST,
    entityId: request.id,
    newValue: { email: email.toLowerCase(), hasReferral: referral.trim().length > 0 },
  });

  return { success: true };
}

/**
 * Resolve the app's public base URL (no trailing slash). Prefers
 * NEXT_PUBLIC_APP_URL; otherwise reconstructs from forwarded headers.
 */
async function resolveBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// ---- Logout ----
export async function logoutAction(formData: FormData): Promise<void> {
  const poolSlug = formData.get("poolSlug") as string;
  if (poolSlug) {
    await destroyPoolSession(poolSlug);
  }
  redirect(`/${poolSlug}/standings`);
}
