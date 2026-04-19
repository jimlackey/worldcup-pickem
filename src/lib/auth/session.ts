import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  SESSION_COOKIE_PREFIX,
  SESSION_DURATION_HOURS,
} from "@/lib/utils/constants";
import type { PoolSession, PoolRole } from "@/types/database";

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!);

/**
 * Cookie name is pool-scoped so a user can be logged into multiple pools.
 * Format: wcp_session_{poolSlug}
 */
function cookieName(poolSlug: string): string {
  return `${SESSION_COOKIE_PREFIX}${poolSlug}`;
}

/**
 * Create a new session for a participant in a pool.
 * Sets an HTTP-only cookie with a signed JWT.
 */
export async function createPoolSession(
  poolId: string,
  poolSlug: string,
  participantId: string,
  email: string,
  displayName: string | null,
  role: PoolRole
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000
  );

  // Create JWT token
  const token = await new SignJWT({
    poolId,
    poolSlug,
    participantId,
    email,
    displayName,
    role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setJti(crypto.randomUUID())
    .sign(SECRET);

  // Hash token for DB storage
  const tokenHash = await hashToken(token);

  // Store session in DB
  await supabaseAdmin.from("sessions").insert({
    pool_id: poolId,
    participant_id: participantId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(cookieName(poolSlug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Read and validate the pool-scoped session from cookies.
 * Returns null if no valid session exists.
 */
export async function getPoolSession(
  poolId: string,
  poolSlug: string
): Promise<PoolSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName(poolSlug))?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET);

    // Verify the JWT claims match the requested pool
    if (payload.poolId !== poolId) return null;

    // Verify session exists in DB and hasn't been revoked
    const tokenHash = await hashToken(token);
    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, expires_at")
      .eq("token_hash", tokenHash)
      .eq("pool_id", poolId)
      .single();

    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) return null;

    return {
      sessionId: session.id,
      poolId: payload.poolId as string,
      poolSlug: payload.poolSlug as string,
      participantId: payload.participantId as string,
      email: payload.email as string,
      displayName: payload.displayName as string | null,
      role: payload.role as PoolRole,
      expiresAt: session.expires_at,
    };
  } catch {
    // Invalid JWT — clear the cookie
    const cs = await cookies();
    cs.delete(cookieName(poolSlug));
    return null;
  }
}

/**
 * Destroy the session for a pool — removes cookie and DB row.
 */
export async function destroyPoolSession(
  poolSlug: string
): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName(poolSlug))?.value;

  if (token) {
    const tokenHash = await hashToken(token);
    await supabaseAdmin
      .from("sessions")
      .delete()
      .eq("token_hash", tokenHash);
  }

  cookieStore.delete(cookieName(poolSlug));
}

/**
 * Hash a token for storage. Uses Web Crypto SHA-256.
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
