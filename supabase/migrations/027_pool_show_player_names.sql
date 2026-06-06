-- ============================================================================
-- Migration 027: per-pool "show player names in Standings" flag
-- ============================================================================
--
-- CONTEXT
-- -------
-- The Standings page's "Show Details" toggle can reveal each pick set
-- owner's display name (never their email). Whether that reveal is
-- available at all is now a pool-admin decision, controlled from
-- /admin/settings — same pattern as show_match_lines /
-- show_fifa_rankings (migration 014).
--
-- DEFAULT TRUE: the name reveal shipped enabled, so existing pools keep
-- their current behavior; admins opt OUT rather than in. (The 014 flags
-- defaulted FALSE because they introduced net-new visuals.)
--
-- When FALSE:
--   - player names never render on Standings, regardless of the
--     viewer's Show Details state
--   - during the Group Phase Picking stage the Show Details toggle is
--     hidden entirely (names are its only phase-1 payload, so it would
--     be a no-op switch)
--
-- Safe inside a transaction; idempotent via IF NOT EXISTS.
-- ============================================================================

ALTER TABLE pools
    ADD COLUMN IF NOT EXISTS show_player_names BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN pools.show_player_names IS
    'Pool-admin switch: when TRUE, the Standings Show Details toggle can reveal pick set owners'' display names (never emails). When FALSE, names never render on Standings.';
