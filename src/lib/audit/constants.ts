/**
 * Type-safe audit action constants.
 * Every auditable event in the system has an entry here.
 */
export const AuditAction = {
  // Player actions
  SUBMIT_GROUP_PICKS: "submit_group_picks",
  EDIT_GROUP_PICK: "edit_group_pick",
  SUBMIT_KNOCKOUT_BRACKET: "submit_knockout_bracket",
  EDIT_KNOCKOUT_PICK: "edit_knockout_pick",
  CREATE_PICK_SET: "create_pick_set",
  RENAME_PICK_SET: "rename_pick_set",

  // Admin actions
  ENTER_MATCH_RESULT: "enter_match_result",
  CORRECT_MATCH_RESULT: "correct_match_result",
  RESET_MATCH_RESULT: "reset_match_result",
  UPDATE_MATCH_STATUS: "update_match_status",
  ASSIGN_KNOCKOUT_TEAM: "assign_knockout_team",
  EDIT_PARTICIPANT_NAME: "edit_participant_name",
  EDIT_PARTICIPANT_EMAIL: "edit_participant_email",
  EDIT_PICK_SET_NAME: "edit_pick_set_name",
  EDIT_PICK_SET_PICKS: "edit_pick_set_picks",
  DEACTIVATE_PARTICIPANT: "deactivate_participant",
  REACTIVATE_PARTICIPANT: "reactivate_participant",
  DEACTIVATE_PICK_SET: "deactivate_pick_set",
  REACTIVATE_PICK_SET: "reactivate_pick_set",
  RESEND_OTP: "resend_otp",
  CSV_IMPORT: "csv_import",
  CSV_IMPORT_PICK: "csv_import_pick",
  ADJUST_SCORING: "adjust_scoring",
  SET_GROUP_LOCK: "set_group_lock",
  SET_KNOCKOUT_OPEN: "set_knockout_open",
  SET_KNOCKOUT_LOCK: "set_knockout_lock",
  ADD_TO_WHITELIST: "add_to_whitelist",
  REMOVE_FROM_WHITELIST: "remove_from_whitelist",
  PROMOTE_TO_ADMIN: "promote_to_admin",
  DEMOTE_TO_PLAYER: "demote_to_player",
  // Per-pool admin editing a team in their own (demo) pool.
  EDIT_TEAM: "edit_team",
  // Pool privacy: admin toggling whether viewing pool contents requires login.
  TOGGLE_LOGIN_REQUIRED: "toggle_login_required",

  // Super-admin actions
  SUPER_ADMIN_LOGIN: "super_admin_login",
  CREATE_POOL: "create_pool",
  // Super-admin editing a global team (teams.pool_id IS NULL). Logged with
  // pool_id NULL in audit_log — visible only via a future global audit view.
  EDIT_GLOBAL_TEAM: "edit_global_team",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Entity types that can appear in audit log entries.
 */
export const AuditEntity = {
  MATCH: "match",
  PARTICIPANT: "participant",
  PICK_SET: "pick_set",
  GROUP_PICK: "group_pick",
  KNOCKOUT_PICK: "knockout_pick",
  POOL: "pool",
  SCORING_CONFIG: "scoring_config",
  WHITELIST: "whitelist",
  OTP: "otp",
  CSV_IMPORT: "csv_import",
  MEMBERSHIP: "membership",
  TEAM: "team",
} as const;

export type AuditEntityType = (typeof AuditEntity)[keyof typeof AuditEntity];
