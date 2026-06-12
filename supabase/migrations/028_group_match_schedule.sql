-- ============================================================================
-- Migration 028: persist scheduled date/time for the 72 group-stage matches
-- ============================================================================
--
-- CONTEXT
-- -------
-- A follow-up feature needs to know the kickoff date/time of each match.
-- The matches.scheduled_at column (TIMESTAMPTZ, present since the initial
-- schema) already exists; this migration writes the authoritative kickoff
-- times for every REAL group-stage match from the admin-provided schedule.
--
-- The source schedule was given in Pacific Time. Pacific is UTC-7 during
-- the tournament (PDT / daylight saving, June-July 2026), so each value
-- below is stored as the equivalent UTC instant. The original PT value is
-- preserved in the trailing comment on each row for human auditing.
--
-- LIVE-DATA SAFETY
-- ----------------
-- The pool is live. This migration is written to be safe to run against
-- production:
--
--   * Wrapped in an explicit transaction (BEGIN ... COMMIT). If ANY check
--     in the verification block fails, RAISE EXCEPTION aborts the
--     transaction and Postgres rolls back every change — the table is left
--     exactly as it was.
--   * Touches ONLY the scheduled_at column. Scores, results, status, and
--     every other column are never referenced, so completed/in-progress
--     matches keep their outcomes untouched.
--   * Scoped to real matches only (pool_id IS NULL). Demo pools keep their
--     own independently-seeded copies.
--   * Matches each row by (home_team, away_team) within the group phase —
--     NOT by match_number or row position. The provided schedule's order
--     differs from the seeded match_number order in several places, so a
--     positional update would corrupt the data. Team-pair matching has
--     been verified to be an exact bijection onto the 72 group matches.
--   * Idempotent: re-running sets the same 72 values and re-passes every
--     check, so it is safe to apply more than once.
--
-- WHAT TO EXPECT
-- --------------
-- On success: "Migration 028 OK: updated 72 group match schedules." and the
-- transaction commits. On any mismatch (a team pair that doesn't resolve, a
-- row that matches zero or multiple matches, or a final count != 72) the
-- migration raises and rolls back with a descriptive message; nothing is
-- changed and you can investigate before retrying.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    t_id UUID := '00000000-0000-0000-0000-000000000001';
    rec RECORD;
    home_id UUID;
    away_id UUID;
    n_matched INT;
    total_updated INT := 0;
    expected_rows INT;
BEGIN
    -- Staging table of the authoritative schedule, keyed by team NAMES as
    -- they exist in the real (pool_id IS NULL) teams table. Names here are
    -- already normalised to the canonical DB spellings (e.g. "Korea
    -- Republic", "United States", "Türkiye", "Curaçao", "DR Congo",
    -- "Bosnia and Herzegovina"); the trailing comment shows the original
    -- label and the Pacific-Time kickoff for auditing.
    CREATE TEMP TABLE _sched (
        home_name  TEXT NOT NULL,
        away_name  TEXT NOT NULL,
        kickoff    TIMESTAMPTZ NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _sched (home_name, away_name, kickoff) VALUES
        ('Mexico', 'South Africa', TIMESTAMPTZ '2026-06-11T19:00:00Z'),  -- Mexico v South Africa @ 2026-06-11 12:00 PM PT
        ('Korea Republic', 'Czechia', TIMESTAMPTZ '2026-06-12T02:00:00Z'),  -- South Korea v Czechia @ 2026-06-11 07:00 PM PT
        ('Canada', 'Bosnia and Herzegovina', TIMESTAMPTZ '2026-06-12T19:00:00Z'),  -- Canada v Bosnia & Herz. @ 2026-06-12 12:00 PM PT
        ('United States', 'Paraguay', TIMESTAMPTZ '2026-06-13T01:00:00Z'),  -- USA v Paraguay @ 2026-06-12 06:00 PM PT
        ('Qatar', 'Switzerland', TIMESTAMPTZ '2026-06-13T19:00:00Z'),  -- Qatar v Switzerland @ 2026-06-13 12:00 PM PT
        ('Brazil', 'Morocco', TIMESTAMPTZ '2026-06-13T22:00:00Z'),  -- Brazil v Morocco @ 2026-06-13 03:00 PM PT
        ('Haiti', 'Scotland', TIMESTAMPTZ '2026-06-14T01:00:00Z'),  -- Haiti v Scotland @ 2026-06-13 06:00 PM PT
        ('Australia', 'Türkiye', TIMESTAMPTZ '2026-06-14T04:00:00Z'),  -- Australia v Turkiye @ 2026-06-13 09:00 PM PT
        ('Germany', 'Curaçao', TIMESTAMPTZ '2026-06-14T17:00:00Z'),  -- Germany v Curacao @ 2026-06-14 10:00 AM PT
        ('Netherlands', 'Japan', TIMESTAMPTZ '2026-06-14T20:00:00Z'),  -- Netherlands v Japan @ 2026-06-14 01:00 PM PT
        ('Ivory Coast', 'Ecuador', TIMESTAMPTZ '2026-06-14T23:00:00Z'),  -- Ivory Coast v Ecuador @ 2026-06-14 04:00 PM PT
        ('Sweden', 'Tunisia', TIMESTAMPTZ '2026-06-15T02:00:00Z'),  -- Sweden v Tunisia @ 2026-06-14 07:00 PM PT
        ('Spain', 'Cape Verde', TIMESTAMPTZ '2026-06-15T16:00:00Z'),  -- Spain v Cape Verde @ 2026-06-15 09:00 AM PT
        ('Belgium', 'Egypt', TIMESTAMPTZ '2026-06-15T19:00:00Z'),  -- Belgium v Egypt @ 2026-06-15 12:00 PM PT
        ('Saudi Arabia', 'Uruguay', TIMESTAMPTZ '2026-06-15T22:00:00Z'),  -- Saudi Arabia v Uruguay @ 2026-06-15 03:00 PM PT
        ('Iran', 'New Zealand', TIMESTAMPTZ '2026-06-16T01:00:00Z'),  -- Iran v New Zealand @ 2026-06-15 06:00 PM PT
        ('France', 'Senegal', TIMESTAMPTZ '2026-06-16T19:00:00Z'),  -- France v Senegal @ 2026-06-16 12:00 PM PT
        ('Iraq', 'Norway', TIMESTAMPTZ '2026-06-16T22:00:00Z'),  -- Iraq v Norway @ 2026-06-16 03:00 PM PT
        ('Argentina', 'Algeria', TIMESTAMPTZ '2026-06-17T01:00:00Z'),  -- Argentina v Algeria @ 2026-06-16 06:00 PM PT
        ('Austria', 'Jordan', TIMESTAMPTZ '2026-06-17T04:00:00Z'),  -- Austria v Jordan @ 2026-06-16 09:00 PM PT
        ('Portugal', 'DR Congo', TIMESTAMPTZ '2026-06-17T17:00:00Z'),  -- Portugal v Congo DR @ 2026-06-17 10:00 AM PT
        ('England', 'Croatia', TIMESTAMPTZ '2026-06-17T20:00:00Z'),  -- England v Croatia @ 2026-06-17 01:00 PM PT
        ('Ghana', 'Panama', TIMESTAMPTZ '2026-06-17T23:00:00Z'),  -- Ghana v Panama @ 2026-06-17 04:00 PM PT
        ('Uzbekistan', 'Colombia', TIMESTAMPTZ '2026-06-18T02:00:00Z'),  -- Uzbekistan v Colombia @ 2026-06-17 07:00 PM PT
        ('Czechia', 'South Africa', TIMESTAMPTZ '2026-06-18T16:00:00Z'),  -- Czechia v South Africa @ 2026-06-18 09:00 AM PT
        ('Switzerland', 'Bosnia and Herzegovina', TIMESTAMPTZ '2026-06-18T19:00:00Z'),  -- Switzerland v Bosnia @ 2026-06-18 12:00 PM PT
        ('Canada', 'Qatar', TIMESTAMPTZ '2026-06-18T22:00:00Z'),  -- Canada v Qatar @ 2026-06-18 03:00 PM PT
        ('Mexico', 'Korea Republic', TIMESTAMPTZ '2026-06-19T01:00:00Z'),  -- Mexico v South Korea @ 2026-06-18 06:00 PM PT
        ('United States', 'Australia', TIMESTAMPTZ '2026-06-19T19:00:00Z'),  -- USA v Australia @ 2026-06-19 12:00 PM PT
        ('Scotland', 'Morocco', TIMESTAMPTZ '2026-06-19T22:00:00Z'),  -- Scotland v Morocco @ 2026-06-19 03:00 PM PT
        ('Brazil', 'Haiti', TIMESTAMPTZ '2026-06-20T00:30:00Z'),  -- Brazil v Haiti @ 2026-06-19 05:30 PM PT
        ('Türkiye', 'Paraguay', TIMESTAMPTZ '2026-06-20T03:00:00Z'),  -- Turkiye v Paraguay @ 2026-06-19 08:00 PM PT
        ('Netherlands', 'Sweden', TIMESTAMPTZ '2026-06-20T17:00:00Z'),  -- Netherlands v Sweden @ 2026-06-20 10:00 AM PT
        ('Germany', 'Ivory Coast', TIMESTAMPTZ '2026-06-20T20:00:00Z'),  -- Germany v Ivory Coast @ 2026-06-20 01:00 PM PT
        ('Ecuador', 'Curaçao', TIMESTAMPTZ '2026-06-21T00:00:00Z'),  -- Ecuador v Curacao @ 2026-06-20 05:00 PM PT
        ('Tunisia', 'Japan', TIMESTAMPTZ '2026-06-21T04:00:00Z'),  -- Tunisia v Japan @ 2026-06-20 09:00 PM PT
        ('Spain', 'Saudi Arabia', TIMESTAMPTZ '2026-06-21T16:00:00Z'),  -- Spain v Saudi Arabia @ 2026-06-21 09:00 AM PT
        ('Belgium', 'Iran', TIMESTAMPTZ '2026-06-21T19:00:00Z'),  -- Belgium v Iran @ 2026-06-21 12:00 PM PT
        ('Uruguay', 'Cape Verde', TIMESTAMPTZ '2026-06-21T22:00:00Z'),  -- Uruguay v Cape Verde @ 2026-06-21 03:00 PM PT
        ('New Zealand', 'Egypt', TIMESTAMPTZ '2026-06-22T01:00:00Z'),  -- New Zealand v Egypt @ 2026-06-21 06:00 PM PT
        ('Argentina', 'Austria', TIMESTAMPTZ '2026-06-22T17:00:00Z'),  -- Argentina v Austria @ 2026-06-22 10:00 AM PT
        ('France', 'Iraq', TIMESTAMPTZ '2026-06-22T21:00:00Z'),  -- France v Iraq @ 2026-06-22 02:00 PM PT
        ('Norway', 'Senegal', TIMESTAMPTZ '2026-06-23T00:00:00Z'),  -- Norway v Senegal @ 2026-06-22 05:00 PM PT
        ('Jordan', 'Algeria', TIMESTAMPTZ '2026-06-23T03:00:00Z'),  -- Jordan v Algeria @ 2026-06-22 08:00 PM PT
        ('Portugal', 'Uzbekistan', TIMESTAMPTZ '2026-06-23T17:00:00Z'),  -- Portugal v Uzbekistan @ 2026-06-23 10:00 AM PT
        ('England', 'Ghana', TIMESTAMPTZ '2026-06-23T20:00:00Z'),  -- England v Ghana @ 2026-06-23 01:00 PM PT
        ('Panama', 'Croatia', TIMESTAMPTZ '2026-06-23T23:00:00Z'),  -- Panama v Croatia @ 2026-06-23 04:00 PM PT
        ('Colombia', 'DR Congo', TIMESTAMPTZ '2026-06-24T02:00:00Z'),  -- Colombia v Congo DR @ 2026-06-23 07:00 PM PT
        ('Switzerland', 'Canada', TIMESTAMPTZ '2026-06-24T19:00:00Z'),  -- Switzerland v Canada @ 2026-06-24 12:00 PM PT
        ('Bosnia and Herzegovina', 'Qatar', TIMESTAMPTZ '2026-06-24T19:00:00Z'),  -- Bosnia v Qatar @ 2026-06-24 12:00 PM PT
        ('Scotland', 'Brazil', TIMESTAMPTZ '2026-06-24T22:00:00Z'),  -- Scotland v Brazil @ 2026-06-24 03:00 PM PT
        ('Morocco', 'Haiti', TIMESTAMPTZ '2026-06-24T22:00:00Z'),  -- Morocco v Haiti @ 2026-06-24 03:00 PM PT
        ('Czechia', 'Mexico', TIMESTAMPTZ '2026-06-25T01:00:00Z'),  -- Czechia v Mexico @ 2026-06-24 06:00 PM PT
        ('South Africa', 'Korea Republic', TIMESTAMPTZ '2026-06-25T01:00:00Z'),  -- South Africa v South Korea @ 2026-06-24 06:00 PM PT
        ('Curaçao', 'Ivory Coast', TIMESTAMPTZ '2026-06-25T20:00:00Z'),  -- Curacao v Ivory Coast @ 2026-06-25 01:00 PM PT
        ('Ecuador', 'Germany', TIMESTAMPTZ '2026-06-25T20:00:00Z'),  -- Ecuador v Germany @ 2026-06-25 01:00 PM PT
        ('Japan', 'Sweden', TIMESTAMPTZ '2026-06-25T23:00:00Z'),  -- Japan v Sweden @ 2026-06-25 04:00 PM PT
        ('Tunisia', 'Netherlands', TIMESTAMPTZ '2026-06-25T23:00:00Z'),  -- Tunisia v Netherlands @ 2026-06-25 04:00 PM PT
        ('Türkiye', 'United States', TIMESTAMPTZ '2026-06-26T02:00:00Z'),  -- Turkiye v USA @ 2026-06-25 07:00 PM PT
        ('Paraguay', 'Australia', TIMESTAMPTZ '2026-06-26T02:00:00Z'),  -- Paraguay v Australia @ 2026-06-25 07:00 PM PT
        ('Norway', 'France', TIMESTAMPTZ '2026-06-26T19:00:00Z'),  -- Norway v France @ 2026-06-26 12:00 PM PT
        ('Senegal', 'Iraq', TIMESTAMPTZ '2026-06-26T19:00:00Z'),  -- Senegal v Iraq @ 2026-06-26 12:00 PM PT
        ('Cape Verde', 'Saudi Arabia', TIMESTAMPTZ '2026-06-27T00:00:00Z'),  -- Cape Verde v Saudi Arabia @ 2026-06-26 05:00 PM PT
        ('Uruguay', 'Spain', TIMESTAMPTZ '2026-06-27T00:00:00Z'),  -- Uruguay v Spain @ 2026-06-26 05:00 PM PT
        ('Egypt', 'Iran', TIMESTAMPTZ '2026-06-27T03:00:00Z'),  -- Egypt v Iran @ 2026-06-26 08:00 PM PT
        ('New Zealand', 'Belgium', TIMESTAMPTZ '2026-06-27T03:00:00Z'),  -- New Zealand v Belgium @ 2026-06-26 08:00 PM PT
        ('Panama', 'England', TIMESTAMPTZ '2026-06-27T21:00:00Z'),  -- Panama v England @ 2026-06-27 02:00 PM PT
        ('Croatia', 'Ghana', TIMESTAMPTZ '2026-06-27T21:00:00Z'),  -- Croatia v Ghana @ 2026-06-27 02:00 PM PT
        ('Colombia', 'Portugal', TIMESTAMPTZ '2026-06-27T23:30:00Z'),  -- Colombia v Portugal @ 2026-06-27 04:30 PM PT
        ('DR Congo', 'Uzbekistan', TIMESTAMPTZ '2026-06-27T23:30:00Z'),  -- Congo DR v Uzbekistan @ 2026-06-27 04:30 PM PT
        ('Jordan', 'Argentina', TIMESTAMPTZ '2026-06-28T02:00:00Z'),  -- Jordan v Argentina @ 2026-06-27 07:00 PM PT
        ('Algeria', 'Austria', TIMESTAMPTZ '2026-06-28T02:00:00Z')  -- Algeria v Austria @ 2026-06-27 07:00 PM PT
    ;

    SELECT count(*) INTO expected_rows FROM _sched;
    IF expected_rows <> 72 THEN
        RAISE EXCEPTION 'Migration 028 ABORT: staging has % rows, expected 72', expected_rows;
    END IF;

    -- Apply each row, resolving team UUIDs by name within the real
    -- tournament. Each pairing must resolve to exactly one group match;
    -- anything else aborts the whole transaction.
    FOR rec IN SELECT * FROM _sched LOOP
        SELECT id INTO home_id
          FROM teams
         WHERE name = rec.home_name AND pool_id IS NULL AND tournament_id = t_id;
        IF home_id IS NULL THEN
            RAISE EXCEPTION 'Migration 028 ABORT: home team not found: %', rec.home_name;
        END IF;

        SELECT id INTO away_id
          FROM teams
         WHERE name = rec.away_name AND pool_id IS NULL AND tournament_id = t_id;
        IF away_id IS NULL THEN
            RAISE EXCEPTION 'Migration 028 ABORT: away team not found: %', rec.away_name;
        END IF;

        UPDATE matches
           SET scheduled_at = rec.kickoff
         WHERE pool_id IS NULL
           AND phase = 'group'
           AND home_team_id = home_id
           AND away_team_id = away_id;

        GET DIAGNOSTICS n_matched = ROW_COUNT;
        IF n_matched <> 1 THEN
            RAISE EXCEPTION 'Migration 028 ABORT: % vs % matched % group matches (expected exactly 1)',
                rec.home_name, rec.away_name, n_matched;
        END IF;

        total_updated := total_updated + n_matched;
    END LOOP;

    -- Post-conditions: every provided row applied once, and every real
    -- group match now has a non-null schedule.
    IF total_updated <> 72 THEN
        RAISE EXCEPTION 'Migration 028 ABORT: updated % rows, expected 72', total_updated;
    END IF;

    PERFORM 1 FROM matches
     WHERE pool_id IS NULL AND phase = 'group' AND scheduled_at IS NULL
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Migration 028 ABORT: some real group match still has NULL scheduled_at';
    END IF;

    RAISE NOTICE 'Migration 028 OK: updated % group match schedules.', total_updated;
END
$$;

COMMIT;
