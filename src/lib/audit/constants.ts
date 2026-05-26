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

  // Admin actions (per-pool)
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
  EDIT_TEAM: "edit_team",
  TOGGLE_LOGIN_REQUIRED: "toggle_login_required",
  TOGGLE_CONSOLATION_MATCH: "toggle_consolation_match",
  TOGGLE_SHOW_FIFA_RANKINGS: "toggle_show_fifa_rankings",
  TOGGLE_SHOW_MATCH_LINES: "toggle_show_match_lines",
  // Per-pool /{slug}/about page configuration — section toggles
  // (stages/scoring/payout) and the free-text fields (header, stage
  // descriptions, scoring prose, payout prose, footer). One audit row
  // per save; the new_value JSON captures every changed field so a
  // reader can see at a glance what was edited without needing a diff
  // against an older snapshot. Added in migration 023.
  UPDATE_ABOUT_CONFIG: "update_about_config",
  // Admin-broadcast email — sent from /{slug}/admin/email to every
  // active player in the pool. One audit entry per broadcast (not per
  // recipient) so the log stays readable; the new_value blob carries
  // the counts (attempted / sent / failed) plus the subject line.
  SEND_BROADCAST_EMAIL: "send_broadcast_email",
  // Custom email widget management — admin-defined HTML snippets that
  // can be inserted into broadcast emails as {{slug}}. One audit row
  // per create/update/delete; the entity_id is the widget row's UUID.
  CREATE_EMAIL_WIDGET: "create_email_widget",
  UPDATE_EMAIL_WIDGET: "update_email_widget",
  DELETE_EMAIL_WIDGET: "delete_email_widget",
  // Per-pick-set payment tracking — admin-only writes from
  // /{slug}/admin/payments. Toggle is a state flip; notes is a free-
  // text edit. Distinct actions so the audit log reads cleanly (an
  // admin scanning for "who marked Heather paid?" finds it without
  // having to inspect the new_value JSON to figure out which field
  // changed).
  TOGGLE_PICK_SET_PAID: "toggle_pick_set_paid",
  UPDATE_PICK_SET_PAYMENT_NOTES: "update_pick_set_payment_notes",
  // Admin-driven pick edits — distinct from the player-side
  // SUBMIT_GROUP_PICKS / EDIT_GROUP_PICK / SUBMIT_KNOCKOUT_BRACKET
  // actions because an admin editing someone else's picks is a
  // different audit concept worth surfacing distinctly in the log.
  // The actor on the audit row is the admin's participant id; the
  // entity_id is the affected pick_set_id, and the new_value JSON
  // carries the diff plus the target participant's display name so
  // a reader doesn't need to chase a join to know whose picks
  // were changed.
  ADMIN_EDIT_GROUP_PICKS: "admin_edit_group_picks",
  ADMIN_EDIT_KNOCKOUT_PICKS: "admin_edit_knockout_picks",
  // CSV export of the payments view — read-only operation, no data
  // change, but admins want a trail showing who pulled the data and
  // when (especially relevant when money's involved). entity_id is
  // null; new_value records the row count exported.
  EXPORT_PAYMENTS_CSV: "export_payments_csv",

  // Super-admin actions
  SUPER_ADMIN_LOGIN: "super_admin_login",
  CREATE_POOL: "create_pool",
  EDIT_GLOBAL_TEAM: "edit_global_team",
  EDIT_GLOBAL_TEAM_RANKING: "edit_global_team_ranking",
  // Tournament management — these used to live under pool-admin but they
  // edit canonical global tournament data, so they moved to super-admin
  // with migration 017. Distinct constants (vs reusing ENTER_MATCH_RESULT
  // etc.) so an audit log review can immediately see whether a write
  // came from the per-pool path or the global path.
  GLOBAL_ENTER_MATCH_RESULT: "global_enter_match_result",
  GLOBAL_RESET_MATCH_RESULT: "global_reset_match_result",
  GLOBAL_ASSIGN_KNOCKOUT_TEAM: "global_assign_knockout_team",
  // Lines — already a super-admin action, kept here for completeness.
  EDIT_MATCH_LINES: "edit_match_lines",
  FETCH_MATCH_LINES: "fetch_match_lines",
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
  // A broadcast email is logged once per send (see SEND_BROADCAST_EMAIL).
  // We don't have a DB table for emails — the entity_id on the audit row
  // is left null and the new_value JSON carries the relevant metadata.
  EMAIL: "email",
  // Custom email widget rows in `custom_email_widgets`. entity_id is
  // the widget's UUID.
  EMAIL_WIDGET: "email_widget",
  // Per-pick-set payment rows in `pool_payments`. entity_id is the
  // pick_set_id (not the pool_payments row id) so a reader can
  // immediately cross-reference the pick set without an extra join.
  PAYMENT: "payment",
} as const;

export type AuditEntityType = (typeof AuditEntity)[keyof typeof AuditEntity];
