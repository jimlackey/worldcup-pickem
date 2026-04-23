-- ============================================================================
-- Migration 009: Allow NULL pool_id in audit_log for super-admin global events
-- ============================================================================
--
-- CONTEXT
-- -------
-- Super-admin actions that touch global tournament data (e.g. editing a
-- country's name, short code, or flag code on a `teams` row with
-- pool_id IS NULL) have no natural pool to log against. Historically we've
-- worked around this by logging against a newly created pool (see
-- createPoolAction), but that doesn't work for edits to pre-existing global
-- rows.
--
-- CHANGES
-- -------
-- 1. audit_log.pool_id becomes nullable. Entries with pool_id IS NULL
--    represent site-wide super-admin events that aren't tied to any
--    single pool. They'll only be queryable via a future super-admin
--    audit viewer, not from per-pool /audit-log pages.
--
-- 2. Update the prevent_audit_log_mutation trigger so the cascade-escape
--    clause doesn't accidentally let anyone directly DELETE super-admin
--    audit rows (where pool_id IS NULL). Without this fix, the NOT EXISTS
--    check in Migration 008 returns true for NULL pool_id because
--    `id = NULL` never matches anything — which would silently permit
--    direct deletes. We require pool_id IS NOT NULL in the escape clause
--    so NULL-pool rows are strictly append-only.
-- ============================================================================

-- 1. Relax NOT NULL
ALTER TABLE audit_log
    ALTER COLUMN pool_id DROP NOT NULL;

-- Index for the new access pattern: "all global super-admin events, newest first"
CREATE INDEX IF NOT EXISTS idx_audit_log_global
    ON audit_log(timestamp DESC)
    WHERE pool_id IS NULL;

-- 2. Harden the cascade-aware delete trigger so NULL pool_id rows remain
--    strictly append-only. The NOT EXISTS check from Migration 008 relied
--    on the parent pool's absence meaning "we're in a cascade". For NULL
--    pool_id rows, there never was a parent pool, so we must explicitly
--    disallow that path.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Cascade-escape: allow delete only if pool_id is set AND the
        -- parent pool is gone (i.e. we're inside a DELETE FROM pools
        -- cascade). For direct DELETEs the pool still exists, so it blocks.
        -- For super-admin global events (pool_id IS NULL), we always block.
        IF OLD.pool_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM pools WHERE id = OLD.pool_id) THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'audit_log is append-only: DELETE not permitted';
    END IF;

    -- UPDATE path unchanged — always blocked.
    RAISE EXCEPTION 'audit_log is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
