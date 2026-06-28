-- ============================================================================
-- Migration 029: persist scheduled date/time for the 32 knockout-stage matches
-- ============================================================================
--
-- CONTEXT
-- -------
-- The /matches "By Date" view groups matches by their Pacific-Time calendar
-- day and floats the current day to the top. During the Group Phase this
-- worked because migration 028 populated scheduled_at for all 72 group
-- matches. The knockout matches (match_number 73-104) were seeded with
-- scheduled_at = NULL, so in the Knockout Phase they all collapsed into the
-- single trailing "Date TBD" bucket and the today-first ordering had nothing
-- to anchor on.
--
-- This migration writes the authoritative kickoff date/time for every
-- knockout match from the official FIFA 2026 schedule.
--
-- WHY NOT "ASSIGN EACH ROUND'S TIMES IN MATCH-NUMBER ORDER"
-- --------------------------------------------------------
-- A naive assignment (give R32's 16 chronological kickoff slots to match
-- numbers 73..88 in order) is WRONG: this app's R32 match_number order does
-- NOT follow the chronological / FIFA-code order. The bracket-slot layout in
-- src/lib/picks/r32-slots.ts assigns FIFA bracket positions to match numbers
-- in the visual left-then-right column order, which interleaves dates. For
-- example match_number 75 is the 2A-v-2B tie (South Africa v Canada), which
-- is the Sunday June 28 opener, while match_number 73 is 1E-v-3(ABCDF)
-- (Germany v Paraguay) on Monday June 29. A positional assignment put the
-- June 28 slot on #73 and pushed the real opener to the 29th.
--
-- HOW THESE VALUES WERE DERIVED (per match_number)
-- ------------------------------------------------
--   * R32 (73-88): each match's FIFA bracket SLOT PAIR (from r32-slots.ts,
--     e.g. #75 = 2A/2B, #73 = 1E/3ABCDF) was matched to the official FIFA
--     Round-of-32 schedule's slot pairing to read off that tie's real date
--     and kickoff. This is independent of which exact teams filled each slot,
--     so it is correct for every pool regardless of how its bracket resolved.
--   * R16-SF (89-102): each match's bracket region was resolved by walking
--     this app's feeder graph (BRACKET_FEEDERS) down to its R32 slot pairs,
--     then matched to the official FIFA schedule's corresponding round match
--     to read off the date and kickoff. Teams are still TBD for these rounds,
--     but the DAY/TIME of each bracket position is fixed by FIFA, so the
--     By Date grouping is exact.
--   * #103 (this app's FINAL) -> Sun Jul 19; #104 (this app's THIRD-PLACE /
--     'consolation') -> Sat Jul 18. NOTE: FIFA's own codes invert these two
--     (their M103 = third place, M104 = final); we key strictly on THIS app's
--     match_number, matching how the rest of the codebase treats #103/#104.
--
-- TIME BASIS
-- ----------
-- The official schedule is published in Eastern Time (EDT, UTC-4 during the
-- tournament). Each value is stored as the equivalent UTC instant
-- (UTC = ET + 4h). The trailing comment shows the Pacific-Time kickoff
-- (PDT, UTC-7 = ET - 3h), which is what the app renders.
--
-- LIVE-DATA SAFETY
-- ----------------
-- The pool is live. This migration is written to be safe against production:
--
--   * Wrapped in an explicit transaction (BEGIN ... COMMIT). Any failed
--     check RAISEs and rolls back every change.
--   * Touches ONLY the scheduled_at column. Scores, results, status, team
--     assignments, and every other column are never referenced.
--   * Applies to BOTH the canonical tournament rows (pool_id IS NULL) AND
--     every demo pool's copy, matched by match_number within the knockout
--     phases. Because the date is derived from the fixed bracket SLOT (not
--     from specific teams), it is correct for demo pools whose brackets
--     resolved to different teams.
--   * Idempotent: re-running sets the same values and re-passes every check.
--
-- WHAT TO EXPECT
-- --------------
-- On success: "Migration 029 OK: updated N knockout match schedules across
-- 32 canonical slots." and the transaction commits. On any mismatch (a
-- canonical match_number that resolves to zero rows, or a final canonical
-- count != 32) the migration raises and rolls back; nothing is changed.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    t_id UUID := '00000000-0000-0000-0000-000000000001';
    rec RECORD;
    n_matched INT;
    total_updated INT := 0;
    canonical_slots INT := 0;
    knockout_phases TEXT[] := ARRAY['r32','r16','qf','sf','final','consolation'];
BEGIN
    -- Authoritative kickoff per THIS APP's match_number, as UTC instants.
    -- Derived from FIFA bracket slots (see header). The trailing comment on
    -- each row records the Pacific-Time kickoff for auditing.
    CREATE TEMP TABLE _ksched (
        match_number INT NOT NULL,
        kickoff      TIMESTAMPTZ NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _ksched (match_number, kickoff) VALUES
        -- Round of 32 (slot-matched to the official R32 schedule)
        (73,  TIMESTAMPTZ '2026-06-29T20:30:00Z'),  -- R32 1E v 3ABCDF @ 2026-06-29 01:30 PM PT
        (74,  TIMESTAMPTZ '2026-06-30T21:00:00Z'),  -- R32 1I v 3CDFGH @ 2026-06-30 02:00 PM PT
        (75,  TIMESTAMPTZ '2026-06-28T19:00:00Z'),  -- R32 2A v 2B     @ 2026-06-28 12:00 PM PT
        (76,  TIMESTAMPTZ '2026-06-30T01:00:00Z'),  -- R32 1F v 2C     @ 2026-06-29 06:00 PM PT
        (77,  TIMESTAMPTZ '2026-07-02T23:00:00Z'),  -- R32 2K v 2L     @ 2026-07-02 04:00 PM PT
        (78,  TIMESTAMPTZ '2026-07-02T19:00:00Z'),  -- R32 1H v 2J     @ 2026-07-02 12:00 PM PT
        (79,  TIMESTAMPTZ '2026-07-02T00:00:00Z'),  -- R32 1D v 3BEFIJ @ 2026-07-01 05:00 PM PT
        (80,  TIMESTAMPTZ '2026-07-01T20:00:00Z'),  -- R32 1G v 3AEHIJ @ 2026-07-01 01:00 PM PT
        (81,  TIMESTAMPTZ '2026-06-29T17:00:00Z'),  -- R32 1C v 2F     @ 2026-06-29 10:00 AM PT
        (82,  TIMESTAMPTZ '2026-06-30T17:00:00Z'),  -- R32 2E v 2I     @ 2026-06-30 10:00 AM PT
        (83,  TIMESTAMPTZ '2026-07-01T01:00:00Z'),  -- R32 1A v 3CEFHI @ 2026-06-30 06:00 PM PT
        (84,  TIMESTAMPTZ '2026-07-01T16:00:00Z'),  -- R32 1L v 3EHIJK @ 2026-07-01 09:00 AM PT
        (85,  TIMESTAMPTZ '2026-07-03T22:00:00Z'),  -- R32 1J v 2H     @ 2026-07-03 03:00 PM PT
        (86,  TIMESTAMPTZ '2026-07-03T18:00:00Z'),  -- R32 2D v 2G     @ 2026-07-03 11:00 AM PT
        (87,  TIMESTAMPTZ '2026-07-03T03:00:00Z'),  -- R32 1B v 3EFGIJ @ 2026-07-02 08:00 PM PT
        (88,  TIMESTAMPTZ '2026-07-04T01:30:00Z'),  -- R32 1K v 3DEIJL @ 2026-07-03 06:30 PM PT
        -- Round of 16 (region-matched via feeder graph to the official R16 schedule)
        (89,  TIMESTAMPTZ '2026-07-04T21:00:00Z'),  -- R16 @ 2026-07-04 02:00 PM PT
        (90,  TIMESTAMPTZ '2026-07-04T17:00:00Z'),  -- R16 @ 2026-07-04 10:00 AM PT
        (91,  TIMESTAMPTZ '2026-07-06T19:00:00Z'),  -- R16 @ 2026-07-06 12:00 PM PT
        (92,  TIMESTAMPTZ '2026-07-07T00:00:00Z'),  -- R16 @ 2026-07-06 05:00 PM PT
        (93,  TIMESTAMPTZ '2026-07-05T20:00:00Z'),  -- R16 @ 2026-07-05 01:00 PM PT
        (94,  TIMESTAMPTZ '2026-07-06T00:00:00Z'),  -- R16 @ 2026-07-05 05:00 PM PT
        (95,  TIMESTAMPTZ '2026-07-07T16:00:00Z'),  -- R16 @ 2026-07-07 09:00 AM PT
        (96,  TIMESTAMPTZ '2026-07-07T20:00:00Z'),  -- R16 @ 2026-07-07 01:00 PM PT
        -- Quarterfinals
        (97,  TIMESTAMPTZ '2026-07-09T20:00:00Z'),  -- QF  @ 2026-07-09 01:00 PM PT
        (98,  TIMESTAMPTZ '2026-07-10T19:00:00Z'),  -- QF  @ 2026-07-10 12:00 PM PT
        (99,  TIMESTAMPTZ '2026-07-11T21:00:00Z'),  -- QF  @ 2026-07-11 02:00 PM PT
        (100, TIMESTAMPTZ '2026-07-12T01:00:00Z'),  -- QF  @ 2026-07-11 06:00 PM PT
        -- Semifinals
        (101, TIMESTAMPTZ '2026-07-14T19:00:00Z'),  -- SF  @ 2026-07-14 12:00 PM PT
        (102, TIMESTAMPTZ '2026-07-15T19:00:00Z'),  -- SF  @ 2026-07-15 12:00 PM PT
        -- Final (this app's #103) — Sun Jul 19
        (103, TIMESTAMPTZ '2026-07-19T19:00:00Z'),  -- FINAL @ 2026-07-19 12:00 PM PT
        -- Third-place / consolation (this app's #104) — Sat Jul 18
        (104, TIMESTAMPTZ '2026-07-18T21:00:00Z')   -- 3rd PLACE @ 2026-07-18 02:00 PM PT
    ;

    -- Sanity: staging must describe exactly the 32 knockout slots.
    SELECT count(*) INTO n_matched FROM _ksched;
    IF n_matched <> 32 THEN
        RAISE EXCEPTION 'Migration 029 ABORT: staging has % rows, expected 32', n_matched;
    END IF;

    -- Apply each schedule to ALL pools' copies of that match_number within
    -- the knockout phases (canonical pool_id IS NULL plus every demo pool).
    FOR rec IN SELECT * FROM _ksched ORDER BY match_number LOOP
        UPDATE matches
           SET scheduled_at = rec.kickoff
         WHERE tournament_id = t_id
           AND phase::text = ANY (knockout_phases)
           AND match_number = rec.match_number;

        GET DIAGNOSTICS n_matched = ROW_COUNT;
        total_updated := total_updated + n_matched;

        -- Every match_number must exist at least on the canonical tournament.
        PERFORM 1 FROM matches
         WHERE tournament_id = t_id
           AND pool_id IS NULL
           AND phase::text = ANY (knockout_phases)
           AND match_number = rec.match_number
           AND scheduled_at = rec.kickoff;
        IF FOUND THEN
            canonical_slots := canonical_slots + 1;
        ELSE
            RAISE EXCEPTION 'Migration 029 ABORT: canonical knockout match_number % not found / not updated', rec.match_number;
        END IF;
    END LOOP;

    -- Post-condition: all 32 canonical knockout slots populated, and no
    -- canonical knockout match left with a NULL schedule.
    IF canonical_slots <> 32 THEN
        RAISE EXCEPTION 'Migration 029 ABORT: populated % canonical slots, expected 32', canonical_slots;
    END IF;

    PERFORM 1 FROM matches
     WHERE tournament_id = t_id
       AND pool_id IS NULL
       AND phase::text = ANY (knockout_phases)
       AND scheduled_at IS NULL
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Migration 029 ABORT: some canonical knockout match still has NULL scheduled_at';
    END IF;

    RAISE NOTICE 'Migration 029 OK: updated % knockout match schedules across % canonical slots.',
        total_updated, canonical_slots;
END
$$;

COMMIT;
