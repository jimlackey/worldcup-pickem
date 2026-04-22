-- ============================================================================
-- World Cup Pick'em — Seed Data
-- Migration 002: 2026 FIFA World Cup tournament data (global/real)
-- ============================================================================
-- Corrected data based on the official FIFA draw (December 5, 2025) and
-- the completed playoff round (March 31, 2026). This seeds the GLOBAL
-- tournament data (pool_id = NULL). Demo pools get their own copies via
-- the seed-demo script.
-- ============================================================================

-- ============================================================================
-- TOURNAMENT
-- ============================================================================
INSERT INTO tournaments (id, name, year, kickoff_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '2026 FIFA World Cup',
    2026,
    '2026-06-11T19:00:00Z'
);

-- ============================================================================
-- GROUPS (12 groups, A through L)
-- ============================================================================
INSERT INTO groups (id, tournament_id, pool_id, name, letter) VALUES
('00000000-0000-0000-0001-000000001001', '00000000-0000-0000-0000-000000000001', NULL, 'Group A', 'A'),
('00000000-0000-0000-0001-000000002001', '00000000-0000-0000-0000-000000000001', NULL, 'Group B', 'B'),
('00000000-0000-0000-0001-000000003001', '00000000-0000-0000-0000-000000000001', NULL, 'Group C', 'C'),
('00000000-0000-0000-0001-000000004001', '00000000-0000-0000-0000-000000000001', NULL, 'Group D', 'D'),
('00000000-0000-0000-0001-000000005001', '00000000-0000-0000-0000-000000000001', NULL, 'Group E', 'E'),
('00000000-0000-0000-0001-000000006001', '00000000-0000-0000-0000-000000000001', NULL, 'Group F', 'F'),
('00000000-0000-0000-0001-000000007001', '00000000-0000-0000-0000-000000000001', NULL, 'Group G', 'G'),
('00000000-0000-0000-0001-000000008001', '00000000-0000-0000-0000-000000000001', NULL, 'Group H', 'H'),
('00000000-0000-0000-0001-000000009001', '00000000-0000-0000-0000-000000000001', NULL, 'Group I', 'I'),
('00000000-0000-0000-0001-000000010001', '00000000-0000-0000-0000-000000000001', NULL, 'Group J', 'J'),
('00000000-0000-0000-0001-000000011001', '00000000-0000-0000-0000-000000000001', NULL, 'Group K', 'K'),
('00000000-0000-0000-0001-000000012001', '00000000-0000-0000-0000-000000000001', NULL, 'Group L', 'L');

-- ============================================================================
-- TEAMS (48 teams)
-- ============================================================================
-- 2026 FIFA World Cup qualified teams with correct ISO alpha-2 flag codes.

-- Group A
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', NULL, 'Mexico', 'MEX', 'mx', '00000000-0000-0000-0001-000000001001'),
('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', NULL, 'South Africa', 'RSA', 'za', '00000000-0000-0000-0001-000000001001'),
('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', NULL, 'Korea Republic', 'KOR', 'kr', '00000000-0000-0000-0001-000000001001'),
('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001', NULL, 'Czechia', 'CZE', 'cz', '00000000-0000-0000-0001-000000001001');

-- Group B
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', NULL, 'Canada', 'CAN', 'ca', '00000000-0000-0000-0001-000000002001'),
('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000001', NULL, 'Bosnia and Herzegovina', 'BIH', 'ba', '00000000-0000-0000-0001-000000002001'),
('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0000-000000000001', NULL, 'Qatar', 'QAT', 'qa', '00000000-0000-0000-0001-000000002001'),
('00000000-0000-0000-0002-000000000008', '00000000-0000-0000-0000-000000000001', NULL, 'Switzerland', 'SUI', 'ch', '00000000-0000-0000-0001-000000002001');

-- Group C
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000009', '00000000-0000-0000-0000-000000000001', NULL, 'Brazil', 'BRA', 'br', '00000000-0000-0000-0001-000000003001'),
('00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0000-000000000001', NULL, 'Morocco', 'MAR', 'ma', '00000000-0000-0000-0001-000000003001'),
('00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0000-000000000001', NULL, 'Haiti', 'HAI', 'ht', '00000000-0000-0000-0001-000000003001'),
('00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0000-000000000001', NULL, 'Scotland', 'SCO', 'gb-sct', '00000000-0000-0000-0001-000000003001');

-- Group D
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000013', '00000000-0000-0000-0000-000000000001', NULL, 'United States', 'USA', 'us', '00000000-0000-0000-0001-000000004001'),
('00000000-0000-0000-0002-000000000014', '00000000-0000-0000-0000-000000000001', NULL, 'Paraguay', 'PAR', 'py', '00000000-0000-0000-0001-000000004001'),
('00000000-0000-0000-0002-000000000015', '00000000-0000-0000-0000-000000000001', NULL, 'Australia', 'AUS', 'au', '00000000-0000-0000-0001-000000004001'),
('00000000-0000-0000-0002-000000000016', '00000000-0000-0000-0000-000000000001', NULL, 'Türkiye', 'TUR', 'tr', '00000000-0000-0000-0001-000000004001');

-- Group E
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000017', '00000000-0000-0000-0000-000000000001', NULL, 'Germany', 'GER', 'de', '00000000-0000-0000-0001-000000005001'),
('00000000-0000-0000-0002-000000000018', '00000000-0000-0000-0000-000000000001', NULL, 'Curaçao', 'CUW', 'cw', '00000000-0000-0000-0001-000000005001'),
('00000000-0000-0000-0002-000000000019', '00000000-0000-0000-0000-000000000001', NULL, 'Ivory Coast', 'CIV', 'ci', '00000000-0000-0000-0001-000000005001'),
('00000000-0000-0000-0002-000000000020', '00000000-0000-0000-0000-000000000001', NULL, 'Ecuador', 'ECU', 'ec', '00000000-0000-0000-0001-000000005001');

-- Group F
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000021', '00000000-0000-0000-0000-000000000001', NULL, 'Netherlands', 'NED', 'nl', '00000000-0000-0000-0001-000000006001'),
('00000000-0000-0000-0002-000000000022', '00000000-0000-0000-0000-000000000001', NULL, 'Japan', 'JPN', 'jp', '00000000-0000-0000-0001-000000006001'),
('00000000-0000-0000-0002-000000000023', '00000000-0000-0000-0000-000000000001', NULL, 'Sweden', 'SWE', 'se', '00000000-0000-0000-0001-000000006001'),
('00000000-0000-0000-0002-000000000024', '00000000-0000-0000-0000-000000000001', NULL, 'Tunisia', 'TUN', 'tn', '00000000-0000-0000-0001-000000006001');

-- Group G
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000025', '00000000-0000-0000-0000-000000000001', NULL, 'Belgium', 'BEL', 'be', '00000000-0000-0000-0001-000000007001'),
('00000000-0000-0000-0002-000000000026', '00000000-0000-0000-0000-000000000001', NULL, 'Egypt', 'EGY', 'eg', '00000000-0000-0000-0001-000000007001'),
('00000000-0000-0000-0002-000000000027', '00000000-0000-0000-0000-000000000001', NULL, 'Iran', 'IRN', 'ir', '00000000-0000-0000-0001-000000007001'),
('00000000-0000-0000-0002-000000000028', '00000000-0000-0000-0000-000000000001', NULL, 'New Zealand', 'NZL', 'nz', '00000000-0000-0000-0001-000000007001');

-- Group H
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000029', '00000000-0000-0000-0000-000000000001', NULL, 'Spain', 'ESP', 'es', '00000000-0000-0000-0001-000000008001'),
('00000000-0000-0000-0002-000000000030', '00000000-0000-0000-0000-000000000001', NULL, 'Cape Verde', 'CPV', 'cv', '00000000-0000-0000-0001-000000008001'),
('00000000-0000-0000-0002-000000000031', '00000000-0000-0000-0000-000000000001', NULL, 'Saudi Arabia', 'KSA', 'sa', '00000000-0000-0000-0001-000000008001'),
('00000000-0000-0000-0002-000000000032', '00000000-0000-0000-0000-000000000001', NULL, 'Uruguay', 'URU', 'uy', '00000000-0000-0000-0001-000000008001');

-- Group I
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000033', '00000000-0000-0000-0000-000000000001', NULL, 'France', 'FRA', 'fr', '00000000-0000-0000-0001-000000009001'),
('00000000-0000-0000-0002-000000000034', '00000000-0000-0000-0000-000000000001', NULL, 'Senegal', 'SEN', 'sn', '00000000-0000-0000-0001-000000009001'),
('00000000-0000-0000-0002-000000000035', '00000000-0000-0000-0000-000000000001', NULL, 'Iraq', 'IRQ', 'iq', '00000000-0000-0000-0001-000000009001'),
('00000000-0000-0000-0002-000000000036', '00000000-0000-0000-0000-000000000001', NULL, 'Norway', 'NOR', 'no', '00000000-0000-0000-0001-000000009001');

-- Group J
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000037', '00000000-0000-0000-0000-000000000001', NULL, 'Argentina', 'ARG', 'ar', '00000000-0000-0000-0001-000000010001'),
('00000000-0000-0000-0002-000000000038', '00000000-0000-0000-0000-000000000001', NULL, 'Algeria', 'ALG', 'dz', '00000000-0000-0000-0001-000000010001'),
('00000000-0000-0000-0002-000000000039', '00000000-0000-0000-0000-000000000001', NULL, 'Austria', 'AUT', 'at', '00000000-0000-0000-0001-000000010001'),
('00000000-0000-0000-0002-000000000040', '00000000-0000-0000-0000-000000000001', NULL, 'Jordan', 'JOR', 'jo', '00000000-0000-0000-0001-000000010001');

-- Group K
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000041', '00000000-0000-0000-0000-000000000001', NULL, 'Portugal', 'POR', 'pt', '00000000-0000-0000-0001-000000011001'),
('00000000-0000-0000-0002-000000000042', '00000000-0000-0000-0000-000000000001', NULL, 'DR Congo', 'COD', 'cd', '00000000-0000-0000-0001-000000011001'),
('00000000-0000-0000-0002-000000000043', '00000000-0000-0000-0000-000000000001', NULL, 'Uzbekistan', 'UZB', 'uz', '00000000-0000-0000-0001-000000011001'),
('00000000-0000-0000-0002-000000000044', '00000000-0000-0000-0000-000000000001', NULL, 'Colombia', 'COL', 'co', '00000000-0000-0000-0001-000000011001');

-- Group L
INSERT INTO teams (id, tournament_id, pool_id, name, short_code, flag_code, group_id) VALUES
('00000000-0000-0000-0002-000000000045', '00000000-0000-0000-0000-000000000001', NULL, 'England', 'ENG', 'gb-eng', '00000000-0000-0000-0001-000000012001'),
('00000000-0000-0000-0002-000000000046', '00000000-0000-0000-0000-000000000001', NULL, 'Croatia', 'CRO', 'hr', '00000000-0000-0000-0001-000000012001'),
('00000000-0000-0000-0002-000000000047', '00000000-0000-0000-0000-000000000001', NULL, 'Ghana', 'GHA', 'gh', '00000000-0000-0000-0001-000000012001'),
('00000000-0000-0000-0002-000000000048', '00000000-0000-0000-0000-000000000001', NULL, 'Panama', 'PAN', 'pa', '00000000-0000-0000-0001-000000012001');

-- ============================================================================
-- GROUP PHASE MATCHES (72 total, chronological order)
-- ============================================================================
-- Match numbers 1-72 in kickoff order, using the official FIFA schedule.
-- We generate these with a PL/pgSQL block because the insert requires looking
-- up each team's UUID by name.

DO $$
DECLARE
    t_id UUID := '00000000-0000-0000-0000-000000000001';
    home_id UUID;
    away_id UUID;
    grp_id UUID;
BEGIN
    -- Match #1: Group A — Mexico vs South Africa
    SELECT id INTO grp_id FROM groups WHERE letter = 'A' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Mexico' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'South Africa' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 1, home_id, away_id, '2026-06-11T19:00:00Z', 'scheduled');
    -- Match #2: Group A — Korea Republic vs Czechia
    SELECT id INTO grp_id FROM groups WHERE letter = 'A' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Korea Republic' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Czechia' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 2, home_id, away_id, '2026-06-12T02:00:00Z', 'scheduled');
    -- Match #3: Group B — Canada vs Bosnia and Herzegovina
    SELECT id INTO grp_id FROM groups WHERE letter = 'B' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Canada' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Bosnia and Herzegovina' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 3, home_id, away_id, '2026-06-12T19:00:00Z', 'scheduled');
    -- Match #4: Group D — United States vs Paraguay
    SELECT id INTO grp_id FROM groups WHERE letter = 'D' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'United States' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Paraguay' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 4, home_id, away_id, '2026-06-13T01:00:00Z', 'scheduled');
    -- Match #5: Group D — Australia vs Türkiye
    SELECT id INTO grp_id FROM groups WHERE letter = 'D' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Australia' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Türkiye' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 5, home_id, away_id, '2026-06-13T04:00:00Z', 'scheduled');
    -- Match #6: Group B — Qatar vs Switzerland
    SELECT id INTO grp_id FROM groups WHERE letter = 'B' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Qatar' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Switzerland' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 6, home_id, away_id, '2026-06-13T19:00:00Z', 'scheduled');
    -- Match #7: Group C — Brazil vs Morocco
    SELECT id INTO grp_id FROM groups WHERE letter = 'C' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Brazil' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Morocco' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 7, home_id, away_id, '2026-06-13T22:00:00Z', 'scheduled');
    -- Match #8: Group C — Haiti vs Scotland
    SELECT id INTO grp_id FROM groups WHERE letter = 'C' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Haiti' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Scotland' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 8, home_id, away_id, '2026-06-14T01:00:00Z', 'scheduled');
    -- Match #9: Group E — Germany vs Curaçao
    SELECT id INTO grp_id FROM groups WHERE letter = 'E' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Germany' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Curaçao' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 9, home_id, away_id, '2026-06-14T17:00:00Z', 'scheduled');
    -- Match #10: Group F — Netherlands vs Japan
    SELECT id INTO grp_id FROM groups WHERE letter = 'F' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Netherlands' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Japan' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 10, home_id, away_id, '2026-06-14T20:00:00Z', 'scheduled');
    -- Match #11: Group E — Ivory Coast vs Ecuador
    SELECT id INTO grp_id FROM groups WHERE letter = 'E' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Ivory Coast' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Ecuador' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 11, home_id, away_id, '2026-06-14T23:00:00Z', 'scheduled');
    -- Match #12: Group F — Sweden vs Tunisia
    SELECT id INTO grp_id FROM groups WHERE letter = 'F' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Sweden' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Tunisia' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 12, home_id, away_id, '2026-06-15T02:00:00Z', 'scheduled');
    -- Match #13: Group H — Spain vs Cape Verde
    SELECT id INTO grp_id FROM groups WHERE letter = 'H' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Spain' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Cape Verde' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 13, home_id, away_id, '2026-06-15T16:00:00Z', 'scheduled');
    -- Match #14: Group G — Belgium vs Egypt
    SELECT id INTO grp_id FROM groups WHERE letter = 'G' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Belgium' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Egypt' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 14, home_id, away_id, '2026-06-15T19:00:00Z', 'scheduled');
    -- Match #15: Group H — Saudi Arabia vs Uruguay
    SELECT id INTO grp_id FROM groups WHERE letter = 'H' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Saudi Arabia' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Uruguay' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 15, home_id, away_id, '2026-06-15T22:00:00Z', 'scheduled');
    -- Match #16: Group G — Iran vs New Zealand
    SELECT id INTO grp_id FROM groups WHERE letter = 'G' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Iran' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'New Zealand' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 16, home_id, away_id, '2026-06-16T01:00:00Z', 'scheduled');
    -- Match #17: Group I — France vs Senegal
    SELECT id INTO grp_id FROM groups WHERE letter = 'I' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'France' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Senegal' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 17, home_id, away_id, '2026-06-16T19:00:00Z', 'scheduled');
    -- Match #18: Group I — Iraq vs Norway
    SELECT id INTO grp_id FROM groups WHERE letter = 'I' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Iraq' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Norway' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 18, home_id, away_id, '2026-06-16T22:00:00Z', 'scheduled');
    -- Match #19: Group J — Argentina vs Algeria
    SELECT id INTO grp_id FROM groups WHERE letter = 'J' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Argentina' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Algeria' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 19, home_id, away_id, '2026-06-17T01:00:00Z', 'scheduled');
    -- Match #20: Group J — Austria vs Jordan
    SELECT id INTO grp_id FROM groups WHERE letter = 'J' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Austria' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Jordan' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 20, home_id, away_id, '2026-06-17T04:00:00Z', 'scheduled');
    -- Match #21: Group K — Portugal vs DR Congo
    SELECT id INTO grp_id FROM groups WHERE letter = 'K' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Portugal' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'DR Congo' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 21, home_id, away_id, '2026-06-17T17:00:00Z', 'scheduled');
    -- Match #22: Group L — England vs Croatia
    SELECT id INTO grp_id FROM groups WHERE letter = 'L' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'England' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Croatia' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 22, home_id, away_id, '2026-06-17T20:00:00Z', 'scheduled');
    -- Match #23: Group L — Ghana vs Panama
    SELECT id INTO grp_id FROM groups WHERE letter = 'L' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Ghana' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Panama' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 23, home_id, away_id, '2026-06-17T23:00:00Z', 'scheduled');
    -- Match #24: Group K — Uzbekistan vs Colombia
    SELECT id INTO grp_id FROM groups WHERE letter = 'K' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Uzbekistan' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Colombia' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 24, home_id, away_id, '2026-06-18T02:00:00Z', 'scheduled');
    -- Match #25: Group A — Czechia vs South Africa
    SELECT id INTO grp_id FROM groups WHERE letter = 'A' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Czechia' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'South Africa' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 25, home_id, away_id, '2026-06-18T16:00:00Z', 'scheduled');
    -- Match #26: Group B — Switzerland vs Bosnia and Herzegovina
    SELECT id INTO grp_id FROM groups WHERE letter = 'B' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Switzerland' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Bosnia and Herzegovina' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 26, home_id, away_id, '2026-06-18T19:00:00Z', 'scheduled');
    -- Match #27: Group B — Canada vs Qatar
    SELECT id INTO grp_id FROM groups WHERE letter = 'B' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Canada' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Qatar' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 27, home_id, away_id, '2026-06-18T22:00:00Z', 'scheduled');
    -- Match #28: Group A — Mexico vs Korea Republic
    SELECT id INTO grp_id FROM groups WHERE letter = 'A' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Mexico' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Korea Republic' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 28, home_id, away_id, '2026-06-19T01:00:00Z', 'scheduled');
    -- Match #29: Group D — Türkiye vs Paraguay
    SELECT id INTO grp_id FROM groups WHERE letter = 'D' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Türkiye' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Paraguay' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 29, home_id, away_id, '2026-06-19T04:00:00Z', 'scheduled');
    -- Match #30: Group D — United States vs Australia
    SELECT id INTO grp_id FROM groups WHERE letter = 'D' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'United States' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Australia' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 30, home_id, away_id, '2026-06-19T19:00:00Z', 'scheduled');
    -- Match #31: Group C — Scotland vs Morocco
    SELECT id INTO grp_id FROM groups WHERE letter = 'C' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Scotland' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Morocco' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 31, home_id, away_id, '2026-06-19T22:00:00Z', 'scheduled');
    -- Match #32: Group C — Brazil vs Haiti
    SELECT id INTO grp_id FROM groups WHERE letter = 'C' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Brazil' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Haiti' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 32, home_id, away_id, '2026-06-20T01:00:00Z', 'scheduled');
    -- Match #33: Group F — Tunisia vs Japan
    SELECT id INTO grp_id FROM groups WHERE letter = 'F' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Tunisia' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Japan' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 33, home_id, away_id, '2026-06-20T04:00:00Z', 'scheduled');
    -- Match #34: Group F — Netherlands vs Sweden
    SELECT id INTO grp_id FROM groups WHERE letter = 'F' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Netherlands' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Sweden' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 34, home_id, away_id, '2026-06-20T17:00:00Z', 'scheduled');
    -- Match #35: Group E — Germany vs Ivory Coast
    SELECT id INTO grp_id FROM groups WHERE letter = 'E' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Germany' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Ivory Coast' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 35, home_id, away_id, '2026-06-20T20:00:00Z', 'scheduled');
    -- Match #36: Group E — Ecuador vs Curaçao
    SELECT id INTO grp_id FROM groups WHERE letter = 'E' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Ecuador' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Curaçao' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 36, home_id, away_id, '2026-06-21T00:00:00Z', 'scheduled');
    -- Match #37: Group H — Spain vs Saudi Arabia
    SELECT id INTO grp_id FROM groups WHERE letter = 'H' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Spain' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Saudi Arabia' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 37, home_id, away_id, '2026-06-21T16:00:00Z', 'scheduled');
    -- Match #38: Group G — Belgium vs Iran
    SELECT id INTO grp_id FROM groups WHERE letter = 'G' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Belgium' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Iran' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 38, home_id, away_id, '2026-06-21T19:00:00Z', 'scheduled');
    -- Match #39: Group H — Uruguay vs Cape Verde
    SELECT id INTO grp_id FROM groups WHERE letter = 'H' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Uruguay' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Cape Verde' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 39, home_id, away_id, '2026-06-21T22:00:00Z', 'scheduled');
    -- Match #40: Group G — New Zealand vs Egypt
    SELECT id INTO grp_id FROM groups WHERE letter = 'G' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'New Zealand' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Egypt' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 40, home_id, away_id, '2026-06-22T01:00:00Z', 'scheduled');
    -- Match #41: Group J — Argentina vs Austria
    SELECT id INTO grp_id FROM groups WHERE letter = 'J' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Argentina' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Austria' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 41, home_id, away_id, '2026-06-22T17:00:00Z', 'scheduled');
    -- Match #42: Group I — France vs Iraq
    SELECT id INTO grp_id FROM groups WHERE letter = 'I' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'France' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Iraq' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 42, home_id, away_id, '2026-06-22T21:00:00Z', 'scheduled');
    -- Match #43: Group I — Norway vs Senegal
    SELECT id INTO grp_id FROM groups WHERE letter = 'I' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Norway' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Senegal' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 43, home_id, away_id, '2026-06-23T00:00:00Z', 'scheduled');
    -- Match #44: Group J — Jordan vs Algeria
    SELECT id INTO grp_id FROM groups WHERE letter = 'J' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Jordan' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Algeria' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 44, home_id, away_id, '2026-06-23T03:00:00Z', 'scheduled');
    -- Match #45: Group K — Portugal vs Uzbekistan
    SELECT id INTO grp_id FROM groups WHERE letter = 'K' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Portugal' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Uzbekistan' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 45, home_id, away_id, '2026-06-23T17:00:00Z', 'scheduled');
    -- Match #46: Group L — England vs Ghana
    SELECT id INTO grp_id FROM groups WHERE letter = 'L' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'England' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Ghana' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 46, home_id, away_id, '2026-06-23T20:00:00Z', 'scheduled');
    -- Match #47: Group L — Panama vs Croatia
    SELECT id INTO grp_id FROM groups WHERE letter = 'L' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Panama' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Croatia' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 47, home_id, away_id, '2026-06-23T23:00:00Z', 'scheduled');
    -- Match #48: Group K — Colombia vs DR Congo
    SELECT id INTO grp_id FROM groups WHERE letter = 'K' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Colombia' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'DR Congo' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 48, home_id, away_id, '2026-06-24T02:00:00Z', 'scheduled');
    -- Match #49: Group B — Switzerland vs Canada
    SELECT id INTO grp_id FROM groups WHERE letter = 'B' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Switzerland' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Canada' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 49, home_id, away_id, '2026-06-24T19:00:00Z', 'scheduled');
    -- Match #50: Group B — Bosnia and Herzegovina vs Qatar
    SELECT id INTO grp_id FROM groups WHERE letter = 'B' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Bosnia and Herzegovina' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Qatar' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 50, home_id, away_id, '2026-06-24T19:00:00Z', 'scheduled');
    -- Match #51: Group C — Scotland vs Brazil
    SELECT id INTO grp_id FROM groups WHERE letter = 'C' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Scotland' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Brazil' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 51, home_id, away_id, '2026-06-24T22:00:00Z', 'scheduled');
    -- Match #52: Group C — Morocco vs Haiti
    SELECT id INTO grp_id FROM groups WHERE letter = 'C' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Morocco' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Haiti' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 52, home_id, away_id, '2026-06-24T22:00:00Z', 'scheduled');
    -- Match #53: Group A — Czechia vs Mexico
    SELECT id INTO grp_id FROM groups WHERE letter = 'A' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Czechia' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Mexico' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 53, home_id, away_id, '2026-06-25T01:00:00Z', 'scheduled');
    -- Match #54: Group A — South Africa vs Korea Republic
    SELECT id INTO grp_id FROM groups WHERE letter = 'A' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'South Africa' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Korea Republic' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 54, home_id, away_id, '2026-06-25T01:00:00Z', 'scheduled');
    -- Match #55: Group E — Curaçao vs Ivory Coast
    SELECT id INTO grp_id FROM groups WHERE letter = 'E' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Curaçao' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Ivory Coast' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 55, home_id, away_id, '2026-06-25T20:00:00Z', 'scheduled');
    -- Match #56: Group E — Ecuador vs Germany
    SELECT id INTO grp_id FROM groups WHERE letter = 'E' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Ecuador' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Germany' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 56, home_id, away_id, '2026-06-25T20:00:00Z', 'scheduled');
    -- Match #57: Group F — Japan vs Sweden
    SELECT id INTO grp_id FROM groups WHERE letter = 'F' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Japan' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Sweden' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 57, home_id, away_id, '2026-06-25T23:00:00Z', 'scheduled');
    -- Match #58: Group F — Tunisia vs Netherlands
    SELECT id INTO grp_id FROM groups WHERE letter = 'F' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Tunisia' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Netherlands' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 58, home_id, away_id, '2026-06-25T23:00:00Z', 'scheduled');
    -- Match #59: Group D — Türkiye vs United States
    SELECT id INTO grp_id FROM groups WHERE letter = 'D' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Türkiye' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'United States' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 59, home_id, away_id, '2026-06-26T02:00:00Z', 'scheduled');
    -- Match #60: Group D — Paraguay vs Australia
    SELECT id INTO grp_id FROM groups WHERE letter = 'D' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Paraguay' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Australia' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 60, home_id, away_id, '2026-06-26T02:00:00Z', 'scheduled');
    -- Match #61: Group I — Norway vs France
    SELECT id INTO grp_id FROM groups WHERE letter = 'I' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Norway' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'France' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 61, home_id, away_id, '2026-06-26T19:00:00Z', 'scheduled');
    -- Match #62: Group I — Senegal vs Iraq
    SELECT id INTO grp_id FROM groups WHERE letter = 'I' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Senegal' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Iraq' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 62, home_id, away_id, '2026-06-26T19:00:00Z', 'scheduled');
    -- Match #63: Group H — Cape Verde vs Saudi Arabia
    SELECT id INTO grp_id FROM groups WHERE letter = 'H' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Cape Verde' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Saudi Arabia' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 63, home_id, away_id, '2026-06-27T00:00:00Z', 'scheduled');
    -- Match #64: Group H — Uruguay vs Spain
    SELECT id INTO grp_id FROM groups WHERE letter = 'H' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Uruguay' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Spain' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 64, home_id, away_id, '2026-06-27T00:00:00Z', 'scheduled');
    -- Match #65: Group G — Egypt vs Iran
    SELECT id INTO grp_id FROM groups WHERE letter = 'G' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Egypt' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Iran' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 65, home_id, away_id, '2026-06-27T03:00:00Z', 'scheduled');
    -- Match #66: Group G — New Zealand vs Belgium
    SELECT id INTO grp_id FROM groups WHERE letter = 'G' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'New Zealand' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Belgium' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 66, home_id, away_id, '2026-06-27T03:00:00Z', 'scheduled');
    -- Match #67: Group L — Panama vs England
    SELECT id INTO grp_id FROM groups WHERE letter = 'L' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Panama' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'England' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 67, home_id, away_id, '2026-06-27T21:00:00Z', 'scheduled');
    -- Match #68: Group L — Croatia vs Ghana
    SELECT id INTO grp_id FROM groups WHERE letter = 'L' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Croatia' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Ghana' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 68, home_id, away_id, '2026-06-27T21:00:00Z', 'scheduled');
    -- Match #69: Group K — Colombia vs Portugal
    SELECT id INTO grp_id FROM groups WHERE letter = 'K' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Colombia' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Portugal' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 69, home_id, away_id, '2026-06-27T23:30:00Z', 'scheduled');
    -- Match #70: Group K — DR Congo vs Uzbekistan
    SELECT id INTO grp_id FROM groups WHERE letter = 'K' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'DR Congo' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Uzbekistan' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 70, home_id, away_id, '2026-06-27T23:30:00Z', 'scheduled');
    -- Match #71: Group J — Jordan vs Argentina
    SELECT id INTO grp_id FROM groups WHERE letter = 'J' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Jordan' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Argentina' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 71, home_id, away_id, '2026-06-28T02:00:00Z', 'scheduled');
    -- Match #72: Group J — Algeria vs Austria
    SELECT id INTO grp_id FROM groups WHERE letter = 'J' AND pool_id IS NULL;
    SELECT id INTO home_id FROM teams WHERE name = 'Algeria' AND pool_id IS NULL;
    SELECT id INTO away_id FROM teams WHERE name = 'Austria' AND pool_id IS NULL;
    INSERT INTO matches (tournament_id, pool_id, phase, group_id, match_number, home_team_id, away_team_id, scheduled_at, status)
    VALUES (t_id, NULL, 'group', grp_id, 72, home_id, away_id, '2026-06-28T02:00:00Z', 'scheduled');
END $$;

-- ============================================================================
-- KNOCKOUT MATCH SLOTS (31 total)
-- ============================================================================
-- These are placeholder slots with NULL team IDs.
-- Admin populates teams after group phase completes.

-- Round of 32 (16 matches) — match_numbers 73-88
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
