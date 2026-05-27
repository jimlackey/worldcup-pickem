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
--
-- Updated post-migration 024 to add checks for:
--   - the new pools.consolation_mode text column
--   - the third_place_picks table
--   - the new pool_payments.is_third_place_paid column
-- See the dedicated section starting at check 13.
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

-- ============================================================================
-- Migration 024 — consolation_mode + third_place_picks + 3rd-place paid
-- ============================================================================

-- 13. Pools.consolation_mode column exists and uses the expected text type
SELECT 'pools.consolation_mode column' AS check, COUNT(*) AS count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pools'
  AND column_name = 'consolation_mode'
  AND data_type = 'text';
-- Expected: 1

-- 14. Every pool has a valid consolation_mode (CHECK constraint enforces
--     this, but defense in depth — verify no rows escaped the constraint).
SELECT
  'consolation_mode distribution' AS check,
  COUNT(*) FILTER (WHERE consolation_mode = 'none') AS none,
  COUNT(*) FILTER (WHERE consolation_mode = 'bracket') AS bracket,
  COUNT(*) FILTER (WHERE consolation_mode = 'preseason_pick') AS preseason_pick,
  COUNT(*) FILTER (
    WHERE consolation_mode NOT IN ('none', 'bracket', 'preseason_pick')
  ) AS invalid,
  COUNT(*) AS total
FROM pools;
-- Expected: invalid = 0; everything else sums to total. On a fresh
-- post-migration setup most pools should be 'bracket' (the default).

-- 15. Trigger keeps consolation_match_enabled in sync with consolation_mode.
--     Every pool must satisfy: consolation_match_enabled = (mode = 'bracket').
SELECT 'consolation columns out of sync' AS check, COUNT(*) AS count
FROM pools
WHERE consolation_match_enabled <> (consolation_mode = 'bracket');
-- Expected: 0

-- 16. third_place_picks table exists.
SELECT 'third_place_picks table' AS check, COUNT(*) AS count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'third_place_picks';
-- Expected: 1

-- 17. third_place_picks has at most one row per pick set (the UNIQUE
--     constraint guarantees this — verify no anomalies).
SELECT 'duplicate third_place_picks per pick_set' AS check, COUNT(*) AS count
FROM (
  SELECT pick_set_id
  FROM third_place_picks
  GROUP BY pick_set_id
  HAVING COUNT(*) > 1
) dups;
-- Expected: 0

-- 18. pool_payments.is_third_place_paid column exists.
SELECT 'pool_payments.is_third_place_paid column' AS check, COUNT(*) AS count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pool_payments'
  AND column_name = 'is_third_place_paid';
-- Expected: 1

-- 19. Default value for is_third_place_paid is FALSE on existing rows.
SELECT
  'pool_payments 3rd-place paid distribution' AS check,
  COUNT(*) FILTER (WHERE is_third_place_paid = TRUE) AS paid,
  COUNT(*) FILTER (WHERE is_third_place_paid = FALSE) AS unpaid,
  COUNT(*) AS total
FROM pool_payments;
-- Expected on a fresh setup: paid = 0, unpaid = total

-- ============================================================================
-- Migration 025 — payment config (entry/consolation fees + payout grid)
-- ============================================================================

-- 20. New fee columns + winner count column exist on pools.
SELECT 'pools payment config columns' AS check, COUNT(*) AS count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pools'
  AND column_name IN (
    'entry_fee_cents',
    'consolation_fee_cents',
    'payout_winner_count'
  );
-- Expected: 3

-- 21. Defaults applied to existing pools. Fresh post-migration setup
--     gets $20 entry / $5 consolation / 0 winners.
SELECT
  'pools default fees' AS check,
  COUNT(*) FILTER (WHERE entry_fee_cents = 2000) AS default_entry,
  COUNT(*) FILTER (WHERE consolation_fee_cents = 500) AS default_consolation,
  COUNT(*) FILTER (WHERE payout_winner_count = 0) AS no_payout_count,
  COUNT(*) AS total
FROM pools;
-- Expected on a fresh setup: each *_count = total (none have been
-- edited yet).

-- 22. CHECK constraints are in place — non-negative fees, winner
--     count 0..10.
SELECT 'pools.entry_fee_cents check constraint' AS check, COUNT(*) AS count
FROM pg_constraint
WHERE conname = 'pools_entry_fee_cents_check';
-- Expected: 1

SELECT 'pools.payout_winner_count check constraint' AS check, COUNT(*) AS count
FROM pg_constraint
WHERE conname = 'pools_payout_winner_count_check';
-- Expected: 1

-- 23. pool_payouts table exists with the right primary key.
SELECT 'pool_payouts table' AS check, COUNT(*) AS count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'pool_payouts';
-- Expected: 1

-- 24. For every pool with payout_winner_count > 0, the corresponding
--     pool_payouts rows exist and their percents sum to 100. Pools
--     with payout_winner_count = 0 should have zero rows. This is the
--     invariant the app maintains at every save — verify nothing
--     drifted.
SELECT
  'pools with bad payout schedule' AS check,
  COUNT(*) AS count
FROM pools p
LEFT JOIN (
  SELECT pool_id, COUNT(*) AS row_count, SUM(percent) AS percent_sum
  FROM pool_payouts
  GROUP BY pool_id
) agg ON agg.pool_id = p.id
WHERE
  (p.payout_winner_count = 0 AND COALESCE(agg.row_count, 0) <> 0)
  OR
  (p.payout_winner_count > 0
    AND (
      COALESCE(agg.row_count, 0) <> p.payout_winner_count
      OR COALESCE(agg.percent_sum, 0) <> 100
    ));
-- Expected: 0
