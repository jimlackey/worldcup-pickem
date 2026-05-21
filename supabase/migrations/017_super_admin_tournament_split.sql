-- ============================================================================
-- Migration 017: Clear leftover team assignments from global knockout slots
-- ============================================================================
--
-- WHY
-- ---
-- Before this migration, the pool-admin /knockout-setup page wrote team
-- IDs through a server action (assignKnockoutTeamsAction) that didn't
-- scope its UPDATE to pool-owned rows. For real pools whose matches read
-- from the global tournament table (pool_id IS NULL), this caused the
-- writes to land on the GLOBAL match rows by accident — polluting the
-- canonical tournament data with team assignments that should only live
-- inside whichever pool's bracket is being configured.
--
-- The fallout: /super-admin/lines was showing real teams in R32 slots
-- before any group-stage results had been entered, because somewhere
-- along the way a real-pool admin used the knockout-setup page and the
-- write landed on the global row.
--
-- The pool-admin actions are now constrained to write only to pool-scoped
-- rows, and the new /super-admin/tournament/knockout-setup page is the
-- single source of truth for global team assignments. This migration
-- cleans up the historical contamination so /super-admin/lines, the
-- public Matches view for real pools, and the bracket viewer all start
-- from a clean state.
--
-- SCOPE
-- -----
-- Only touches global knockout rows: matches.pool_id IS NULL AND
-- phase != 'group'. Group matches are NOT touched (their team
-- assignments are the actual tournament fixtures — see migration 002).
--
-- Score data (home_score, away_score, result, status) is also cleared
-- on the same rows for consistency — if a real-pool admin had entered a
-- score on the polluted row, that score was meaningless too.
--
-- IDEMPOTENT
-- ----------
-- Re-running is a no-op. Knockout rows that already have NULL teams stay
-- NULL.
-- ============================================================================

DO $$
DECLARE
    cleared_count INT;
BEGIN
    UPDATE matches
    SET
        home_team_id = NULL,
        away_team_id = NULL,
        home_score   = NULL,
        away_score   = NULL,
        result       = NULL,
        status       = 'scheduled'
    WHERE pool_id IS NULL
      AND phase != 'group'
      AND (
            home_team_id IS NOT NULL
         OR away_team_id IS NOT NULL
         OR home_score IS NOT NULL
         OR away_score IS NOT NULL
         OR result IS NOT NULL
         OR status != 'scheduled'
      );

    GET DIAGNOSTICS cleared_count = ROW_COUNT;
    RAISE NOTICE 'Global knockout cleanup: % row(s) cleared.', cleared_count;
END $$;

-- ============================================================================
-- Migration 017 (cont.): Force show_match_lines = FALSE for demo pools
-- ============================================================================
--
-- WHY
-- ---
-- Lines are now a global-only feature (managed at /super-admin/lines).
-- Demo pools have their own pool-scoped match rows whose team
-- assignments may diverge from the real tournament — so propagating
-- global lines into demo pools would attach line values to the wrong
-- fixtures. Going forward, lines simply don't render on demo pools.
--
-- This migration force-disables the flag on every demo pool so any
-- previously-enabled flag stops surfacing leftover line data on the
-- picks form. The toggle is also hidden from the pool-admin settings
-- page for demo pools (in app code), so admins can't re-enable it.
-- ============================================================================

DO $$
DECLARE
    disabled_count INT;
BEGIN
    UPDATE pools
    SET show_match_lines = FALSE
    WHERE is_demo = TRUE
      AND show_match_lines = TRUE;

    GET DIAGNOSTICS disabled_count = ROW_COUNT;
    RAISE NOTICE 'Demo pool line-display flag: % pool(s) force-disabled.', disabled_count;
END $$;

-- ============================================================================
-- Migration 017 (cont.): Clear money lines on demo-pool match rows
-- ============================================================================
--
-- WHY
-- ---
-- Earlier work (migration 016 + writeLinesGlobalAndDemos sync helper)
-- propagated lines into demo-pool match rows. With lines now strictly a
-- real-pool feature, those propagated values are stale data taking up
-- DB space. Clearing them keeps the schema honest — a demo-pool match
-- row has no line data, ever.
-- ============================================================================

DO $$
DECLARE
    nulled_count INT;
BEGIN
    UPDATE matches m
    SET
        home_money_line = NULL,
        draw_money_line = NULL,
        away_money_line = NULL
    FROM pools p
    WHERE m.pool_id = p.id
      AND p.is_demo = TRUE
      AND (
            m.home_money_line IS NOT NULL
         OR m.draw_money_line IS NOT NULL
         OR m.away_money_line IS NOT NULL
      );

    GET DIAGNOSTICS nulled_count = ROW_COUNT;
    RAISE NOTICE 'Demo-pool line cleanup: % match row(s) nulled.', nulled_count;
END $$;
