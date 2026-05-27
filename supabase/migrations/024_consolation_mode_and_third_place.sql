-- ============================================================================
-- Migration 024: Consolation mode + Pre-Tournament 3rd Place pick
-- ============================================================================
--
-- CONTEXT
-- -------
-- Migration 013 introduced a single boolean toggle `consolation_match_enabled`
-- which controls whether the in-bracket consolation match (#104) is part of
-- the pool. This migration introduces a SECOND kind of consolation feature
-- — a Pre-Tournament 3rd-Place Selection — and folds both into a single
-- three-valued admin choice.
--
-- The two consolation features are mutually exclusive: a pool either has
-- the in-bracket #104 match, OR the pre-tournament guess, OR neither.
-- Storing this as a single text "mode" column gives us the exclusivity for
-- free at the type level.
--
-- We KEEP `consolation_match_enabled` as a derived boolean so every existing
-- caller (bracket-wiring.ts, what-if/queries.ts, pick-set-bracket-view.tsx,
-- about/page.tsx, etc.) keeps working with zero touch — it stays TRUE iff
-- consolation_mode = 'bracket'. A trigger keeps the two in sync on every
-- write, no matter which column the caller updates.
--
-- NEW CONSOLATION OPTIONS (consolation_mode)
-- ------------------------------------------
--   'none'           — No consolation feature at all. 31-pick bracket, no
--                      pre-tournament 3rd-place pick. consolation_match_enabled
--                      stays FALSE.
--   'bracket'        — The existing in-bracket #104 match (migration 013).
--                      consolation_match_enabled is TRUE; everything that
--                      already keyed off that flag continues to work.
--   'preseason_pick' — Players make an OPTIONAL pick during the Group Phase
--                      for who they think will finish third in the whole
--                      tournament. Editable until group_lock_at. Requires
--                      an extra "buy-in", tracked separately in pool_payments
--                      via the new is_third_place_paid column. The #104
--                      bracket match is NOT part of the bracket (i.e.
--                      consolation_match_enabled is FALSE).
--
-- DEFAULTS / BACKFILL
-- -------------------
-- The migration backfills existing pools so previous behaviour is preserved
-- exactly:
--   - Pools with consolation_match_enabled = TRUE  → consolation_mode = 'bracket'
--   - Pools with consolation_match_enabled = FALSE → consolation_mode = 'none'
--
-- The column default is 'bracket' to match the pre-existing default of
-- consolation_match_enabled = TRUE, so freshly-created pools get the same
-- behaviour as before this migration.
--
-- NEW TABLE: third_place_picks
-- ----------------------------
-- One optional row per pick set when consolation_mode = 'preseason_pick'.
-- Mirrors the per-pick-set granularity used by pool_payments (UNIQUE on
-- pick_set_id). Players insert/update via a server action gated on
-- isGroupPhaseOpen(); admins can edit on a player's behalf via the
-- admin-pick-edit surface.
--
-- NEW COLUMN: pool_payments.is_third_place_paid
-- ---------------------------------------------
-- Independent of is_paid. A player can be marked Paid=true but
-- ThirdPlacePaid=false, or any combination. The admin Payments page only
-- exposes the third-place toggle for pick sets that actually have a
-- third_place_picks row (i.e. the player made the optional selection),
-- so the UI never asks an admin to track payment for a pick that doesn't
-- exist.
--
-- IDEMPOTENCY
-- -----------
-- All ALTER TABLE / CREATE TABLE statements use IF (NOT) EXISTS. The
-- backfill UPDATE is conditional on consolation_mode still being at the
-- default, so re-running after an admin has changed the mode for some
-- pools won't clobber their choice. Trigger drop-and-recreate is also
-- safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New consolation_mode column on pools.
-- ----------------------------------------------------------------------------
-- Default matches the pre-migration default of consolation_match_enabled
-- = TRUE, so freshly-created pools keep getting an in-bracket consolation
-- match unless the admin chooses otherwise.
ALTER TABLE pools
    ADD COLUMN IF NOT EXISTS consolation_mode TEXT NOT NULL DEFAULT 'bracket';

-- Restrict to the three allowed values. Wrapped in a DO block so re-running
-- the migration is a no-op when the constraint already exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pools_consolation_mode_check'
          AND conrelid = 'pools'::regclass
    ) THEN
        ALTER TABLE pools
            ADD CONSTRAINT pools_consolation_mode_check
            CHECK (consolation_mode IN ('none', 'bracket', 'preseason_pick'));
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Backfill consolation_mode from the existing consolation_match_enabled.
--    Only touches rows that are still at the default — once an admin has
--    chosen 'preseason_pick' or explicitly set the value, we don't want a
--    re-run of this migration to clobber that.
--
--    The condition `consolation_mode = 'bracket'` matches both:
--      (a) brand-new rows that picked up the default
--      (b) rows that were already 'bracket'
--    Pools with consolation_match_enabled = FALSE get downgraded to 'none';
--    pools with TRUE keep 'bracket'.
-- ----------------------------------------------------------------------------
UPDATE pools
SET consolation_mode = CASE
    WHEN consolation_match_enabled = TRUE  THEN 'bracket'
    ELSE 'none'
END
WHERE consolation_mode = 'bracket';

-- ----------------------------------------------------------------------------
-- 3. Trigger to keep consolation_match_enabled in sync with consolation_mode.
--
--    Every write to consolation_mode flows through this trigger and
--    overrides consolation_match_enabled to (mode = 'bracket'). The
--    existing callers (bracket-wiring.ts et al) read the boolean and
--    therefore stay correct without any code change.
--
--    We intentionally make consolation_mode the source of truth: if a
--    caller writes ONLY consolation_match_enabled (legacy path), the
--    trigger still fires (BEFORE UPDATE OF either column) and reconciles
--    in the other direction.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pools_sync_consolation_columns_fn()
RETURNS TRIGGER AS $$
BEGIN
    -- If consolation_mode changed (or this is an INSERT), derive the
    -- boolean from the text. consolation_mode is the source of truth.
    IF TG_OP = 'INSERT' OR NEW.consolation_mode IS DISTINCT FROM OLD.consolation_mode THEN
        NEW.consolation_match_enabled := (NEW.consolation_mode = 'bracket');
        RETURN NEW;
    END IF;

    -- Otherwise, only consolation_match_enabled changed — translate that
    -- back into the text mode. The text column has more states than the
    -- boolean does, so an explicit boolean flip can only choose between
    -- 'bracket' (TRUE) and 'none' (FALSE). 'preseason_pick' is only
    -- reachable via an explicit consolation_mode write.
    IF NEW.consolation_match_enabled IS DISTINCT FROM OLD.consolation_match_enabled THEN
        NEW.consolation_mode := CASE
            WHEN NEW.consolation_match_enabled = TRUE THEN 'bracket'
            ELSE 'none'
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pools_sync_consolation_columns ON pools;

CREATE TRIGGER pools_sync_consolation_columns
    BEFORE INSERT OR UPDATE OF consolation_mode, consolation_match_enabled ON pools
    FOR EACH ROW
    EXECUTE FUNCTION pools_sync_consolation_columns_fn();

-- ----------------------------------------------------------------------------
-- 4. third_place_picks table.
--
--    One optional row per pick set. Players make this pick during the
--    Group Phase when consolation_mode = 'preseason_pick'. UNIQUE on
--    pick_set_id gives us upsert-on-pick_set_id semantics with no need
--    for a composite key.
--
--    is_correct is filled in by the same scoring pipeline that grades
--    knockout picks once the tournament resolves a 3rd-place finisher.
--    The application doesn't grade the pick today — that's downstream
--    work. NULL means "ungraded", same convention as knockout_picks.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS third_place_picks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pick_set_id     UUID NOT NULL UNIQUE REFERENCES pick_sets(id) ON DELETE CASCADE,
    picked_team_id  UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    is_correct      BOOLEAN,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot path: "give me the third-place pick for THIS pick set" — the picks
-- form and the read-only summary tile both issue this query on render.
-- UNIQUE on pick_set_id already covers it; the index on picked_team_id
-- helps the (less common) "how many people picked Team X" reports.
CREATE INDEX IF NOT EXISTS idx_third_place_picks_team
    ON third_place_picks(picked_team_id);

-- Keep updated_at fresh on every UPDATE.
CREATE OR REPLACE FUNCTION third_place_picks_touch_updated_at_fn()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS third_place_picks_touch_updated_at ON third_place_picks;

CREATE TRIGGER third_place_picks_touch_updated_at
    BEFORE UPDATE ON third_place_picks
    FOR EACH ROW
    EXECUTE FUNCTION third_place_picks_touch_updated_at_fn();

-- RLS: defense-in-depth only, matches the pattern used by other player-
-- written tables. All real authorization lives in the Next.js layer.
ALTER TABLE third_place_picks ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. pool_payments.is_third_place_paid column.
--
--    Independent of is_paid. The admin Payments page hides the toggle
--    for pick sets that don't have a third_place_picks row, so admins
--    only see the column when it's meaningful. Default false matches
--    the is_paid column's default and the "unpaid" baseline.
-- ----------------------------------------------------------------------------
ALTER TABLE pool_payments
    ADD COLUMN IF NOT EXISTS is_third_place_paid BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 6. PostgREST schema cache reload — after column/table changes the
--    schema cache must be reloaded so the API recognises them. Without
--    this, the first request after migration will fail with "column
--    not found" until the next periodic reload. This NOTIFY is safe to
--    run repeatedly.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
