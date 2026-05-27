-- ============================================================================
-- Migration 025: Payment Config (entry fee, consolation fee, payout grid)
-- ============================================================================
--
-- CONTEXT
-- -------
-- The Pool Admin needs to record three things about how money flows in
-- and out of a pool:
--
--   1. The entry fee per pick set (default $20.00).
--   2. The optional consolation buy-in fee, which gates the
--      pre-tournament 3rd-place pick added in migration 024
--      (default $5.00).
--   3. A payout schedule — how many places get paid (0–10) and what
--      percentage of the pot each place receives. The percentages
--      across all configured places must sum to exactly 100.
--
-- All three live on the per-pool settings page so admins can record
-- this information alongside scoring, dates, etc. The app does NOT
-- compute or distribute prize money — these are administrative
-- record-keeping fields that surface in the UI for the admin's
-- reference. The Payments page (migration 024) tracks who has paid;
-- this migration adds the per-pool config that says how much.
--
-- STORAGE CHOICES
-- ---------------
-- Money is stored as integer cents (e.g. $20.00 → 2000) rather than
-- NUMERIC or Postgres's money type:
--   - JS numbers handle integers up to 2^53 cents (~$90 quadrillion)
--     without precision loss; floats in NUMERIC round badly.
--   - Postgres's money type is locale-dependent (the same column
--     formats differently depending on lc_monetary), JSON-unfriendly,
--     and constraints can't be expressed naturally — three reasons
--     Stripe et al. settled on integer cents as the industry pattern.
--   - The application layer formats cents back to "$XX.XX" for
--     display; see src/lib/utils/money.ts.
--
-- Payouts live in a separate `pool_payouts` table (place, percent)
-- rather than as a JSON column on `pools`:
--   - Per-row CHECK on percent (0–100) is natural.
--   - Sum-to-100 is enforced application-side; a deferred trigger
--     could do it too but the up-to-10-rows scope makes that overkill.
--   - Easy to extend (e.g. add a "label" column later) without
--     versioning a JSON shape.
--
-- DEFAULTS
-- --------
-- Fresh pools come up with entry_fee_cents=2000 ($20) and
-- consolation_fee_cents=500 ($5). payout_winner_count starts at 0,
-- meaning "no payout schedule recorded" — pool_payouts is empty.
-- The settings UI prompts the admin to choose a winner count and
-- fill in percentages.
--
-- IDEMPOTENCY
-- -----------
-- All ALTER TABLE / CREATE TABLE statements use IF (NOT) EXISTS.
-- The constraints are wrapped in DO blocks. Trigger drop-and-recreate
-- pattern matches existing migrations. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pool-level fee + winner-count columns.
-- ----------------------------------------------------------------------------
ALTER TABLE pools
    ADD COLUMN IF NOT EXISTS entry_fee_cents INTEGER NOT NULL DEFAULT 2000;

ALTER TABLE pools
    ADD COLUMN IF NOT EXISTS consolation_fee_cents INTEGER NOT NULL DEFAULT 500;

ALTER TABLE pools
    ADD COLUMN IF NOT EXISTS payout_winner_count INTEGER NOT NULL DEFAULT 0;

-- Sensible bounds. Negative fees would be a billing nightmare;
-- ten million dollars is a hard cap on per-pickset entry to catch
-- "extra zero" typos before they hit the UI. Winner count is
-- bounded 0–10 per spec.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pools_entry_fee_cents_check'
          AND conrelid = 'pools'::regclass
    ) THEN
        ALTER TABLE pools
            ADD CONSTRAINT pools_entry_fee_cents_check
            CHECK (entry_fee_cents >= 0 AND entry_fee_cents <= 1000000000);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pools_consolation_fee_cents_check'
          AND conrelid = 'pools'::regclass
    ) THEN
        ALTER TABLE pools
            ADD CONSTRAINT pools_consolation_fee_cents_check
            CHECK (consolation_fee_cents >= 0 AND consolation_fee_cents <= 1000000000);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pools_payout_winner_count_check'
          AND conrelid = 'pools'::regclass
    ) THEN
        ALTER TABLE pools
            ADD CONSTRAINT pools_payout_winner_count_check
            CHECK (payout_winner_count >= 0 AND payout_winner_count <= 10);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. pool_payouts table — one row per (pool, place).
--
--    `place` is the 1-indexed finishing position (1 = winner). `percent`
--    is an integer percentage 0–100. The application enforces that the
--    sum of percents for a pool's payout rows equals exactly 100; we
--    don't try to express that in a CHECK constraint because per-row
--    CHECKs can't span rows.
--
--    A pool with payout_winner_count = 0 has no rows in this table.
--    Changing the winner count from N to M:
--      - N > M: rows for places > M get deleted.
--      - N < M: new rows are inserted for the additional places.
--    The server action handles this transition atomically (delete +
--    upsert in a single round-trip).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pool_payouts (
    pool_id     UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    place       INTEGER NOT NULL,
    percent     INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pool_id, place)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pool_payouts_place_check'
          AND conrelid = 'pool_payouts'::regclass
    ) THEN
        ALTER TABLE pool_payouts
            ADD CONSTRAINT pool_payouts_place_check
            CHECK (place >= 1 AND place <= 10);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pool_payouts_percent_check'
          AND conrelid = 'pool_payouts'::regclass
    ) THEN
        ALTER TABLE pool_payouts
            ADD CONSTRAINT pool_payouts_percent_check
            CHECK (percent >= 0 AND percent <= 100);
    END IF;
END $$;

-- Keep updated_at fresh on every UPDATE. Matches the pattern used by
-- pool_payments (migration 022). Drop-and-recreate for idempotency.
CREATE OR REPLACE FUNCTION pool_payouts_touch_updated_at_fn()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pool_payouts_touch_updated_at ON pool_payouts;

CREATE TRIGGER pool_payouts_touch_updated_at
    BEFORE UPDATE ON pool_payouts
    FOR EACH ROW
    EXECUTE FUNCTION pool_payouts_touch_updated_at_fn();

-- RLS: defense-in-depth only. Reads/writes flow through the service-
-- role client; the Next.js admin layer enforces "you must be an admin
-- of this pool" with requirePoolAuth(..., "admin").
ALTER TABLE pool_payouts ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. PostgREST schema cache reload — after column/table changes the
--    schema cache must be reloaded so the API recognises them. Safe
--    to NOTIFY repeatedly.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
