import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_PER_HOUR,
} from "@/lib/utils/constants";
import { generateOtpCode } from "./otp";

/**
 * Rate limit check for super-admin OTP requests.
 * pool_id IS NULL is used to identify super-admin OTPs in the shared table.
 */
export async function checkSuperAdminOtpRateLimit(
  email: string
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabaseAdmin
    .from("otp_requests")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase())
    .is("pool_id", null)
    .gte("created_at", oneHourAgo);

  return (count ?? 0) < OTP_RATE_LIMIT_PER_HOUR;
}

/**
 * Create a super-admin OTP request. Stored in otp_requests with pool_id NULL.
 * Returns the plaintext code to email.
 */
export async function createSuperAdminOtpRequest(
  email: string,
  ipAddress: string | null
): Promise<string> {
  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();

  await supabaseAdmin.from("otp_requests").insert({
    email: email.toLowerCase(),
    pool_id: null,
    code_hash: codeHash,
    expires_at: expiresAt,
    ip_address: ipAddress,
  });

  return code;
}

/**
 * Verify a super-admin OTP. Returns { valid: true } on success, or an error.
 * On success, marks the OTP as used.
 */
export async function verifySuperAdminOtp(
  email: string,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const { data: otpRecords } = await supabaseAdmin
    .from("otp_requests")
    .select("*")
    .eq("email", email.toLowerCase())
    .is("pool_id", null)
    .eq("used", false)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (!otpRecords || otpRecords.length === 0) {
    return { valid: false, error: "No valid OTP found. Please request a new code." };
  }

  const otp = otpRecords[0];

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      valid: false,
      error: "Too many failed attempts. Please request a new code.",
    };
  }

  const isMatch = await bcrypt.compare(code, otp.code_hash);

  if (!isMatch) {
    await supabaseAdmin
      .from("otp_requests")
      .update({ attempts: otp.attempts + 1 })
      .eq("id", otp.id);
    return { valid: false, error: "Incorrect code. Please try again." };
  }

  // Mark as used
  await supabaseAdmin
    .from("otp_requests")
    .update({ used: true })
    .eq("id", otp.id);

  return { valid: true };
}
