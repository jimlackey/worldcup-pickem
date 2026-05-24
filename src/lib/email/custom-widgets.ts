// ---------------------------------------------------------------------------
// Custom email widget queries.
//
// Server-only by convention — this module touches supabaseAdmin
// (service-role client), which must never be imported into the
// browser. Client Components MUST NOT import from this file; they
// should pull rendering helpers from ./widget-rendering.ts instead.
//
// To enforce this at build time, add `import "server-only"` here once
// the `server-only` package is installed (npm install server-only).
// Until then, the architectural split is the guard: nothing
// client-side has a reason to call getCustomWidgetsForPool.
//
// Pure rendering helpers live in ./widget-rendering.ts and CAN be
// imported by client components.
//
// Writes flow through the actions in
// src/app/[poolSlug]/admin/email/widgets/actions.ts — those write to
// the service-role client directly, log an audit entry, and revalidate
// the relevant paths. They do not call back through this module, so
// this file stays purely read-side.
// ---------------------------------------------------------------------------

import { supabaseAdmin } from "@/lib/supabase/server";
import type { CustomEmailWidget } from "@/types/database";

/**
 * Fetch every custom widget belonging to a pool, sorted alphabetically
 * by label so the picker dropdown and the insert-pill row read in a
 * predictable order. Returns [] if the pool has no widgets (vs. null —
 * callers shouldn't have to null-check).
 */
export async function getCustomWidgetsForPool(
  poolId: string
): Promise<CustomEmailWidget[]> {
  const { data, error } = await supabaseAdmin
    .from("custom_email_widgets")
    .select("*")
    .eq("pool_id", poolId)
    .order("label", { ascending: true });

  if (error) {
    // Read failures here would silently hide widgets from an admin's
    // email composer, which is worse than logging and returning empty.
    // The composer keeps working with whatever widgets DID load.
    console.error("[custom-widgets] read failed:", error);
    return [];
  }
  return (data ?? []) as CustomEmailWidget[];
}
