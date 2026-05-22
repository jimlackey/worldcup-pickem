// ---------------------------------------------------------------------------
// Recipient-list options shared between the email page, the email form,
// and the broadcast server action.
//
// Lives in its own non-"use server" file because:
//
//   1. Files marked "use server" should only export async functions —
//      Next.js's compiler tightens this rule from version to version. Mixing
//      type-level exports (RECIPIENT_LIST_VALUES, RECIPIENT_LIST_LABELS) into
//      actions.ts would, sooner or later, run into that restriction.
//
//   2. The values are also imported by the client form, which can't import
//      from a "use server" file at all without paying a marshalling cost
//      per import.
//
// Adding a new recipient option means: a new entry in RECIPIENT_LIST_VALUES
// (the order here drives the dropdown order on the form), a label in
// RECIPIENT_LIST_LABELS, and the filter branch in the server action.
// ---------------------------------------------------------------------------

export const RECIPIENT_LIST_VALUES = [
  "all",
  "incomplete-group",
  "incomplete-knockout",
] as const;

export type RecipientListValue = (typeof RECIPIENT_LIST_VALUES)[number];

export const RECIPIENT_LIST_LABELS: Record<RecipientListValue, string> = {
  all: "All active players",
  "incomplete-group": "Players with an incomplete Group Phase pickset",
  "incomplete-knockout": "Players with an incomplete Knockout Phase pickset",
};

/**
 * Short label used in the dropdown control. The longer
 * RECIPIENT_LIST_LABELS phrasings are used everywhere that needs a full
 * sentence (status banners, audit log entries).
 */
export const RECIPIENT_LIST_SHORT_LABELS: Record<RecipientListValue, string> = {
  all: "All active users",
  "incomplete-group": "Users with incomplete Group Phase pickset",
  "incomplete-knockout": "Users with incomplete Knockout Phase pickset",
};
