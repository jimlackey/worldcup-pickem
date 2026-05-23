// ---------------------------------------------------------------------------
// Return shape of previewRecipientAction.
//
// Kept in its own module because actions.ts is "use server" and Next.js
// requires those files to export only async functions. Pulling type-only
// declarations out keeps the action file compliant and the type still
// importable from the client form.
// ---------------------------------------------------------------------------

export interface PreviewBundleResult {
  success: boolean;
  error?: string;
  participantName: string | null;
  // All five widget fields are raw HTML — they must NOT be HTML-escaped
  // before rendering. Anything participant-supplied inside them is
  // escaped by the builder functions before it lands in the string.
  standingsSummary: string;
  missingGroupPicks: string;
  missingKnockoutPicks: string;
  groupPhasePicks: string;
  knockoutRoundPicks: string;
}
