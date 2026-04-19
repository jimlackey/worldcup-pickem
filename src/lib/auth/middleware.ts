import { redirect } from "next/navigation";
import { getPoolSession } from "@/lib/auth/session";
import type { PoolSession, PoolRole } from "@/types/database";

/**
 * Require an authenticated session for a pool.
 * Redirects to login if not authenticated.
 * Optionally require a specific role (e.g. "admin").
 */
export async function requirePoolAuth(
  poolId: string,
  poolSlug: string,
  requiredRole?: PoolRole
): Promise<PoolSession> {
  const session = await getPoolSession(poolId, poolSlug);

  if (!session) {
    redirect(`/${poolSlug}/auth/login`);
  }

  if (requiredRole && session.role !== requiredRole) {
    // User is authenticated but lacks the required role
    redirect(`/${poolSlug}/standings`);
  }

  return session;
}
