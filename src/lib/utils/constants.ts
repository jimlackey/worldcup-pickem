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

// Default scoring — used when initializing a new pool
export const DEFAULT_SCORING: Record<MatchPhase, number> = {
  group: 1,
  r32: 2,
  r16: 3,
  qf: 5,
  sf: 8,
  final: 13,
};

// Auth
export const SESSION_COOKIE_PREFIX = "wcp_session_";
// Pool (player) session duration. Default 2160 hours = 90 days.
// Cookie, JWT, and DB session row all use this value, so a logged-in user
// stays logged in on their device across browser/device restarts for the
// full duration unless they explicitly log out (or the row is revoked).
export const SESSION_DURATION_HOURS = parseInt(
  process.env.SESSION_DURATION_HOURS || "2160",
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
