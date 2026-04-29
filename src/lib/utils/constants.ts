import type { MatchPhase } from "@/types/database";

export const TOURNAMENT_ID = process.env.NEXT_PUBLIC_TOURNAMENT_ID!;

// Phase display names and order
export const PHASES: { value: MatchPhase; label: string; order: number }[] = [
  { value: "group", label: "Group Phase", order: 1 },
  { value: "r32", label: "Round of 32", order: 2 },
  { value: "r16", label: "Round of 16", order: 3 },
  { value: "qf", label: "Quarterfinals", order: 4 },
  { value: "sf", label: "Semifinals", order: 5 },
  { value: "final", label: "Final", order: 6 },
];

export const PHASE_LABELS: Record<MatchPhase, string> = {
  group: "Group Phase",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarterfinals",
  sf: "Semifinals",
  final: "Final",
};

// Default scoring — used when initializing a new pool.
//
// Tuned to give later rounds proportionally more weight: a single Final
// pick (18 pts) is worth more than nine Group-Phase picks (9 × 2 = 18),
// so a player who nails the bracket can still climb past someone who
// dominated the group stage. The values must be kept in sync with the
// `initialize_pool_scoring()` SQL function (supabase/migrations/003_helpers.sql
// and the same function block in 000_combined.sql) and with the fallback
// map in src/lib/what-if/queries.ts. Migration 011 brings existing demo
// pools onto these new values.
export const DEFAULT_SCORING: Record<MatchPhase, number> = {
  group: 2,
  r32: 3,
  r16: 5,
  qf: 8,
  sf: 12,
  final: 18,
};

// Default tournament dates — used as initial values when a new pool is
// created via setup-pool.ts or the super-admin "Create Pool" UI.
//
// Stored as UTC ISO strings to match the timestamptz column shape.
// In June 2026 Pacific Time is PDT (UTC-7), so:
//
//   group_lock_at     2026-06-11 13:00 PT  →  2026-06-11T20:00:00Z
//   knockout_open_at  2026-06-27 21:00 PT  →  2026-06-28T04:00:00Z
//   knockout_lock_at  2026-06-29 09:00 PT  →  2026-06-29T16:00:00Z
//
// Demo pools intentionally don't use these — each demo pool has its own
// hand-picked dates in scripts/seed-demo.ts to drive it into a specific
// tournament phase. Migration 012 backfills these defaults onto any
// existing real pool whose dates are still NULL (i.e. never set by an
// admin), but leaves admin-set values alone.
export const DEFAULT_POOL_DATES = {
  group_lock_at: "2026-06-11T20:00:00Z",
  knockout_open_at: "2026-06-28T04:00:00Z",
  knockout_lock_at: "2026-06-29T16:00:00Z",
} as const;

// Auth
export const SESSION_COOKIE_PREFIX = "wcp_session_";
export const SESSION_DURATION_HOURS = parseInt(
  process.env.SESSION_DURATION_HOURS || "72",
  10
);
export const OTP_EXPIRY_MINUTES = parseInt(
  process.env.OTP_EXPIRY_MINUTES || "10",
  10
);
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_RATE_LIMIT_PER_HOUR = 3;
export const OTP_CODE_LENGTH = 6;

// Pick sets
export const PICK_SET_NAME_MAX_LENGTH = 50;
export const DEFAULT_MAX_PICK_SETS = 5;

// UI
export const RESULT_LABELS: Record<string, string> = {
  home: "Home Win",
  draw: "Draw",
  away: "Away Win",
};
