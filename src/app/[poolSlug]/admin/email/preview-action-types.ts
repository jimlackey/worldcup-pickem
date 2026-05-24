// ---------------------------------------------------------------------------
// Return shape of previewRecipientAction.
//
// Kept in its own module because actions.ts is "use server" and Next.js
// requires those files to export only async functions. Pulling type-only
// declarations out keeps the action file compliant and the type still
// importable from the client form.
// ---------------------------------------------------------------------------

import type { RecipientTemplateData } from "@/lib/email/recipient-data";

export interface PreviewBundleResult {
  success: boolean;
  error?: string;
  participantName: string | null;
  /**
   * Per-recipient data used to render every widget — both the five
   * seeded default widgets (standings-summary, missing-group-picks,
   * etc.) and any admin-authored widget. Null on the error / empty
   * branch.
   *
   * See recipient-data.ts for the documented shape — this is the "data
   * contract" templates write against.
   */
  templateData: RecipientTemplateData | null;
}
