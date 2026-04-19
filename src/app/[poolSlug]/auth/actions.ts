"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkOtpRateLimit, createOtpRequest, verifyOtp } from "@/lib/auth/otp";
import { createPoolSession, destroyPoolSession } from "@/lib/auth/session";
import { sendOtpEmail } from "@/lib/email/resend";
import {
  isEmailWhitelisted,
  findOrCreateParticipant,
  findOrCreateMembership,
} from "@/lib/pool/queries";
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

  // Demo pools skip auth
  if (pool.is_demo) {
    return { success: false, error: "Demo pools do not require login." };
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
  redirect(`/${poolSlug}/my-picks`);
}

// ---- Logout ----
export async function logoutAction(formData: FormData): Promise<void> {
  const poolSlug = formData.get("poolSlug") as string;
  if (poolSlug) {
    await destroyPoolSession(poolSlug);
  }
  redirect(`/${poolSlug}/standings`);
}
