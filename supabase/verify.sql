-- ============================================================================
-- World Cup Pick'em — Post-Migration Verification
-- Run this after applying all migrations to confirm data integrity.
-- Paste into the Supabase SQL Editor and run.
-- ============================================================================

-- 1. Tournament
SELECT '1. Tournament' AS check,
       count(*) AS count,
       CASE WHEN count(*) = 1 THEN '✅' ELSE '❌' END AS status
FROM tournaments;

-- 2. Groups (should be 12)
SELECT '2. Groups' AS check,
       count(*) AS count,
       CASE WHEN count(*) = 12 THEN '✅' ELSE '❌' END AS status
FROM groups WHERE pool_id IS NULL;

-- 3. Teams (should be 48)
SELECT '3. Teams' AS check,
       count(*) AS count,
       CASE WHEN count(*) = 48 THEN '✅' ELSE '❌' END AS status
FROM teams WHERE pool_id IS NULL;

-- 4. Teams per group (should be 4 each)
SELECT '4. Teams/group' AS check,
       g.name,
       count(t.id) AS team_count,
       CASE WHEN count(t.id) = 4 THEN '✅' ELSE '❌' END AS status
FROM groups g
LEFT JOIN teams t ON t.group_id = g.id AND t.pool_id IS NULL
WHERE g.pool_id IS NULL
GROUP BY g.id, g.name
ORDER BY g.letter;

-- 5. Group matches (should be 72)
SELECT '5. Group matches' AS check,
       count(*) AS count,
       CASE WHEN count(*) = 72 THEN '✅' ELSE '❌' END AS status
FROM matches WHERE phase = 'group' AND pool_id IS NULL;

-- 6. Matches per group (should be 6 each)
SELECT '6. Matches/group' AS check,
       g.name,
       count(m.id) AS match_count,
       CASE WHEN count(m.id) = 6 THEN '✅' ELSE '❌' END AS status
FROM groups g
LEFT JOIN matches m ON m.group_id = g.id AND m.pool_id IS NULL
WHERE g.pool_id IS NULL
GROUP BY g.id, g.name
ORDER BY g.letter;

-- 7. Knockout matches (should be 31: 16+8+4+2+1)
SELECT '7. Knockout matches' AS check,
       phase,
       count(*) AS count
FROM matches
WHERE phase != 'group' AND pool_id IS NULL
GROUP BY phase
ORDER BY min(match_number);

-- 8. Total matches (should be 103)
SELECT '8. Total matches' AS check,
       count(*) AS count,
       CASE WHEN count(*) = 103 THEN '✅' ELSE '❌' END AS status
FROM matches WHERE pool_id IS NULL;

-- 9. All group matches have both teams assigned
SELECT '9. Group matches have teams' AS check,
       count(*) FILTER (WHERE home_team_id IS NOT NULL AND away_team_id IS NOT NULL) AS with_teams,
       count(*) FILTER (WHERE home_team_id IS NULL OR away_team_id IS NULL) AS missing_teams,
       CASE WHEN count(*) FILTER (WHERE home_team_id IS NULL OR away_team_id IS NULL) = 0
            THEN '✅' ELSE '❌' END AS status
FROM matches WHERE phase = 'group' AND pool_id IS NULL;

-- 10. All knockout matches have NULL teams (placeholders)
SELECT '10. Knockout placeholders' AS check,
       count(*) FILTER (WHERE home_team_id IS NULL AND away_team_id IS NULL) AS null_teams,
       count(*) FILTER (WHERE home_team_id IS NOT NULL OR away_team_id IS NOT NULL) AS assigned_teams,
       CASE WHEN count(*) FILTER (WHERE home_team_id IS NOT NULL OR away_team_id IS NOT NULL) = 0
            THEN '✅' ELSE '❌' END AS status
FROM matches WHERE phase != 'group' AND pool_id IS NULL;

-- 11. Flag codes that might not work on FlagCDN (UK subdivisions)
SELECT '11. UK flag codes' AS check,
       name, short_code, flag_code,
       CASE WHEN flag_code IN ('gb-eng', 'gb-wls', 'gb-sct')
            THEN '⚠️ UK subdivision — verify FlagCDN support'
            ELSE '✅' END AS note
FROM teams
WHERE flag_code LIKE 'gb-%' AND pool_id IS NULL;

-- 12. No duplicate match numbers
SELECT '12. Unique match numbers' AS check,
       count(*) AS total,
       count(DISTINCT match_number) AS unique_numbers,
       CASE WHEN count(*) = count(DISTINCT match_number) THEN '✅' ELSE '❌' END AS status
FROM matches WHERE pool_id IS NULL;

-- 13. DB functions exist
SELECT '13. Functions' AS check,
       routine_name,
       '✅' AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'initialize_pool_scoring',
    'get_tournament_pool_id',
    'calculate_standings',
    'cleanup_expired_sessions',
    'cleanup_expired_otps',
    'update_updated_at',
    'prevent_audit_log_mutation'
  )
ORDER BY routine_name;

-- 14. RLS is enabled on all tables
SELECT '14. RLS enabled' AS check,
       tablename,
       CASE WHEN rowsecurity THEN '✅' ELSE '❌' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'tournaments', 'groups', 'teams', 'matches', 'pools',
    'participants', 'pool_memberships', 'pick_sets',
    'group_picks', 'knockout_picks', 'scoring_config',
    'pool_whitelist', 'otp_requests', 'sessions', 'audit_log'
  )
ORDER BY tablename;
