-- ============================================================================
-- Migration 006: Super-admin support
--
-- Adds:
--   1. Nullable pool_id on otp_requests so super-admin OTPs can be stored
--      in the same table as pool-scoped OTPs (pool_id IS NULL for super-admin).
--   2. A dedicated super_admin_sessions table. We keep super-admin sessions
--      separate from pool-scoped `sessions` because:
--        - a super-admin is not tied to any pool
--        - the cookie name and scope differ
--        - pool-scoped session cleanup/cascade rules don't apply
-- ============================================================================

-- 1. Relax the NOT NULL constraint on otp_requests.pool_id.
--    We still scope OTP lookups by (email, pool_id) in code, so existing
--    pool-scoped behavior is unchanged. pool_id IS NULL = super-admin OTP.
ALTER TABLE otp_requests
    ALTER COLUMN pool_id DROP NOT NULL;

-- Index for fast lookup of super-admin OTPs by email
CREATE INDEX IF NOT EXISTS idx_otp_requests_email_null_pool
    ON otp_requests(email, created_at DESC)
    WHERE pool_id IS NULL;

-- 2. Super-admin sessions — separate from pool-scoped `sessions`.
CREATE TABLE IF NOT EXISTS super_admin_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       CITEXT NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_super_admin_sessions_expires
    ON super_admin_sessions(expires_at);

-- RLS: no direct client access. Service role only.
ALTER TABLE super_admin_sessions ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated roles. Service role bypasses RLS.
