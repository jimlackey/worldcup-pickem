-- ============================================================================
-- Migration 026: Access Requests (self-service "Request access" flow)
-- ============================================================================
--
-- CONTEXT
-- -------
-- Until now the ONLY way onto a pool's whitelist was for a pool admin to
-- add an email by hand (see pool_whitelist, migration 001, and the admin
-- whitelist surface). A would-be player whose email isn't on the list hits
-- the login rejection ("This email is not on the invite list...") and has
-- no in-app path forward — they have to find an admin out-of-band.
--
-- This migration backs a self-service request flow:
--
--   1. On the login page a visitor can click "Request access", type who
--      referred them (free text), and submit.
--   2. That submission writes a row here and emails EVERY pool admin a
--      "Grant access" link.
--   3. The first admin to click the link flips the row to "granted",
--      adds the email to pool_whitelist, and the requestor is emailed
--      that they can now log in.
--
-- The "Grant access" link is a plain GET URL an admin opens from their
-- inbox — they will NOT be logged into the pool in that browser, and we
-- don't want to force a login dance just to approve someone. So approval
-- is authorised by an unguessable per-request token (this table's
-- `token`) rather than by a session. The token is single-purpose
-- (grant THIS request) and the row carries its own status so a token
-- that's already been used can't grant twice.
--
-- STORAGE / COLUMN CHOICES
-- ------------------------
--   email          CITEXT — matches pool_whitelist.email and
--                  participants.email so comparisons are case-insensitive
--                  and consistent with the rest of the schema.
--   referral_text  Free-form text the requestor typed about who referred
--                  them. Nullable / may be empty; we don't parse it.
--   token          A high-entropy URL-safe string generated in the app
--                  layer (crypto.randomBytes). Stored in plaintext: it's a
--                  capability URL with the same threat model as the OTP
--                  links already emailed by this app, it's single-use via
--                  the status flip, and admins are the only recipients.
--                  UNIQUE so a lookup by token resolves to exactly one row.
--   status         'pending' | 'granted' | 'cancelled'. CHECK-constrained.
--                  'cancelled' is reserved for future admin/automatic
--                  dismissal; the app only writes 'pending' and 'granted'
--                  today.
--   granted_by_email / granted_at
--                  Audit trail of WHICH admin approved and WHEN. Both
--                  nullable (null while pending).
--
-- We intentionally do NOT add a UNIQUE(pool_id, email) constraint: a
-- person might legitimately request twice (lost the first email, etc.),
-- and the grant path is idempotent against pool_whitelist via upsert.
-- Resolving "already granted / already whitelisted" is handled in the app
-- so the user gets a friendly message rather than a constraint error.
--
-- IDEMPOTENCY
-- -----------
-- CREATE TABLE / CREATE INDEX use IF NOT EXISTS. The CHECK constraint is
-- wrapped in a DO block guarded on pg_constraint. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. access_requests table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id          UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    email            CITEXT NOT NULL,
    referral_text    TEXT,
    token            TEXT NOT NULL UNIQUE,
    status           TEXT NOT NULL DEFAULT 'pending',
    granted_by_email CITEXT,
    granted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status domain. Wrapped in a guard so re-running doesn't error.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'access_requests_status_check'
          AND conrelid = 'access_requests'::regclass
    ) THEN
        ALTER TABLE access_requests
            ADD CONSTRAINT access_requests_status_check
            CHECK (status IN ('pending', 'granted', 'cancelled'));
    END IF;
END $$;

-- Lookup by token (the Grant Access link) must be fast and is the hot
-- path for approval. UNIQUE already creates an index on token, but we
-- add a pool-scoped index for the admin-facing "pending requests" reads
-- that may land later.
CREATE INDEX IF NOT EXISTS access_requests_pool_status_idx
    ON access_requests (pool_id, status);

-- RLS: defense-in-depth only. All reads/writes flow through the service-
-- role client; the app layer enforces who can do what (the token gates
-- the grant; the login surface gates creation).
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. PostgREST schema cache reload.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
