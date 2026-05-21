/**
 * Super-admin allowlist.
 *
 * A super-admin can create/manage pools site-wide. This is NOT the same as
 * a per-pool admin — super-admin status is not stored in the database.
 *
 * Add to this list only in source code, never at runtime. Single source of
 * truth for who can hit /super-admin.
 *
 * Side effects of adding an email here:
 *   - The email can request an OTP at /super-admin and sign in.
 *   - Every NEW pool created after this change auto-grants this email as
 *     a pool admin + whitelist entry (see createPoolAction in
 *     src/app/super-admin/actions.ts). Existing pools are NOT modified
 *     retroactively — grant memberships manually if needed.
 *   - The email's existing pool sessions, if any, are unaffected.
 */
export const SUPER_ADMIN_EMAILS: readonly string[] = [
  "jimlackey@gmail.com",
  "turkcmc@yahoo.com",
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
