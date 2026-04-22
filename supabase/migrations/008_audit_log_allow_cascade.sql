-- ============================================================================
-- Migration 008: Allow audit_log cascades when pool is being deleted
-- ============================================================================
--
-- PROBLEM
-- -------
-- The original audit_log design uses a BEFORE DELETE trigger to enforce
-- append-only semantics:
--
--   CREATE TRIGGER audit_log_no_delete
--       BEFORE DELETE ON audit_log
--       FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
--
-- The FK from audit_log to pools is ON DELETE CASCADE, so when we try to
-- DELETE FROM pools, Postgres cascades to audit_log — and that cascade fires
-- the trigger, which aborts with "audit_log is append-only: DELETE not
-- permitted". Net effect: you can never delete a pool that has audit log
-- entries. The seed-demo script's "🗑️" output prints regardless (because the
-- script doesn't check errors), so the failure is silent and the next
-- INSERT hits a unique-slug violation.
--
-- FIX
-- ---
-- Redefine prevent_audit_log_mutation so that on a DELETE, it allows the row
-- to go away if the parent pool no longer exists. During a cascade from
-- `DELETE FROM pools`, the pools row is deleted before the cascade fires, so
-- NOT EXISTS (...) returns true → delete is allowed.
--
-- For a direct `DELETE FROM audit_log WHERE id = X`, the pool row still
-- exists, so the trigger blocks as before. The append-only guarantee is
-- preserved for normal operation.
--
-- UPDATE is still blocked unconditionally.
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Allow deletes only when the parent pool is gone (i.e. we're in a
        -- cascade from DELETE FROM pools). Direct deletes on audit_log still
        -- fail because the pool row still exists at that point.
        IF NOT EXISTS (SELECT 1 FROM pools WHERE id = OLD.pool_id) THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'audit_log is append-only: DELETE not permitted';
    END IF;

    -- UPDATE path unchanged
    RAISE EXCEPTION 'audit_log is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
