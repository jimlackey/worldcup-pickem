import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  SUPER_ADMIN_COOKIE,
  SUPER_ADMIN_SESSION_HOURS,
  isSuperAdminEmail,
} from "./super-admin-constants";

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!);

export interface SuperAdminSession {
  sessionId: string;
  email: string;
  expiresAt: string;
}

/**
 * Create a new super-admin session. Sets an HTTP-only cookie + DB row.
 * Caller MUST have already verified the OTP for this email.
 */
export async function createSuperAdminSession(
  email: string,
  ipAddress: string | null
): Promise<void> {
  const normalizedEmail = email.toLowerCase();

  // Defensive: enforce allowlist at session creation too, not just at OTP request.
  if (!isSuperAdminEmail(normalizedEmail)) {
    throw new Error("Not a super-admin email");
  }

  const expiresAt = new Date(
    Date.now() + SUPER_ADMIN_SESSION_HOURS * 60 * 60 * 1000
  );

  const token = await new SignJWT({ email: normalizedEmail, kind: "super_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setJti(crypto.randomUUID())
    .sign(SECRET);

  const tokenHash = await hashToken(token);

  await supabaseAdmin.from("super_admin_sessions").insert({
    email: normalizedEmail,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    ip_address: ipAddress,
  });

  const cookieStore = await cookies();
  cookieStore.set(SUPER_ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Read + validate the super-admin session from cookies. Returns null if no
 * valid session, session expired, email is no longer in the allowlist, or
 * the DB row has been revoked.
 */
export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.kind !== "super_admin") return null;

    const email = (payload.email as string).toLowerCase();

    // Re-check allowlist on every read. If someone is removed from the
    // hardcoded list, their session stops working immediately.
    if (!isSuperAdminEmail(email)) return null;

    const tokenHash = await hashToken(token);
    const { data: session } = await supabaseAdmin
      .from("super_admin_sessions")
      .select("id, expires_at")
      .eq("token_hash", tokenHash)
      .single();

    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) return null;

    return {
      sessionId: session.id,
      email,
      expiresAt: session.expires_at,
    };
  } catch {
    return null;
  }
}

/**
 * Destroy the super-admin session.
 */
export async function destroySuperAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value;

  if (token) {
    const tokenHash = await hashToken(token);
    await supabaseAdmin
      .from("super_admin_sessions")
      .delete()
      .eq("token_hash", tokenHash);
  }

  cookieStore.delete(SUPER_ADMIN_COOKIE);
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
