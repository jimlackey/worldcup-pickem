-- ============================================================================
-- World Cup Pick'em — Full Database Schema
-- Migration 001: Core schema, RLS, indexes, helper functions
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE match_phase AS ENUM ('group', 'r32', 'r16', 'qf', 'sf', 'final');
CREATE TYPE match_result AS ENUM ('home', 'draw', 'away');
CREATE TYPE match_status AS ENUM ('scheduled', 'in_progress', 'completed');
CREATE TYPE pool_role AS ENUM ('player', 'admin');
CREATE TYPE pick_value AS ENUM ('home', 'draw', 'away');

-- ============================================================================
-- GLOBAL TABLES (tournament structure)
-- ============================================================================

-- One row per tournament (just 2026 World Cup for now)
CREATE TABLE tournaments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    year        INT NOT NULL,
    kickoff_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Groups within a tournament
-- pool_id: NULL = global/real data, non-NULL = demo pool's private copy
CREATE TABLE groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    pool_id         UUID,  -- FK added after pools table is created
    name            TEXT NOT NULL,  -- e.g. "Group A"
    letter          CHAR(1) NOT NULL,  -- e.g. 'A'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teams in the tournament
-- pool_id: NULL = global/real data, non-NULL = demo pool's private copy
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    pool_id         UUID,  -- FK added after pools table is created
    name            TEXT NOT NULL,
    short_code      CHAR(3) NOT NULL,  -- e.g. "USA"
    flag_code       VARCHAR(6) NOT NULL,  -- ISO alpha-2 or subdivision, e.g. "us", "gb-eng"
    group_id        UUID REFERENCES groups(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- All matches (group + knockout slots)
-- pool_id: NULL = global/real data, non-NULL = demo pool's private copy
CREATE TABLE matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    pool_id         UUID,  -- FK added after pools table is created
    phase           match_phase NOT NULL,
    group_id        UUID REFERENCES groups(id) ON DELETE SET NULL,
    match_number    INT,  -- sequential within phase, for ordering
    home_team_id    UUID REFERENCES teams(id) ON DELETE SET NULL,
    away_team_id    UUID REFERENCES teams(id) ON DELETE SET NULL,
    scheduled_at    TIMESTAMPTZ,
    home_score      INT,
    away_score      INT,
    result          match_result,
    status          match_status NOT NULL DEFAULT 'scheduled',
    label           TEXT,  -- e.g. "Winner G1 vs Runner-up G2" for knockout placeholders
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- POOL-SCOPED TABLES
-- ============================================================================

CREATE TABLE pools (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        TEXT NOT NULL,
    slug                        TEXT NOT NULL UNIQUE,
    tournament_id               UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    max_pick_sets_per_player    INT NOT NULL DEFAULT 5 CHECK (max_pick_sets_per_player BETWEEN 1 AND 10),
    group_lock_at               TIMESTAMPTZ,
    knockout_open_at            TIMESTAMPTZ,
    knockout_lock_at            TIMESTAMPTZ,
    is_demo                     BOOLEAN NOT NULL DEFAULT false,
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validate slug format: lowercase alphanumeric + hyphens
ALTER TABLE pools ADD CONSTRAINT pools_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' AND length(slug) BETWEEN 3 AND 60);

-- Now add the FK from groups, teams, matches → pools
ALTER TABLE groups ADD CONSTRAINT groups_pool_id_fk
    FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE;
ALTER TABLE teams ADD CONSTRAINT teams_pool_id_fk
    FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE;
ALTER TABLE matches ADD CONSTRAINT matches_pool_id_fk
    FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE;

-- Global identity table — one row per real-world person
CREATE TABLE participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT NOT NULL UNIQUE,
    display_name    TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pool membership — ties a participant to a pool with a role
CREATE TABLE pool_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id         UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    role            pool_role NOT NULL DEFAULT 'player',
    is_approved     BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pool_id, participant_id)
);

-- Pick sets — each player can have multiple per pool
CREATE TABLE pick_sets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id         UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Group phase picks — one per pick_set per group match
CREATE TABLE group_picks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pick_set_id     UUID NOT NULL REFERENCES pick_sets(id) ON DELETE CASCADE,
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    pick            pick_value NOT NULL,
    is_correct      BOOLEAN,  -- NULL until result entered
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pick_set_id, match_id)
);

-- Knockout picks — one per pick_set per knockout match slot
CREATE TABLE knockout_picks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pick_set_id     UUID NOT NULL REFERENCES pick_sets(id) ON DELETE CASCADE,
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    picked_team_id  UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    is_correct      BOOLEAN,  -- NULL until result entered
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pick_set_id, match_id)
);

-- Scoring config — points per phase per pool
CREATE TABLE scoring_config (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id     UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    phase       match_phase NOT NULL,
    points      INT NOT NULL CHECK (points >= 0),
    UNIQUE(pool_id, phase)
);

-- Pool email whitelist
CREATE TABLE pool_whitelist (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id     UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    email       CITEXT NOT NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pool_id, email)
);

-- OTP requests — pool-scoped
CREATE TABLE otp_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       CITEXT NOT NULL,
    pool_id     UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    code_hash   TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT false,
    attempts    INT NOT NULL DEFAULT 0,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions — pool-scoped custom auth
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id         UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log — append-only, pool-scoped
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    pool_id         UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    actor_id        UUID REFERENCES participants(id) ON DELETE SET NULL,
    actor_email     TEXT NOT NULL,
    actor_role      TEXT NOT NULL,
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      TEXT,
    user_agent      TEXT
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Groups / Teams / Matches: fast lookup by pool_id (NULL for global, set for demo)
CREATE INDEX idx_groups_tournament_pool ON groups(tournament_id, pool_id);
CREATE INDEX idx_teams_tournament_pool ON teams(tournament_id, pool_id);
CREATE INDEX idx_teams_group ON teams(group_id);
CREATE INDEX idx_matches_tournament_pool ON matches(tournament_id, pool_id);
CREATE INDEX idx_matches_phase ON matches(phase);
CREATE INDEX idx_matches_group ON matches(group_id);
CREATE INDEX idx_matches_status ON matches(status);

-- Pool lookups
CREATE INDEX idx_pools_slug ON pools(slug);
CREATE INDEX idx_pools_tournament ON pools(tournament_id);

-- Membership lookups
CREATE INDEX idx_pool_memberships_pool ON pool_memberships(pool_id);
CREATE INDEX idx_pool_memberships_participant ON pool_memberships(participant_id);
CREATE INDEX idx_pool_memberships_pool_role ON pool_memberships(pool_id, role);

-- Pick sets
CREATE INDEX idx_pick_sets_pool ON pick_sets(pool_id);
CREATE INDEX idx_pick_sets_participant ON pick_sets(participant_id);
CREATE INDEX idx_pick_sets_pool_participant ON pick_sets(pool_id, participant_id);

-- Picks
CREATE INDEX idx_group_picks_pick_set ON group_picks(pick_set_id);
CREATE INDEX idx_group_picks_match ON group_picks(match_id);
CREATE INDEX idx_knockout_picks_pick_set ON knockout_picks(pick_set_id);
CREATE INDEX idx_knockout_picks_match ON knockout_picks(match_id);

-- OTP
CREATE INDEX idx_otp_requests_email_pool ON otp_requests(email, pool_id, created_at);
CREATE INDEX idx_otp_requests_expires ON otp_requests(expires_at) WHERE NOT used;

-- Sessions
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_pool_participant ON sessions(pool_id, participant_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Audit log
CREATE INDEX idx_audit_log_pool ON audit_log(pool_id, timestamp DESC);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- Whitelist
CREATE INDEX idx_pool_whitelist_pool ON pool_whitelist(pool_id);
CREATE INDEX idx_pool_whitelist_email ON pool_whitelist(pool_id, email);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Strategy: all application access via service role key (bypasses RLS).
-- RLS is defense-in-depth only — blocks anon/authenticated roles from
-- direct access. Real authorization is in the Next.js server layer.

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE pick_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knockout_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Public read access for tournament data and pools (needed for public views)
CREATE POLICY "public_read_tournaments" ON tournaments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_groups" ON groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_teams" ON teams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_matches" ON matches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_pools" ON pools FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "public_read_scoring" ON scoring_config FOR SELECT TO anon, authenticated USING (true);

-- Public read for pick sets, group picks, knockout picks (needed for standings, picks grid)
CREATE POLICY "public_read_pick_sets" ON pick_sets FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "public_read_group_picks" ON group_picks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_knockout_picks" ON knockout_picks FOR SELECT TO anon, authenticated USING (true);

-- Participants: public read of display_name (for standings)
CREATE POLICY "public_read_participants" ON participants FOR SELECT TO anon, authenticated USING (is_active = true);

-- Pool memberships: public read (needed for participant lists)
CREATE POLICY "public_read_memberships" ON pool_memberships FOR SELECT TO anon, authenticated USING (is_active = true);

-- Audit log: no public access
-- (admin access enforced in app layer via service role)

-- No public write access to anything — all writes go through service role
-- The service role bypasses RLS entirely, so no write policies needed.

-- Extra protection: audit_log can never be updated or deleted, even by service role
-- (enforced via trigger since service role bypasses RLS)
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pools_updated_at BEFORE UPDATE ON pools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_participants_updated_at BEFORE UPDATE ON participants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pool_memberships_updated_at BEFORE UPDATE ON pool_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pick_sets_updated_at BEFORE UPDATE ON pick_sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_group_picks_updated_at BEFORE UPDATE ON group_picks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_knockout_picks_updated_at BEFORE UPDATE ON knockout_picks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_matches_updated_at BEFORE UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Clean up expired sessions (call periodically or on login)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM sessions WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Clean up expired/used OTPs
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
    DELETE FROM otp_requests WHERE expires_at < now() OR used = true;
END;
$$ LANGUAGE plpgsql;
