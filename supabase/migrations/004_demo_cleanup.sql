-- ============================================================================
-- World Cup Pick'em — Helper for demo cleanup
-- Migration 004: Allow deleting audit_log entries for demo pools
-- ============================================================================

-- This function temporarily disables the audit_log delete trigger,
-- deletes entries for the given pool, then re-enables the trigger.
-- Only needed for demo pool cleanup.
CREATE OR REPLACE FUNCTION cleanup_demo_audit_log(p_pool_id UUID)
RETURNS void AS $$
BEGIN
    -- Disable the delete trigger temporarily
    ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete;
    
    -- Delete audit log entries for this pool
    DELETE FROM audit_log WHERE pool_id = p_pool_id;
    
    -- Re-enable the trigger
    ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
