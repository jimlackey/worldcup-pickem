-- ============================================================================
-- Migration 012: Backfill default tournament dates on real pools
-- ============================================================================
--
-- CONTEXT
-- -------
-- Until now, real pools were created without any tournament dates set —
-- both the setup-pool.ts CLI and the super-admin "Create Pool" form left
-- group_lock_at, knockout_open_at, and knockout_lock_at as NULL, on the
-- assumption that pool admins would fill them in via /{slug}/admin/settings.
-- That assumption created friction: a brand-new pool sits with no
-- deadlines, so isGroupPhaseOpen() falls back to "always open" and there's
-- no signal to players that anything is scheduled.
--
-- Going forward, both pool-creation paths pre-fill these three columns
-- with the canonical 2026 defaults defined in
-- src/lib/utils/constants.ts (DEFAULT_POOL_DATES) and mirrored in
-- scripts/setup-pool.ts.
--
-- THE THREE DEFAULTS (UTC ISO; June 2026 is PDT, UTC-7)
-- ------------------------------------------------------
--   group_lock_at     = 2026-06-11 13:00 PT  =  2026-06-11T20:00:00Z
--   knockout_open_at  = 2026-06-27 21:00 PT  =  2026-06-28T04:00:00Z
--   knockout_lock_at  = 2026-06-29 09:00 PT  =  2026-06-29T16:00:00Z
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- For every NON-demo, ACTIVE pool, set any of the three date columns that
-- is currently NULL to the canonical default. Columns already populated by
-- a pool admin are left alone — the COALESCE-via-CASE pattern below only
-- writes when the existing value is NULL.
--
-- DEMO POOLS ARE EXCLUDED
-- -----------------------
-- The four demo pools have hand-picked dates in scripts/seed-demo.ts that
-- drive each demo into a specific tournament phase (picks open / group
-- live / knockout picking / knockout live). Backfilling defaults on top of
-- those would break the demos. is_demo = TRUE is filtered out.
--
-- INACTIVE POOLS ARE EXCLUDED
-- ---------------------------
-- is_active = FALSE pools are ignored by the rest of the app; no need to
-- touch them.
-- ============================================================================

UPDATE pools
SET
    group_lock_at    = COALESCE(group_lock_at,    TIMESTAMPTZ '2026-06-11T20:00:00Z'),
    knockout_open_at = COALESCE(knockout_open_at, TIMESTAMPTZ '2026-06-28T04:00:00Z'),
    knockout_lock_at = COALESCE(knockout_lock_at, TIMESTAMPTZ '2026-06-29T16:00:00Z')
WHERE is_demo = FALSE
  AND is_active = TRUE
  AND (
        group_lock_at    IS NULL
     OR knockout_open_at IS NULL
     OR knockout_lock_at IS NULL
  );
