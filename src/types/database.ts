// ============================================================================
// Database types — mirrors the SQL schema
// These are manually maintained. For auto-generated types, run:
//   npm run db:types
// ============================================================================

export type MatchPhase =
  | "group"
  | "r32"
  | "r16"
  | "qf"
  | "sf"
  | "final"
  // Third-place / consolation match between losing semifinalists.
  // Only present in pools where consolation_match_enabled is TRUE; the
  // app filters this phase out for pools that have it disabled.
  | "consolation";
export type MatchResult = "home" | "draw" | "away";
export type MatchStatus = "scheduled" | "in_progress" | "completed";
export type PoolRole = "player" | "admin";
export type PickValue = "home" | "draw" | "away";

// ---- Global tables ----

export interface Tournament {
  id: string;
  name: string;
  year: number;
  kickoff_at: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  tournament_id: string;
  pool_id: string | null;
  name: string;
  letter: string;
  created_at: string;
}

export interface Team {
  id: string;
  tournament_id: string;
  pool_id: string | null;
  name: string;
  short_code: string;
  flag_code: string;  // ISO alpha-2 or subdivision, e.g. "us", "gb-eng"
  group_id: string | null;
  created_at: string;
}

export interface Match {
  id: string;
  tournament_id: string;
  pool_id: string | null;
  phase: MatchPhase;
  group_id: string | null;
  match_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  scheduled_at: string | null;
  home_score: number | null;
  away_score: number | null;
  result: MatchResult | null;
  status: MatchStatus;
  label: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Pool-scoped tables ----

export interface Pool {
  id: string;
  name: string;
  slug: string;
  tournament_id: string;
  max_pick_sets_per_player: number;
  group_lock_at: string | null;
  knockout_open_at: string | null;
  knockout_lock_at: string | null;
  is_demo: boolean;
  is_listed: boolean;
  is_active: boolean;
  // When true, every page under /{slug}/ except the auth surface requires
  // a logged-in pool session. The pool itself can still appear on the
  // public listing (is_listed) but its contents are private to members.
  requires_login_to_view: boolean;
  // When true, the pool includes the third-place / consolation match
  // (match_number 104) in the bracket — fed by the losers of the two
  // semifinals. When false, the pool behaves as if the match doesn't
  // exist: the row stays in the DB but the app filters it out of views,
  // pickers, scoring, and progress totals. Default TRUE.
  consolation_match_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PoolMembership {
  id: string;
  pool_id: string;
  participant_id: string;
  role: PoolRole;
  is_approved: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PickSet {
  id: string;
  pool_id: string;
  participant_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupPick {
  id: string;
  pick_set_id: string;
  match_id: string;
  pick: PickValue;
  is_correct: boolean | null;
  submitted_at: string;
  updated_at: string;
}

export interface KnockoutPick {
  id: string;
  pick_set_id: string;
  match_id: string;
  picked_team_id: string;
  is_correct: boolean | null;
  submitted_at: string;
  updated_at: string;
}

export interface ScoringConfig {
  id: string;
  pool_id: string;
  phase: MatchPhase;
  points: number;
}

export interface PoolWhitelist {
  id: string;
  pool_id: string;
  email: string;
  added_at: string;
}

export interface OtpRequest {
  id: string;
  email: string;
  pool_id: string;
  code_hash: string;
  expires_at: string;
  used: boolean;
  attempts: number;
  ip_address: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  pool_id: string;
  participant_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  pool_id: string;
  actor_id: string | null;
  actor_email: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
}

// ---- Computed / joined types ----

export interface MatchWithTeams extends Match {
  home_team: Team | null;
  away_team: Team | null;
  group: Group | null;
}

export interface PickSetWithParticipant extends PickSet {
  participant: Participant;
}

export interface StandingsRow {
  pick_set_id: string;
  pick_set_name: string;
  participant_id: string;
  participant_email: string;
  display_name: string | null;
  group_points: number;
  knockout_points: number;
  total_points: number;
  rank?: number;
}

export interface PoolSession {
  sessionId: string;
  poolId: string;
  poolSlug: string;
  participantId: string;
  email: string;
  displayName: string | null;
  role: PoolRole;
  expiresAt: string;
}
