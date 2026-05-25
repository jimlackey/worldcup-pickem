-- ============================================================================
-- Migration 022: Pool payments
--
-- Lets pool admins track who has paid their entry fee. One row per pick
-- set (not per participant) so a player who's entered three pick sets
-- can be marked paid for some and unpaid for others independently —
-- which is the right granularity for pools that charge per entry.
--
-- DESIGN
-- ------
--   - Per-pool, per-pick-set. UNIQUE(pick_set_id) is sufficient because
--     pick_sets already carries pool_id, but we keep pool_id on the row
--     too for fast pool-scoped reads (the admin page's main query).
--   - is_paid is a BOOLEAN, not a tri-state. "Unpaid" is the default
--     and is represented as `false`. We don't need a "not yet asked"
--     state — admins toggle from the default whenever appropriate.
--   - notes is free text capped at 1000 chars. Plenty of room for
--     "paid via Venmo 6/12, will resend reminder" or similar.
--   - updated_by points at the admin participant who last touched the
--     row. ON DELETE SET NULL so deleting an admin doesn't cascade-
--     wipe payment history — the row stays, the attribution becomes
--     unknown.
--   - Cascade delete from pools and pick_sets means dropping either
--     drops the payment rows. There's no real-user data here that
--     needs to survive a pool teardown.
--   - No RLS policy beyond table-level enable. Reads and writes go
--     through the service-role client (supabaseAdmin); the Next.js
--     admin layer enforces "you must be an admin of this pool to
--     read/write payments" with requirePoolAuth(..., "admin").
--
-- IDEMPOTENCY
-- -----------
--   CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, the trigger
--   drop/recreate, and the RLS enable line all tolerate re-execution.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pool_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id         UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    -- One payment row per pick set. UNIQUE here gives us upsert-on-
    -- pick_set_id semantics with no need for a composite key.
    pick_set_id     UUID NOT NULL UNIQUE REFERENCES pick_sets(id) ON DELETE CASCADE,
    is_paid         BOOLEAN NOT NULL DEFAULT false,
    notes           TEXT NOT NULL DEFAULT '',
    updated_by      UUID REFERENCES participants(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notes cap. Wrapped in a DO block so re-running the migration is a
-- no-op when the constraint already exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pool_payments_notes_length'
          AND conrelid = 'pool_payments'::regclass
    ) THEN
        ALTER TABLE pool_payments
            ADD CONSTRAINT pool_payments_notes_length
            CHECK (length(notes) <= 1000);
    END IF;
END $$;

-- Hot path: "give me every payment row for THIS pool" — the admin
-- payments page issues exactly this query on every render. UNIQUE on
-- pick_set_id already indexes that column individually; this adds a
-- pool_id index for the per-pool scan.
CREATE INDEX IF NOT EXISTS idx_pool_payments_pool
    ON pool_payments(pool_id);

-- Keep updated_at fresh on every UPDATE so the audit picture is
-- coherent without needing to re-set the column in every server
-- action. Drop-and-recreate to stay idempotent.
DROP TRIGGER IF EXISTS pool_payments_touch_updated_at ON pool_payments;

CREATE OR REPLACE FUNCTION pool_payments_touch_updated_at_fn()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pool_payments_touch_updated_at
    BEFORE UPDATE ON pool_payments
    FOR EACH ROW
    EXECUTE FUNCTION pool_payments_touch_updated_at_fn();

-- RLS: defense-in-depth only, matches the pattern in 001_schema.sql.
-- All real authorization lives in the Next.js admin layer.
ALTER TABLE pool_payments ENABLE ROW LEVEL SECURITY;
