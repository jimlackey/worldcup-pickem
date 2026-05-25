-- ============================================================================
-- Migration 020: Pool favorites
--
-- Lets a logged-in pool member mark other pool members as "favorites" so
-- they can follow a curated subset of the standings during the tournament.
--
-- DESIGN
-- ------
--   - Pool-scoped. A favorite is a directed edge from `participant_id`
--     (the favoriter — the logged-in user) to `favorite_participant_id`
--     (the favoritee — a fellow pool member) inside a single pool. The
--     same person favoriting the same other person in two different
--     pools needs two rows, because Standings and What-If both run per
--     pool and the favorite list is consumed there.
--   - Self-favorites are explicitly allowed. A player typically wants to
--     see themselves on the Favorites tab alongside the people they're
--     racing; forcing them to filter the All Standings tab to find their
--     own row would be tedious. The unique constraint still prevents
--     duplicate rows, and a CHECK isn't needed because the same-id case
--     is the desired behaviour, not an edge case.
--   - Cascade deletes on every reference: if a participant is removed,
--     all favorite rows pointing to or from them vanish; if a pool is
--     deleted, every favorite in it goes with it.
--   - No RLS policy beyond the table-level enable. Reads and writes go
--     through the service-role client (supabaseAdmin) the same way
--     pool_memberships and pick_sets do; the Next.js server layer
--     enforces "you can only toggle your own favorites" by deriving
--     `participant_id` from the session, never from the request body.
--
-- IDEMPOTENCY
-- -----------
--   CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and the RLS
--   enable line all tolerate re-execution. Safe to re-run on a database
--   that already has this migration applied.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pool_favorites (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id                     UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    participant_id              UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    favorite_participant_id     UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pool_id, participant_id, favorite_participant_id)
);

-- Hot lookup path: "give me all favorites for THIS user in THIS pool".
-- The standings page asks for this on every render to mark rows and to
-- filter the Favorites sub-tab. The unique constraint above already
-- provides an index on (pool_id, participant_id, favorite_participant_id)
-- but a leading (pool_id, participant_id) index keeps the per-user
-- lookup tight even as the table grows across pools.
CREATE INDEX IF NOT EXISTS idx_pool_favorites_pool_participant
    ON pool_favorites(pool_id, participant_id);

-- Reverse lookup, currently unused but cheap: "who's favoriting this
-- person?". Useful if we ever want to surface a follower count on a
-- player's profile.
CREATE INDEX IF NOT EXISTS idx_pool_favorites_favorite
    ON pool_favorites(pool_id, favorite_participant_id);

-- RLS: defense-in-depth only, matches the pattern in 001_schema.sql.
-- All real authorization lives in the Next.js server layer.
ALTER TABLE pool_favorites ENABLE ROW LEVEL SECURITY;
