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

/**
 * Pool-level consolation feature selection. The three values are mutually
 * exclusive — a pool runs at most one consolation feature at a time.
 *
 *   "none"           No consolation feature at all. 31-pick bracket and
 *                    no pre-tournament 3rd-place pick.
 *   "bracket"        The in-bracket #104 consolation match (the original
 *                    consolation feature, added in migration 013). Sets
 *                    consolation_match_enabled = TRUE under the hood so
 *                    all existing callsites keep working unchanged.
 *   "preseason_pick" Pre-Tournament 3rd Place Selection. Players make an
 *                    optional pick for any country during the Group Phase;
 *                    editable until group_lock_at. Stored in
 *                    third_place_picks. An extra per-pick-set buy-in is
 *                    tracked on pool_payments.is_third_place_paid.
 *
 * Added in migration 024.
 */
export type ConsolationMode = "none" | "bracket" | "preseason_pick";
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
  /**
   * Current FIFA/Coca-Cola men's world ranking for the team.
   * 1 = best in the world; NULL means "no ranking recorded" (and the
   * rankings badge in the UI simply doesn't render for the team).
   * Added in migration 014.
   */
  fifa_ranking: number | null;
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
  /**
   * Betting money lines stored as American odds. A negative value
   * indicates the favourite (e.g. -190 means risk 190 to win 100); a
   * positive value indicates the underdog (e.g. +600 means risk 100 to
   * win 600). NULL means "no line on file" — the UI renders the pick
   * button without the line. Added in migration 014.
   */
  home_money_line: number | null;
  draw_money_line: number | null;
  away_money_line: number | null;
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
  //
  // Post-migration 024 this column is a *derived* boolean kept in sync
  // by a DB trigger from `consolation_mode`. consolation_mode is the
  // source of truth; the boolean is preserved so all pre-024 callers
  // (bracket-wiring, what-if/queries, the read-only bracket view, the
  // about page) keep working with zero touch.
  consolation_match_enabled: boolean;
  /**
   * Which consolation feature (if any) the pool has enabled. Mutually
   * exclusive — at most one consolation feature per pool. See
   * ConsolationMode for the value semantics. Added in migration 024.
   */
  consolation_mode: ConsolationMode;
  /**
   * When true, render each team's FIFA ranking inline beside its name on
   * the editable group picks form (/{slug}/my-picks/{pickSetId}).
   * Default FALSE — added in migration 014.
   */
  show_fifa_rankings: boolean;
  /**
   * When true, render each match's money lines beneath the home / draw /
   * away pick buttons on the editable group picks form. Default FALSE —
   * added in migration 014.
   */
  show_match_lines: boolean;
  show_player_names: boolean;
  // ---- About page configuration (migration 023) ----
  // Section visibility toggles. Stages and Scoring default ON to match
  // the page's pre-migration behaviour; Payout defaults OFF because the
  // section is new and pools have no payout copy by default.
  about_show_stages: boolean;
  about_show_scoring: boolean;
  about_show_payout: boolean;
  // Free-text copy for each customisable region of the About page. The
  // migration-time defaults reproduce the static prose that used to be
  // hard-coded in src/app/[poolSlug]/about/about-view.tsx, so existing
  // pools read identically after the migration. Payout and Footer
  // default to empty strings.
  about_header_text: string;
  about_stages_intro_text: string;
  about_stage1_text: string;
  about_stage2_text: string;
  about_stage3_text: string;
  about_stage4_text: string;
  about_scoring_text: string;
  about_payout_text: string;
  about_footer_text: string;
  // ---- Payment config (migration 025) ----
  /**
   * Per-pick-set entry fee, stored as integer cents (e.g. $20.00 →
   * 2000). Cents avoid the JS-number precision quirks that bite
   * NUMERIC, and side-step Postgres's locale-dependent `money` type.
   * Default 2000 ($20.00).
   */
  entry_fee_cents: number;
  /**
   * Optional consolation buy-in, stored as integer cents (same units
   * as entry_fee_cents). Gates the pre-tournament 3rd-place pick
   * (migration 024). Default 500 ($5.00).
   */
  consolation_fee_cents: number;
  /**
   * Number of winning places that get a payout. 0 means "no payout
   * schedule recorded". 1–10 is enforced by a DB CHECK constraint
   * (migration 025); when this is non-zero, exactly this many rows
   * exist in pool_payouts and their percents sum to 100.
   */
  payout_winner_count: number;
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

/**
 * A self-service "Request access" submission from the login page (migration
 * 026). Created when a non-whitelisted visitor asks to be let into a pool;
 * resolved to `granted` when any pool admin clicks the tokenised "Grant
 * access" link in the notification email.
 */
export type AccessRequestStatus = "pending" | "granted" | "cancelled";

export interface AccessRequest {
  id: string;
  pool_id: string;
  email: string;
  referral_text: string | null;
  // Unguessable capability token embedded in the admin "Grant access" link.
  token: string;
  status: AccessRequestStatus;
  // Which admin approved, and when. Null while pending.
  granted_by_email: string | null;
  granted_at: string | null;
  created_at: string;
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

/**
 * Optional pre-tournament pick for who finishes third in the whole
 * tournament. Only relevant in pools where consolation_mode =
 * 'preseason_pick'. One row per pick set max; players may not have
 * a row at all (the pick is optional).
 *
 * Added in migration 024.
 */
export interface ThirdPlacePick {
  id: string;
  pick_set_id: string;
  picked_team_id: string;
  is_correct: boolean | null;
  submitted_at: string;
  updated_at: string;
}

/**
 * Per-pool payout schedule row (migration 025). One row per
 * (pool_id, place). When pool.payout_winner_count is N, exactly N
 * rows exist for that pool with places 1..N; the percents across
 * those rows sum to 100. When payout_winner_count is 0, no rows
 * exist for the pool.
 *
 * Percent is an integer 0–100 (per the DB CHECK). We deliberately
 * don't model fractional percentages — the admin form's UI is
 * keyboard-friendly integers and "33%, 33%, 34%" is the canonical
 * way to handle non-divisible splits.
 */
export interface PoolPayout {
  pool_id: string;
  place: number;
  percent: number;
  created_at: string;
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

/**
 * Admin-defined HTML widget that can be inserted into broadcast emails
 * as `{{slug}}`. Mirrors the `custom_email_widgets` table (migration
 * 018). Pool-scoped — the same slug in two different pools is two
 * independent widgets.
 */
export interface CustomEmailWidget {
  id: string;
  pool_id: string;
  /**
   * Token name used in email bodies. Matches the regex `[a-zA-Z0-9_-]+`
   * (same as the built-in widgets). Unique per pool.
   */
  slug: string;
  /** Human-friendly name shown in the picker dropdown / insert pills. */
  label: string;
  /**
   * Raw HTML the admin authored. Spliced into the email body unescaped
   * (the email composer is admin-only — see render-email-body.ts).
   */
  html_body: string;
  created_at: string;
  updated_at: string;
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
