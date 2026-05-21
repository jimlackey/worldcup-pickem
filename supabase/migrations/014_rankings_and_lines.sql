-- ============================================================================
-- Migration 014: FIFA rankings + match betting lines
-- ============================================================================
--
-- CONTEXT
-- -------
-- Two new opt-in display features on the group picks form
-- (/{slug}/my-picks/{pickSetId}):
--
--   1. FIFA ranking inline beside each team name, e.g.
--        🇲🇽 Mexico (15)   vs   🇿🇦 South Africa (60)
--
--   2. Money-line betting odds underneath each pick button, e.g.
--        [ Mexico (-190) ] [ Draw (+330) ] [ South Africa (+600) ]
--
-- Both are independently configurable per pool via two new pools columns
-- (`show_fifa_rankings`, `show_match_lines`). Both default OFF so existing
-- pools see no UI change after this migration runs.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- 1. Adds `fifa_ranking INT NULL` to `teams`. Stored as a positive integer
--    (1 = best in the world). Null means "no ranking recorded" and the
--    inline badge simply doesn't render for that team.
--
-- 2. Adds three nullable INT columns to `matches`:
--      home_money_line, draw_money_line, away_money_line
--    Stored as American-style odds: a negative integer for a favourite
--    (e.g. -190 means bet 190 to win 100) and a positive integer for an
--    underdog (e.g. +600 means bet 100 to win 600). Draw money lines on
--    soccer matches are typically positive (rare outcome) but the column
--    accepts either sign.
--
-- 3. Adds `show_fifa_rankings BOOLEAN NOT NULL DEFAULT FALSE` and
--    `show_match_lines BOOLEAN NOT NULL DEFAULT FALSE` to `pools`. Both
--    default OFF so this migration is a pure no-op for the visible UI
--    until a pool admin opts in.
--
-- NULLABILITY NOTES
-- -----------------
-- All four data columns (fifa_ranking + the three money_line columns)
-- are nullable. The UI treats `null` as "no value" and renders the row
-- without that piece of info — so a partially populated tournament still
-- looks sensible. A pool admin enabling `show_match_lines` on a match
-- that has none of its three lines set will see the unchanged stock
-- pick buttons; no broken state.
--
-- WHY MATCH LINES LIVE ON `matches`
-- ---------------------------------
-- Lines are per-match facts (Mexico vs South Africa might be -190/+330/+600
-- this week and totally different next week), so they're column-on-matches.
-- Demo pools have their own pool-scoped matches rows so each demo pool can
-- carry its own line data without polluting global state — same pattern as
-- home_score/away_score.
--
-- WHY FIFA RANKINGS LIVE ON `teams`
-- ---------------------------------
-- Rankings are a property of the team, not the match — every match
-- involving Spain shares Spain's current ranking. Stored on `teams`, edited
-- centrally at /super-admin/rankings. Demo pools have their own teams
-- copies and can be ranked independently, but in practice the super-admin
-- page only edits the global rows (pool_id IS NULL); demo pool admins
-- can use the existing /{slug}/admin/countries surface if/when we extend
-- it to include a rankings field.
--
-- NO BACKFILL OF DATA
-- -------------------
-- We deliberately don't seed initial ranking or line values in this
-- migration. They're maintained at /super-admin/rankings (rankings) and
-- /{slug}/admin/matches (lines). Anyone wanting a starter set can run the
-- fetch action once after enabling THE_ODDS_API_KEY, or hand-enter the
-- handful of group-stage matches they care about.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Team rankings
-- ----------------------------------------------------------------------------
ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS fifa_ranking INT NULL;

-- Defensive sanity-check constraint: rankings can't be ≤ 0 or absurdly large.
-- 250 is comfortably above the size of FIFA's member nation list (currently
-- 211) so we give some headroom without allowing obvious typos.
ALTER TABLE teams
    ADD CONSTRAINT teams_fifa_ranking_range
    CHECK (fifa_ranking IS NULL OR (fifa_ranking BETWEEN 1 AND 250));

-- ----------------------------------------------------------------------------
-- 2. Match money lines
-- ----------------------------------------------------------------------------
ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS home_money_line INT NULL,
    ADD COLUMN IF NOT EXISTS draw_money_line INT NULL,
    ADD COLUMN IF NOT EXISTS away_money_line INT NULL;

-- Sanity bounds on the integer values. American odds typically run in the
-- ±100 to ±100,000 range; we cap at ±100,000 (no realistic line ever exceeds
-- this) and exclude the no-info range -99..+99 / 0 which would be malformed.
--
-- A value of exactly -100 or +100 is allowed (an "even money" line is
-- usually written +100, so we keep the floor at |100|).
ALTER TABLE matches
    ADD CONSTRAINT matches_home_money_line_range
    CHECK (home_money_line IS NULL OR (home_money_line BETWEEN -100000 AND -100) OR (home_money_line BETWEEN 100 AND 100000)),
    ADD CONSTRAINT matches_draw_money_line_range
    CHECK (draw_money_line IS NULL OR (draw_money_line BETWEEN -100000 AND -100) OR (draw_money_line BETWEEN 100 AND 100000)),
    ADD CONSTRAINT matches_away_money_line_range
    CHECK (away_money_line IS NULL OR (away_money_line BETWEEN -100000 AND -100) OR (away_money_line BETWEEN 100 AND 100000));

-- ----------------------------------------------------------------------------
-- 3. Per-pool display toggles
-- ----------------------------------------------------------------------------
ALTER TABLE pools
    ADD COLUMN IF NOT EXISTS show_fifa_rankings BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_match_lines   BOOLEAN NOT NULL DEFAULT FALSE;
