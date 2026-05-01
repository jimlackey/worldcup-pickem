-- ============================================================================
-- Migration 013: Add Consolation (3rd-place) Match support
-- ============================================================================
--
-- CONTEXT
-- -------
-- The 2026 World Cup includes a third-place / consolation match contested
-- between the two losing semifinalists. Until now the app only modeled the
-- 31 "championship" knockout slots (R32 → Final). This migration adds:
--
--   1. A new `match_phase` enum value: 'consolation'
--   2. A new `pools.consolation_match_enabled` boolean column (default TRUE)
--   3. Global match slot #104 with phase 'consolation' for the canonical
--      tournament data (pool_id IS NULL).
--   4. The same #104 row, copied per-demo-pool so demo brackets stay
--      consistent with their own scoped tournament data.
--   5. A scoring_config entry for the new phase, equal to the QF value
--      (8 pts default) so a correct consolation pick scores the same
--      as a correct quarterfinal.
--   6. Updated initialize_pool_scoring() so any future pool gets the new
--      phase row from the start.
--
-- WHY THE MATCH ALWAYS EXISTS IN THE DB
-- -------------------------------------
-- Whether the consolation match is *active* in a pool is governed by the
-- new `consolation_match_enabled` boolean. The match row itself is created
-- unconditionally so:
--   - Toggling the pool flag back ON doesn't require re-creating data.
--   - Existing knockout_picks rows continue to FK-resolve cleanly even if
--     a pool admin toggles the flag off and on again.
-- Pages, queries, and rendering layers filter the row out of view when
-- the pool's flag is FALSE.
--
-- DEFAULT IS ON
-- -------------
-- Per the spec, new and existing pools default to consolation_match_enabled
-- = TRUE. Admins who don't want the match opt out via the settings page.
--
-- NO-OP IF MATCH ALREADY EXISTS
-- -----------------------------
-- The INSERTs use NOT EXISTS / DO NOTHING to be safe to re-run against a
-- partially migrated DB.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend the match_phase enum.
-- ----------------------------------------------------------------------------
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction in older
-- Postgres versions; Supabase's migration runner handles each statement
-- independently, so this is fine standalone.
ALTER TYPE match_phase ADD VALUE IF NOT EXISTS 'consolation';

-- ----------------------------------------------------------------------------
-- 2. New pools column.
-- ----------------------------------------------------------------------------
ALTER TABLE pools
    ADD COLUMN IF NOT EXISTS consolation_match_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ----------------------------------------------------------------------------
-- 3. Insert the global consolation match slot (pool_id IS NULL).
--    Match #104 sits after the Final (#103) and is fed by the LOSERS of
--    the two semifinals (#101, #102). Teams stay NULL until a pool admin
--    enters semifinal results, at which point the app auto-advances both
--    the winner (to the Final) and the loser (to the Consolation match).
-- ----------------------------------------------------------------------------
INSERT INTO matches
    (tournament_id, pool_id, phase, match_number, status, label)
SELECT
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'consolation'::match_phase,
    104,
    'scheduled'::match_status,
    'Consolation'
WHERE NOT EXISTS (
    SELECT 1 FROM matches
    WHERE pool_id IS NULL
      AND match_number = 104
);

-- ----------------------------------------------------------------------------
-- 4. Insert a consolation slot for every existing demo pool. Demo pools
--    have their own pool-scoped copy of teams/groups/matches, so they
--    need their own row. Real (non-demo) pools share the global row from
--    step 3 — adding rows for them would silently double-count.
-- ----------------------------------------------------------------------------
INSERT INTO matches
    (tournament_id, pool_id, phase, match_number, status, label)
SELECT
    '00000000-0000-0000-0000-000000000001',
    p.id,
    'consolation'::match_phase,
    104,
    'scheduled'::match_status,
    'Consolation'
FROM pools p
WHERE p.is_demo = TRUE
  AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.pool_id = p.id
          AND m.match_number = 104
  );

-- ----------------------------------------------------------------------------
-- 5. Add scoring_config rows for the new phase on every existing pool.
--    Default value matches QF (8 pts) — a correct consolation pick is
--    worth the same as a correct QF pick. Admins who want to tune it
--    differently can do so from /{slug}/admin/settings → Scoring.
-- ----------------------------------------------------------------------------
INSERT INTO scoring_config (pool_id, phase, points)
SELECT p.id, 'consolation'::match_phase, 8
FROM pools p
ON CONFLICT (pool_id, phase) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Redefine initialize_pool_scoring() so newly-created pools get the
--    consolation phase row up front. Mirrors the structure introduced in
--    migration 011 — same point values for existing phases, with the
--    addition of consolation = 8.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION initialize_pool_scoring(p_pool_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO scoring_config (pool_id, phase, points) VALUES
        (p_pool_id, 'group', 2),
        (p_pool_id, 'r32', 3),
        (p_pool_id, 'r16', 5),
        (p_pool_id, 'qf', 8),
        (p_pool_id, 'sf', 12),
        (p_pool_id, 'final', 18),
        (p_pool_id, 'consolation', 8)
    ON CONFLICT (pool_id, phase) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
