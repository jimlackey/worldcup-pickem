-- ============================================================================
-- Migration 016: Extend FIFA rankings seed to demo-pool team rows
-- ============================================================================
--
-- WHY
-- ---
-- Migration 015 only updated GLOBAL team rows (teams.pool_id IS NULL),
-- which is what real pools read from. Demo pools have their own private
-- copies of the teams table (teams.pool_id = <pool.id>) and those copies
-- weren't touched by 015 — so a demo pool admin who enables
-- show_fifa_rankings sees no badges, because every team in their pool
-- has fifa_ranking = NULL.
--
-- This migration fixes that by copying the freshly-seeded ranking from
-- each global team to every matching demo-pool team. "Matching" means
-- same `short_code` within the same tournament — short codes are stable
-- 3-letter ISO-ish identifiers (ARG, BRA, USA, ...) so they're the
-- safest cross-pool join key.
--
-- POSTGRES UPDATE...FROM CAVEAT
-- -----------------------------
-- In an UPDATE statement, the target table can't be referenced from
-- joins inside the FROM clause — you can only list other tables in
-- FROM and reference them from the SET / WHERE. So the pools filter
-- (limiting writes to demo-pool team rows) lives in the WHERE clause,
-- using an EXISTS subquery against pools.
--
-- SCOPE
-- -----
-- Only updates teams in demo pools (pools.is_demo = TRUE). Real pools
-- read from the global rows directly and were already covered by
-- migration 015.
--
-- IDEMPOTENT
-- ----------
-- Re-running is a no-op for rows whose value already matches the
-- global source. Writes are quiet (no audit entries — this is a data
-- migration, not an admin action).
-- ============================================================================

DO $$
DECLARE
    updated_count INT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'teams' AND column_name = 'fifa_ranking'
    ) THEN
        RAISE NOTICE 'Skipping demo-pool rankings seed — teams.fifa_ranking column not present. Run migration 014 first.';
        RETURN;
    END IF;

    -- Copy global rankings to every demo-pool team row that shares a
    -- short_code with a global team.
    --
    -- Target is `teams demo` (the UPDATE target — implicit in the
    -- statement). `teams global` is in the FROM clause as the source of
    -- the new value. The pools filter goes in the WHERE clause as an
    -- EXISTS subquery rather than a join, because UPDATE...FROM forbids
    -- joining the target table from inside the FROM.
    UPDATE teams AS demo
    SET fifa_ranking = global.fifa_ranking
    FROM teams AS global
    WHERE demo.pool_id IS NOT NULL
      AND global.pool_id IS NULL
      AND demo.short_code = global.short_code
      AND demo.tournament_id = global.tournament_id
      AND global.fifa_ranking IS NOT NULL
      AND (demo.fifa_ranking IS NULL OR demo.fifa_ranking <> global.fifa_ranking)
      AND EXISTS (
          SELECT 1
          FROM pools p
          WHERE p.id = demo.pool_id
            AND p.is_demo = TRUE
      );

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RAISE NOTICE 'Demo-pool rankings seed: % team row(s) updated.', updated_count;

    -- Coverage check across demo pools.
    DECLARE
        ranked INT;
        total INT;
    BEGIN
        SELECT
            COUNT(*) FILTER (WHERE t.fifa_ranking IS NOT NULL),
            COUNT(*)
        INTO ranked, total
        FROM teams t
        INNER JOIN pools p ON p.id = t.pool_id AND p.is_demo = TRUE;

        RAISE NOTICE 'Demo-pool teams now ranked: % of %.', ranked, total;
    END;
END $$;
