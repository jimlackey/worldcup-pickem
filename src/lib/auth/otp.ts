import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_PER_HOUR,
  OTP_CODE_LENGTH,
} from "@/lib/utils/constants";

/**
 * Generate a random numeric OTP code.
 */
export function generateOtpCode(): string {
  const digits = OTP_CODE_LENGTH;
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  const code = Math.floor(min + Math.random() * (max - min + 1));
  return code.toString();
}

/**
 * Check rate limit: max N OTP requests per email per pool per hour.
 * Returns true if request is allowed.
 */
export async function checkOtpRateLimit(
  email: string,
  poolId: string
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabaseAdmin
    .from("otp_requests")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase())
    .eq("pool_id", poolId)
    .gte("created_at", oneHourAgo);

  return (count ?? 0) < OTP_RATE_LIMIT_PER_HOUR;
}

/**
 * Create a new OTP request. Returns the plain-text code (to be emailed).
 */
export async function createOtpRequest(
  email: string,
  poolId: string,
  ipAddress: string | null
): Promise<string> {
  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();

  await supabaseAdmin.from("otp_requests").insert({
    email: email.toLowerCase(),
    pool_id: poolId,
    code_hash: codeHash,
    expires_at: expiresAt,
    ip_address: ipAddress,
  });

  return code;
}

/**
 * Verify an OTP code for a given email + pool.
 * Returns true if valid, false otherwise.
 * Marks OTP as used on success. Increments attempts on failure.
 */
export async function verifyOtp(
  email: string,
  poolId: string,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  // Find the most recent unused, unexpired OTP for this email + pool
  const { data: otpRecords } = await supabaseAdmin
    .from("otp_requests")
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("pool_id", poolId)
    .eq("used", false)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (!otpRecords || otpRecords.length === 0) {
    return { valid: false, error: "No valid OTP found. Please request a new code." };
  }

  const otp = otpRecords[0];

  // Check max attempts
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      valid: false,
      error: "Too many failed attempts. Please request a new code.",
    };
  }

  // Verify the code
  const isMatch = await bcrypt.compare(code, otp.code_hash);

  if (!isMatch) {
    // Increment attempts
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
