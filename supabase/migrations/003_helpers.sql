-- ============================================================================
-- World Cup Pick'em — Helper Functions
-- Migration 003: Pool initialization + pool-scoped query helpers
-- ============================================================================

-- ============================================================================
-- Initialize default scoring config for a new pool
-- Called when creating a pool (from app layer or seed script)
-- ============================================================================
CREATE OR REPLACE FUNCTION initialize_pool_scoring(p_pool_id UUID)
RETURNS void AS $$
BEGIN
    INSERT INTO scoring_config (pool_id, phase, points) VALUES
        (p_pool_id, 'group', 1),
        (p_pool_id, 'r32', 2),
        (p_pool_id, 'r16', 3),
        (p_pool_id, 'qf', 5),
        (p_pool_id, 'sf', 8),
        (p_pool_id, 'final', 13)
    ON CONFLICT (pool_id, phase) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Get the correct pool_id filter for tournament data queries
-- Non-demo pools use global data (pool_id IS NULL)
-- Demo pools use their own copy (pool_id = their pool ID)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_tournament_pool_id(p_pool_id UUID)
RETURNS UUID AS $$
DECLARE
    v_is_demo BOOLEAN;
BEGIN
    SELECT is_demo INTO v_is_demo FROM pools WHERE id = p_pool_id;
    IF v_is_demo THEN
        RETURN p_pool_id;
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Calculate standings for a pool
-- Returns pick_set_id, pick_set_name, participant display info,
-- group_points, knockout_points, total_points
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_standings(p_pool_id UUID)
RETURNS TABLE (
    pick_set_id UUID,
    pick_set_name TEXT,
    participant_id UUID,
    participant_email TEXT,
    display_name TEXT,
    group_points BIGINT,
    knockout_points BIGINT,
    total_points BIGINT
) AS $$
DECLARE
    v_tournament_pool_id UUID;
BEGIN
    v_tournament_pool_id := get_tournament_pool_id(p_pool_id);

    RETURN QUERY
    SELECT
        ps.id AS pick_set_id,
        ps.name AS pick_set_name,
        p.id AS participant_id,
        p.email::TEXT AS participant_email,
        p.display_name,
        COALESCE(gp_score.pts, 0) AS group_points,
        COALESCE(kp_score.pts, 0) AS knockout_points,
        COALESCE(gp_score.pts, 0) + COALESCE(kp_score.pts, 0) AS total_points
    FROM pick_sets ps
    JOIN participants p ON ps.participant_id = p.id
    LEFT JOIN LATERAL (
        SELECT SUM(sc.points) AS pts
        FROM group_picks gp
        JOIN matches m ON gp.match_id = m.id
        JOIN scoring_config sc ON sc.pool_id = p_pool_id AND sc.phase = m.phase
        WHERE gp.pick_set_id = ps.id
          AND gp.is_correct = true
          AND m.pool_id IS NOT DISTINCT FROM v_tournament_pool_id
    ) gp_score ON true
    LEFT JOIN LATERAL (
        SELECT SUM(sc.points) AS pts
        FROM knockout_picks kp
        JOIN matches m ON kp.match_id = m.id
        JOIN scoring_config sc ON sc.pool_id = p_pool_id AND sc.phase = m.phase
        WHERE kp.pick_set_id = ps.id
          AND kp.is_correct = true
          AND m.pool_id IS NOT DISTINCT FROM v_tournament_pool_id
    ) kp_score ON true
    WHERE ps.pool_id = p_pool_id
      AND ps.is_active = true
    ORDER BY total_points DESC, group_points DESC, ps.name;
END;
$$ LANGUAGE plpgsql STABLE;
