/**
 * Super-admin allowlist.
 *
 * A super-admin can create/manage pools site-wide. This is NOT the same as
 * a per-pool admin — super-admin status is not stored in the database.
 *
 * Add to this list only in source code, never at runtime. Single source of
 * truth for who can hit /super-admin.
 */
export const SUPER_ADMIN_EMAILS: readonly string[] = [
  "jimlackey@gmail.com",
];

export function isSuperAdminEmail(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Cookie name for the super-admin session. Distinct prefix from the pool
 * session cookies (`wcp_session_{slug}`) so they never collide.
 */
export const SUPER_ADMIN_COOKIE = "wcp_super_admin";

/**
 * Session duration. Shorter than pool sessions because this cookie grants
 * higher privileges.
 */
export const SUPER_ADMIN_SESSION_HOURS = 12;
