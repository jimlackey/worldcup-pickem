-- ============================================================================
-- supabase/verify.sql
-- ============================================================================
-- Sanity checks for the tournament data after migrations and seeds run.
-- Run this manually against any environment to confirm the schema and data
-- look right.
--
-- Updated post-migration 013 to expect the consolation match (match #104).
-- Total knockout matches is now 32 (16 R32 + 8 R16 + 4 QF + 2 SF + 1 Final
-- + 1 Consolation), and total matches across the tournament is 104
-- (72 group + 32 knockout) instead of the previous 103.
-- ============================================================================

-- 1. Tournament exists
SELECT 'tournament' AS check, COUNT(*) AS count
FROM tournaments
WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: 1

-- 2. Groups
SELECT 'groups' AS check, COUNT(*) AS count FROM groups WHERE pool_id IS NULL;
-- Expected: 12

-- 3. Teams
SELECT 'teams' AS check, COUNT(*) AS count FROM teams WHERE pool_id IS NULL;
-- Expected: 48

-- 4. Group matches
SELECT 'group matches' AS check, COUNT(*) AS count
FROM matches
WHERE pool_id IS NULL AND phase = 'group';
-- Expected: 72

-- 5. Knockout matches (now includes the consolation match)
SELECT 'knockout matches' AS check, COUNT(*) AS count
FROM matches
WHERE pool_id IS NULL AND phase != 'group';
-- Expected: 32

-- 6. Each knockout phase has the right count
SELECT phase, COUNT(*) AS count
FROM matches
WHERE pool_id IS NULL AND phase != 'group'
GROUP BY phase
ORDER BY
  CASE phase
    WHEN 'r32' THEN 1
    WHEN 'r16' THEN 2
    WHEN 'qf'  THEN 3
    WHEN 'sf'  THEN 4
    WHEN 'final' THEN 5
    WHEN 'consolation' THEN 6
  END;
-- Expected:
--   r32         16
--   r16          8
--   qf           4
--   sf           2
--   final        1
--   consolation  1

-- 7. All knockout phases use only the expected enum values
SELECT 'unexpected phase values' AS check, COUNT(*) AS count
FROM matches
WHERE pool_id IS NULL
  AND phase NOT IN ('group', 'r32', 'r16', 'qf', 'sf', 'final', 'consolation');
-- Expected: 0

-- 8. Total matches across the tournament
SELECT 'total matches' AS check, COUNT(*) AS count
FROM matches
WHERE pool_id IS NULL;
-- Expected: 104  (was 103 pre-migration 013)

-- 9. Consolation match specifics — should exist exactly once globally,
--    have match_number = 104, label "Consolation", and no teams assigned
--    yet (teams come from semifinal losers post-tournament).
SELECT
  'consolation match' AS check,
  COUNT(*) AS count,
  MIN(match_number) AS match_number,
  MIN(label) AS label,
  COUNT(*) FILTER (WHERE home_team_id IS NULL AND away_team_id IS NULL) AS empty_slots
FROM matches
WHERE pool_id IS NULL AND phase = 'consolation';
-- Expected: count=1, match_number=104, label="Consolation", empty_slots=1

-- 10. Knockout placeholder teams (for non-R32 matches that haven't been wired).
--     Includes consolation since #104 also has TBD slots until SF results
--     are entered. Excludes group matches and R32 (which always have admin-
--     assigned teams).
SELECT 'knockout placeholders' AS check, COUNT(*) AS count
FROM matches
WHERE pool_id IS NULL
  AND phase != 'group'
  AND phase != 'r32'
  AND home_team_id IS NULL
  AND away_team_id IS NULL;
-- Expected: 16  (8 R16 + 4 QF + 2 SF + 1 Final + 1 Consolation)

-- 11. Pools have the consolation_match_enabled column
SELECT 'pools.consolation_match_enabled column' AS check, COUNT(*) AS count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pools'
  AND column_name = 'consolation_match_enabled';
-- Expected: 1

-- 12. Default value for consolation_match_enabled is TRUE on existing pools.
--     If you've explicitly disabled it on some pools this will be lower —
--     adjust expected count to fit your fleet.
SELECT
  'pools with consolation enabled' AS check,
  COUNT(*) FILTER (WHERE consolation_match_enabled = TRUE) AS enabled,
  COUNT(*) FILTER (WHERE consolation_match_enabled = FALSE) AS disabled,
  COUNT(*) AS total
FROM pools;
-- Expected on a fresh setup: enabled = total, disabled = 0
