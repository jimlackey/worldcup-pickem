-- ============================================================================
-- Migration 015: Seed FIFA rankings for the 48 World Cup 2026 teams
-- ============================================================================
--
-- PURPOSE
-- -------
-- One-time seed populating teams.fifa_ranking with the current values
-- from the FIFA/Coca-Cola Men's World Ranking. Sourced from the official
-- April 1, 2026 release.
--
-- WHY A SEED INSTEAD OF AN AUTO-FETCH
-- -----------------------------------
-- We explored auto-fetching from fifa.com directly. The page-embedded
-- data on inside.fifa.com only ships highlight cards (top ranked,
-- biggest climber, etc.) — not the full 211-team list. The full list
-- is fetched client-side via an authenticated XHR call we can't
-- reliably replicate from the server. Every other source we considered
-- requires a paid API key, which adds dependency surface for a feature
-- that only needs to be refreshed ~4x per year.
--
-- Seed once + manual quarterly refresh through /super-admin/rankings is
-- the right ergonomic for the use case.
--
-- SCOPE
-- -----
-- Only touches global team rows (teams.pool_id IS NULL). Demo pools
-- have their own pool-scoped team rows and aren't affected; their
-- admins can populate rankings via /{slug}/admin/countries if/when we
-- extend that surface.
--
-- TEAM NAME ALIGNMENT
-- -------------------
-- FIFA's names sometimes differ from the names stored in our `teams`
-- table:
--
--   FIFA name              → Our DB name
--   ---------              -------------
--   IR Iran                → Iran
--   Korea Republic         → Korea Republic        (same)
--   USA                    → United States
--   Türkiye                → Türkiye               (same)
--   Côte d'Ivoire          → Ivory Coast
--   Congo DR               → DR Congo
--   Cabo Verde             → Cape Verde
--   Czechia                → Czechia               (same)
--
-- Each UPDATE below uses the name that matches OUR database; the FIFA
-- spelling is noted in a comment for cross-reference.
--
-- IDEMPOTENT
-- ----------
-- Running this migration twice is a no-op on already-populated rows
-- because the same value is being written. If a super-admin has
-- adjusted rankings via /super-admin/rankings since the seed, this
-- migration would overwrite their edits — so it's intended to be run
-- once on a fresh install, not as part of a refresh cycle.
-- ============================================================================

-- Defensive: only run if the column exists. If migration 014 hasn't been
-- applied yet this whole block is skipped without erroring.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'teams' AND column_name = 'fifa_ranking'
    ) THEN
        RAISE NOTICE 'Skipping rankings seed — teams.fifa_ranking column not present. Run migration 014 first.';
        RETURN;
    END IF;

    -- ------------------------------------------------------------------------
    -- Top 50 (covers most World Cup teams)
    -- ------------------------------------------------------------------------
    UPDATE teams SET fifa_ranking = 1   WHERE name = 'France'                  AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 2   WHERE name = 'Spain'                   AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 3   WHERE name = 'Argentina'               AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 4   WHERE name = 'England'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 5   WHERE name = 'Portugal'                AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 6   WHERE name = 'Brazil'                  AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 7   WHERE name = 'Netherlands'             AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 8   WHERE name = 'Morocco'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 9   WHERE name = 'Belgium'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 10  WHERE name = 'Germany'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 11  WHERE name = 'Croatia'                 AND pool_id IS NULL;
    -- (skipping rank 12 — Italy, not in our 48)
    UPDATE teams SET fifa_ranking = 13  WHERE name = 'Colombia'                AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 14  WHERE name = 'Senegal'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 15  WHERE name = 'Mexico'                  AND pool_id IS NULL;
    -- FIFA list shows this as "USA"; our DB uses the full form.
    UPDATE teams SET fifa_ranking = 16  WHERE name = 'United States'           AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 17  WHERE name = 'Uruguay'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 18  WHERE name = 'Japan'                   AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 19  WHERE name = 'Switzerland'             AND pool_id IS NULL;
    -- (rank 20 — Denmark, not in our 48)
    -- FIFA list shows this as "IR Iran"; our DB stores it as "Iran".
    UPDATE teams SET fifa_ranking = 21  WHERE name = 'Iran'                    AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 22  WHERE name = 'Türkiye'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 23  WHERE name = 'Ecuador'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 24  WHERE name = 'Austria'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 25  WHERE name = 'Korea Republic'          AND pool_id IS NULL;
    -- (rank 26 — Nigeria, not in our 48)
    UPDATE teams SET fifa_ranking = 27  WHERE name = 'Australia'               AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 28  WHERE name = 'Algeria'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 29  WHERE name = 'Egypt'                   AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 30  WHERE name = 'Canada'                  AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 31  WHERE name = 'Norway'                  AND pool_id IS NULL;
    -- (rank 32 — Ukraine, not in our 48)
    UPDATE teams SET fifa_ranking = 33  WHERE name = 'Panama'                  AND pool_id IS NULL;
    -- FIFA list shows this as "Côte d'Ivoire"; our DB stores it as "Ivory Coast".
    UPDATE teams SET fifa_ranking = 34  WHERE name = 'Ivory Coast'             AND pool_id IS NULL;
    -- (35 Poland, 36 Russia, 37 Wales — none in our 48)
    UPDATE teams SET fifa_ranking = 38  WHERE name = 'Sweden'                  AND pool_id IS NULL;
    -- (39 Serbia not in our 48)
    UPDATE teams SET fifa_ranking = 40  WHERE name = 'Paraguay'                AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 41  WHERE name = 'Czechia'                 AND pool_id IS NULL;
    -- (42 Hungary not in our 48)
    UPDATE teams SET fifa_ranking = 43  WHERE name = 'Scotland'                AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 44  WHERE name = 'Tunisia'                 AND pool_id IS NULL;
    -- (45 Cameroon not in our 48)
    -- FIFA list shows this as "Congo DR"; our DB stores it as "DR Congo".
    UPDATE teams SET fifa_ranking = 46  WHERE name = 'DR Congo'                AND pool_id IS NULL;
    -- (47 Greece, 48 Slovakia, 49 Venezuela not in our 48)
    UPDATE teams SET fifa_ranking = 50  WHERE name = 'Uzbekistan'              AND pool_id IS NULL;

    -- ------------------------------------------------------------------------
    -- Outside the top 50 — the remaining World Cup qualifiers
    -- ------------------------------------------------------------------------
    UPDATE teams SET fifa_ranking = 55  WHERE name = 'Qatar'                   AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 57  WHERE name = 'Iraq'                    AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 60  WHERE name = 'South Africa'            AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 61  WHERE name = 'Saudi Arabia'            AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 63  WHERE name = 'Jordan'                  AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 65  WHERE name = 'Bosnia and Herzegovina'  AND pool_id IS NULL;
    -- FIFA list shows this as "Cabo Verde"; our DB stores it as "Cape Verde".
    UPDATE teams SET fifa_ranking = 69  WHERE name = 'Cape Verde'              AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 74  WHERE name = 'Ghana'                   AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 82  WHERE name = 'Curaçao'                 AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 83  WHERE name = 'Haiti'                   AND pool_id IS NULL;
    UPDATE teams SET fifa_ranking = 85  WHERE name = 'New Zealand'             AND pool_id IS NULL;

    -- ------------------------------------------------------------------------
    -- Coverage check — log how many of our 48 teams now have rankings.
    -- This is just a NOTICE for the migration runner; it doesn't fail
    -- the migration if a team was missed (the picks form gracefully
    -- handles NULL rankings by hiding the badge).
    -- ------------------------------------------------------------------------
    DECLARE
        ranked_count INT;
        total_count INT;
    BEGIN
        SELECT COUNT(*) INTO ranked_count
        FROM teams
        WHERE pool_id IS NULL AND fifa_ranking IS NOT NULL;

        SELECT COUNT(*) INTO total_count
        FROM teams
        WHERE pool_id IS NULL;

        RAISE NOTICE 'FIFA ranking seed: % of % global teams have rankings.',
            ranked_count, total_count;
    END;
END $$;
