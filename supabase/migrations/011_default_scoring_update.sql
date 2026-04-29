-- ============================================================================
-- Migration 011: Update default scoring values
-- ============================================================================
--
-- CONTEXT
-- -------
-- The default per-phase point values are bumped to give later rounds more
-- weight. The new schedule is:
--
--   Group Phase   :  2 pts (was 1)
--   Round of 32   :  3 pts (was 2)
--   Round of 16   :  5 pts (was 3)
--   Quarterfinals :  8 pts (was 5)
--   Semifinals    : 12 pts (was 8)
--   Final         : 18 pts (was 13)
--
-- A correct Final pick is now worth 9 group picks (vs 13 before), and a
-- correct Semifinal is worth 6 (vs 8). The whole curve is steeper at the
-- top while keeping a relatively flat shoulder through the early rounds.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- 1. Redefines initialize_pool_scoring() so any pool created from now on
--    picks up the new defaults. New pools are created via the seed-demo
--    script and the setup-pool script, both of which call this function
--    after inserting the pool row.
--
-- 2. Updates scoring_config rows for every existing DEMO pool to the new
--    values. Demo pools are explicitly meant to showcase the canonical
--    pool experience, so they should track the defaults at all times.
--
--    NON-demo pools are LEFT ALONE on purpose — real pool admins may have
--    deliberately tuned their scoring (via the admin → settings page) and
--    silently overwriting their values would be the kind of surprise we
--    really don't want. If you want to push the new defaults into a
--    specific real pool, do it through the admin UI.
--
-- 3. After this migration runs, the seed-demo script can be re-run to
--    cleanly recreate the four demo pools — they'll initialize with the
--    new defaults via the updated function. The UPDATE in step 2 is the
--    safety net for the case where the migration is applied without an
--    immediate re-seed.
-- ============================================================================

-- 1. Redefine initialize_pool_scoring with the new defaults
CREATE OR REPLACE FUNCTION initialize_pool_scoring(p_pool_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO scoring_config (pool_id, phase, points) VALUES
        (p_pool_id, 'group', 2),
        (p_pool_id, 'r32', 3),
        (p_pool_id, 'r16', 5),
        (p_pool_id, 'qf', 8),
        (p_pool_id, 'sf', 12),
        (p_pool_id, 'final', 18)
    ON CONFLICT (pool_id, phase) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 2. Update existing demo pools to the new defaults.
--
-- We use a single CASE-driven UPDATE so it's one statement per phase row
-- rather than six per pool. Joining through the pools table on is_demo is
-- the gate that prevents touching real-pool scoring.
UPDATE scoring_config sc
SET points = CASE sc.phase
    WHEN 'group' THEN 2
    WHEN 'r32'   THEN 3
    WHEN 'r16'   THEN 5
    WHEN 'qf'    THEN 8
    WHEN 'sf'    THEN 12
    WHEN 'final' THEN 18
END
FROM pools p
WHERE sc.pool_id = p.id
  AND p.is_demo = TRUE;
