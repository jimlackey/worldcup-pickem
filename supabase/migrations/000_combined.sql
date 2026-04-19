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
-- ============================================================================
-- World Cup Pick'em — Seed Data
-- Migration 002: 2026 FIFA World Cup tournament data (global/real)
-- ============================================================================
-- This seeds the GLOBAL tournament data (pool_id = NULL).
-- Demo pools get their own copies via the seed-demo script.
-- ============================================================================

-- ============================================================================
-- TOURNAMENT
-- ============================================================================
INSERT INTO tournaments (id, name, year, kickoff_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '2026 FIFA World Cup',
    2026,
    '2026-06-11T00:00:00Z'
);

-- ============================================================================
-- GROUPS (12 groups, A through L)
-- ============================================================================
-- Using deterministic UUIDs for easy reference: group A = ...a01, B = ...b01, etc.

INSERT INTO groups (id, tournament_id, pool_id, name, letter) VALUES
('00000000-0000-0000-0001-00000000a001', '00000000-0000-0000-0000-000000000001', NULL, 'Group A', 'A'),
('00000000-0000-0000-0001-00000000b001', '00000000-0000-0000-0000-000000000001', NULL, 'Group B', 'B'),
('00000000-0000-0000-0001-00000000c001', '00000000-0000-0000-0000-000000000001', NULL, 'Group C', 'C'),
('00000000-0000-0000-0001-00000000d001', '00000000-0000-0000-0000-000000000001', NULL, 'Group D', 'D'),
('00000000-0000-0000-0001-00000000e001', '00000000-0000-0000-0000-000000000001', NULL, 'Group E', 'E'),
('00000000-0000-0000-0001-00000000f001', '00000000-0000-0000-0000-000000000001', NULL, 'Group F', 'F'),
('00000000-0000-0000-0001-000000010001', '00000000-0000-0000-0000-000000000001', NULL, 'Group G', 'G'),
('00000000-0000-0000-0001-000000020001', '00000000-0000-0000-0000-000000000001', NULL, 'Group H', 'H'),
('00000000-0000-0000-0001-000000030001', '00000000-0000-0000-0000-000000000001', NULL, 'Group I', 'I'),
('00000000-0000-0000-0001-000000040001', '00000000-0000-0000-0000-000000000001', NULL, 'Group J', 'J'),
('00000000-0000-0000-0001-000000050001', '00000000-0000-0000-0000-000000000001', NULL, 'Group K', 'K'),
('00000000-0000-0000-0001-000000060001', '00000000-0000-0000-0000-000000000001', NULL, 'Group L', 'L');

-- ============================================================================
-- TEAMS (48 teams)
-- ============================================================================
-- 2026 FIFA World Cup qualified teams with correct ISO alpha-2 flag codes.
-- Group assignments based on the official FIFA draw (December 2025).
-- Team UUIDs: deterministic pattern for easy reference.

-- Helper aliases for group IDs
-- Group A
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', NULL, 'Morocco',       'MAR', 'ma', '00000000-0000-0000-0001-00000000a001'),
('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', NULL, 'Peru',          'PER', 'pe', '00000000-0000-0000-0001-00000000a001'),
('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', NULL, 'Canada',        'CAN', 'ca', '00000000-0000-0000-0001-00000000a001'),
('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001', NULL, 'Australia',     'AUS', 'au', '00000000-0000-0000-0001-00000000a001');

-- Group B
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', NULL, 'France',        'FRA', 'fr', '00000000-0000-0000-0001-00000000b001'),
('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000001', NULL, 'Colombia',      'COL', 'co', '00000000-0000-0000-0001-00000000b001'),
('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0000-000000000001', NULL, 'Saudi Arabia',  'KSA', 'sa', '00000000-0000-0000-0001-00000000b001'),
('00000000-0000-0000-0002-000000000008', '00000000-0000-0000-0000-000000000001', NULL, 'New Zealand',   'NZL', 'nz', '00000000-0000-0000-0001-00000000b001');

-- Group C
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000009', '00000000-0000-0000-0000-000000000001', NULL, 'Argentina',     'ARG', 'ar', '00000000-0000-0000-0001-00000000c001'),
('00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0000-000000000001', NULL, 'Mexico',        'MEX', 'mx', '00000000-0000-0000-0001-00000000c001'),
('00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0000-000000000001', NULL, 'Uzbekistan',    'UZB', 'uz', '00000000-0000-0000-0001-00000000c001'),
('00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0000-000000000001', NULL, 'Egypt',         'EGY', 'eg', '00000000-0000-0000-0001-00000000c001');

-- Group D
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000013', '00000000-0000-0000-0000-000000000001', NULL, 'Brazil',        'BRA', 'br', '00000000-0000-0000-0001-00000000d001'),
('00000000-0000-0000-0002-000000000014', '00000000-0000-0000-0000-000000000001', NULL, 'Italy',         'ITA', 'it', '00000000-0000-0000-0001-00000000d001'),
('00000000-0000-0000-0002-000000000015', '00000000-0000-0000-0000-000000000001', NULL, 'Ecuador',       'ECU', 'ec', '00000000-0000-0000-0001-00000000d001'),
('00000000-0000-0000-0002-000000000016', '00000000-0000-0000-0000-000000000001', NULL, 'Bahrain',       'BHR', 'bh', '00000000-0000-0000-0001-00000000d001');

-- Group E
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000017', '00000000-0000-0000-0000-000000000001', NULL, 'Portugal',      'POR', 'pt', '00000000-0000-0000-0001-00000000e001'),
('00000000-0000-0000-0002-000000000018', '00000000-0000-0000-0000-000000000001', NULL, 'Denmark',       'DEN', 'dk', '00000000-0000-0000-0001-00000000e001'),
('00000000-0000-0000-0002-000000000019', '00000000-0000-0000-0000-000000000001', NULL, 'Serbia',        'SRB', 'rs', '00000000-0000-0000-0001-00000000e001'),
('00000000-0000-0000-0002-000000000020', '00000000-0000-0000-0000-000000000001', NULL, 'Bolivia',       'BOL', 'bo', '00000000-0000-0000-0001-00000000e001');

-- Group F
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000021', '00000000-0000-0000-0000-000000000001', NULL, 'Netherlands',   'NED', 'nl', '00000000-0000-0000-0001-00000000f001'),
('00000000-0000-0000-0002-000000000022', '00000000-0000-0000-0000-000000000001', NULL, 'Hungary',       'HUN', 'hu', '00000000-0000-0000-0001-00000000f001'),
('00000000-0000-0000-0002-000000000023', '00000000-0000-0000-0000-000000000001', NULL, 'Costa Rica',    'CRC', 'cr', '00000000-0000-0000-0001-00000000f001'),
('00000000-0000-0000-0002-000000000024', '00000000-0000-0000-0000-000000000001', NULL, 'Trinidad and Tobago', 'TRI', 'tt', '00000000-0000-0000-0001-00000000f001');

-- Group G
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000025', '00000000-0000-0000-0000-000000000001', NULL, 'Spain',         'ESP', 'es', '00000000-0000-0000-0001-000000010001'),
('00000000-0000-0000-0002-000000000026', '00000000-0000-0000-0000-000000000001', NULL, 'Turkey',        'TUR', 'tr', '00000000-0000-0000-0001-000000010001'),
('00000000-0000-0000-0002-000000000027', '00000000-0000-0000-0000-000000000001', NULL, 'China PR',      'CHN', 'cn', '00000000-0000-0000-0001-000000010001'),
('00000000-0000-0000-0002-000000000028', '00000000-0000-0000-0000-000000000001', NULL, 'Honduras',      'HON', 'hn', '00000000-0000-0000-0001-000000010001');

-- Group H
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000029', '00000000-0000-0000-0000-000000000001', NULL, 'England',       'ENG', 'gb-eng', '00000000-0000-0000-0001-000000020001'),
('00000000-0000-0000-0002-000000000030', '00000000-0000-0000-0000-000000000001', NULL, 'Senegal',       'SEN', 'sn', '00000000-0000-0000-0001-000000020001'),
('00000000-0000-0000-0002-000000000031', '00000000-0000-0000-0000-000000000001', NULL, 'Albania',       'ALB', 'al', '00000000-0000-0000-0001-000000020001'),
('00000000-0000-0000-0002-000000000032', '00000000-0000-0000-0000-000000000001', NULL, 'Qatar',         'QAT', 'qa', '00000000-0000-0000-0001-000000020001');

-- Group I
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000033', '00000000-0000-0000-0000-000000000001', NULL, 'Germany',       'GER', 'de', '00000000-0000-0000-0001-000000030001'),
('00000000-0000-0000-0002-000000000034', '00000000-0000-0000-0000-000000000001', NULL, 'Chile',         'CHI', 'cl', '00000000-0000-0000-0001-000000030001'),
('00000000-0000-0000-0002-000000000035', '00000000-0000-0000-0000-000000000001', NULL, 'Japan',         'JPN', 'jp', '00000000-0000-0000-0001-000000030001'),
('00000000-0000-0000-0002-000000000036', '00000000-0000-0000-0000-000000000001', NULL, 'Slovenia',      'SVN', 'si', '00000000-0000-0000-0001-000000030001');

-- Group J
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000037', '00000000-0000-0000-0000-000000000001', NULL, 'United States', 'USA', 'us', '00000000-0000-0000-0001-000000040001'),
('00000000-0000-0000-0002-000000000038', '00000000-0000-0000-0000-000000000001', NULL, 'Uruguay',       'URU', 'uy', '00000000-0000-0000-0001-000000040001'),
('00000000-0000-0000-0002-000000000039', '00000000-0000-0000-0000-000000000001', NULL, 'Panama',        'PAN', 'pa', '00000000-0000-0000-0001-000000040001'),
('00000000-0000-0000-0002-000000000040', '00000000-0000-0000-0000-000000000001', NULL, 'South Korea',   'KOR', 'kr', '00000000-0000-0000-0001-000000040001');

-- Group K
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000041', '00000000-0000-0000-0000-000000000001', NULL, 'Belgium',       'BEL', 'be', '00000000-0000-0000-0001-000000050001'),
('00000000-0000-0000-0002-000000000042', '00000000-0000-0000-0000-000000000001', NULL, 'Paraguay',      'PAR', 'py', '00000000-0000-0000-0001-000000050001'),
('00000000-0000-0000-0002-000000000043', '00000000-0000-0000-0000-000000000001', NULL, 'IR Iran',       'IRN', 'ir', '00000000-0000-0000-0001-000000050001'),
('00000000-0000-0000-0002-000000000044', '00000000-0000-0000-0000-000000000001', NULL, 'Cameroon',      'CMR', 'cm', '00000000-0000-0000-0001-000000050001');

-- Group L
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000045', '00000000-0000-0000-0000-000000000001', NULL, 'Croatia',       'CRO', 'hr', '00000000-0000-0000-0001-000000060001'),
('00000000-0000-0000-0002-000000000046', '00000000-0000-0000-0000-000000000001', NULL, 'Wales',         'WAL', 'gb-wls', '00000000-0000-0000-0001-000000060001'),
('00000000-0000-0000-0002-000000000047', '00000000-0000-0000-0000-000000000001', NULL, 'Scotland',      'SCO', 'gb-sct', '00000000-0000-0000-0001-000000060001'),
('00000000-0000-0000-0002-000000000048', '00000000-0000-0000-0000-000000000001', NULL, 'Jamaica',       'JAM', 'jm', '00000000-0000-0000-0001-000000060001');

-- ============================================================================
-- GROUP PHASE MATCHES (72 total: 6 per group × 12 groups)
-- ============================================================================
-- Within each group of 4 teams (T1, T2, T3, T4), the 6 matches are:
-- Match Day 1: T1 vs T2, T3 vs T4
-- Match Day 2: T1 vs T3, T2 vs T4
-- Match Day 3: T1 vs T4, T2 vs T3
-- Match numbers: sequential 1-72 for ordering

-- Use a DO block to generate all group matches programmatically
DO $$
DECLARE
    t_id UUID := '00000000-0000-0000-0000-000000000001';
    g RECORD;
    team_ids UUID[];
    match_num INT := 0;
    -- Pairs for round-robin: (0,1), (2,3), (0,2), (1,3), (0,3), (1,2)
    home_idx INT[] := ARRAY[0, 2, 0, 1, 0, 1];
    away_idx INT[] := ARRAY[1, 3, 2, 3, 3, 2];
    base_date TIMESTAMPTZ := '2026-06-11T16:00:00Z';
    i INT;
BEGIN
    FOR g IN SELECT id, name FROM groups WHERE tournament_id = t_id AND pool_id IS NULL ORDER BY letter
    LOOP
        -- Get ordered team IDs for this group
        SELECT array_agg(id ORDER BY id) INTO team_ids
        FROM teams WHERE group_id = g.id AND pool_id IS NULL;

        FOR i IN 1..6 LOOP
            match_num := match_num + 1;
            INSERT INTO matches (
                tournament_id, pool_id, phase, group_id, match_number,
                home_team_id, away_team_id, scheduled_at, status
            ) VALUES (
                t_id, NULL, 'group', g.id, match_num,
                team_ids[home_idx[i] + 1], team_ids[away_idx[i] + 1],
                base_date + (match_num * INTERVAL '4 hours'),
                'scheduled'
            );
        END LOOP;
    END LOOP;
END $$;

-- ============================================================================
-- KNOCKOUT MATCH SLOTS (31 total)
-- ============================================================================
-- These are placeholder slots with NULL team IDs.
-- Admin populates teams after group phase completes.
-- Labels describe seeding (e.g. "1A vs 2B") for reference.

-- Round of 32 (16 matches) — match_numbers 73-88
-- Standard FIFA bracket: top 2 per group + 8 best 3rd-place teams = 32
INSERT INTO matches (tournament_id, pool_id, phase, match_number, status, label) VALUES
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 73, 'scheduled', 'R32 Match 1'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 74, 'scheduled', 'R32 Match 2'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 75, 'scheduled', 'R32 Match 3'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 76, 'scheduled', 'R32 Match 4'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 77, 'scheduled', 'R32 Match 5'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 78, 'scheduled', 'R32 Match 6'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 79, 'scheduled', 'R32 Match 7'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 80, 'scheduled', 'R32 Match 8'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 81, 'scheduled', 'R32 Match 9'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 82, 'scheduled', 'R32 Match 10'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 83, 'scheduled', 'R32 Match 11'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 84, 'scheduled', 'R32 Match 12'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 85, 'scheduled', 'R32 Match 13'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 86, 'scheduled', 'R32 Match 14'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 87, 'scheduled', 'R32 Match 15'),
('00000000-0000-0000-0000-000000000001', NULL, 'r32', 88, 'scheduled', 'R32 Match 16');

-- Round of 16 (8 matches) — match_numbers 89-96
INSERT INTO matches (tournament_id, pool_id, phase, match_number, status, label) VALUES
('00000000-0000-0000-0000-000000000001', NULL, 'r16', 89, 'scheduled', 'R16 Match 1'),
('00000000-0000-0000-0000-000000000001', NULL, 'r16', 90, 'scheduled', 'R16 Match 2'),
('00000000-0000-0000-0000-000000000001', NULL, 'r16', 91, 'scheduled', 'R16 Match 3'),
('00000000-0000-0000-0000-000000000001', NULL, 'r16', 92, 'scheduled', 'R16 Match 4'),
('00000000-0000-0000-0000-000000000001', NULL, 'r16', 93, 'scheduled', 'R16 Match 5'),
('00000000-0000-0000-0000-000000000001', NULL, 'r16', 94, 'scheduled', 'R16 Match 6'),
('00000000-0000-0000-0000-000000000001', NULL, 'r16', 95, 'scheduled', 'R16 Match 7'),
('00000000-0000-0000-0000-000000000001', NULL, 'r16', 96, 'scheduled', 'R16 Match 8');

-- Quarterfinals (4 matches) — match_numbers 97-100
INSERT INTO matches (tournament_id, pool_id, phase, match_number, status, label) VALUES
('00000000-0000-0000-0000-000000000001', NULL, 'qf', 97, 'scheduled', 'QF Match 1'),
('00000000-0000-0000-0000-000000000001', NULL, 'qf', 98, 'scheduled', 'QF Match 2'),
('00000000-0000-0000-0000-000000000001', NULL, 'qf', 99, 'scheduled', 'QF Match 3'),
('00000000-0000-0000-0000-000000000001', NULL, 'qf', 100, 'scheduled', 'QF Match 4');

-- Semifinals (2 matches) — match_numbers 101-102
INSERT INTO matches (tournament_id, pool_id, phase, match_number, status, label) VALUES
('00000000-0000-0000-0000-000000000001', NULL, 'sf', 101, 'scheduled', 'SF Match 1'),
('00000000-0000-0000-0000-000000000001', NULL, 'sf', 102, 'scheduled', 'SF Match 2');

-- Final (1 match) — match_number 103
INSERT INTO matches (tournament_id, pool_id, phase, match_number, status, label) VALUES
('00000000-0000-0000-0000-000000000001', NULL, 'final', 103, 'scheduled', 'Final');
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
