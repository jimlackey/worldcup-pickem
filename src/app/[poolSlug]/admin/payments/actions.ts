"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import {
  setPickSetPaid,
  setPickSetPaymentNotes,
} from "@/lib/payments/queries";

/**
 * Server actions for the per-pool admin payments view.
 *
 * Two distinct intents → two distinct actions:
 *   - togglePickSetPaidAction       — flips the paid flag
 *   - updatePickSetPaymentNotesAction — saves a note edit
 *
 * Each writes its own audit-log entry with old/new values so the
 * payments view ledger is fully reconstructible from the audit log.
 *
 * SECURITY:
 *   - Both actions verify the caller's pool session and role === "admin".
 *     A non-admin session, or no session, returns an unauthorized error
 *     before any DB write.
 *   - Both verify that the pick_set_id passed in actually belongs to
 *     THIS pool. Without that, a malicious admin of pool A could mark
 *     a pick set in pool B as paid by crafting a form POST.
 *   - The `updatedBy` field on the payment row is taken from the
 *     session's participantId, never from the form payload.
 */
export type PaymentActionResult = {
  success: boolean;
  error?: string;
};

// ----------------------------------------------------------------------------
// Shared input validation
// ----------------------------------------------------------------------------

const poolIdentSchema = z.object({
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
  pickSetId: z.string().uuid(),
});

const toggleSchema = poolIdentSchema.extend({
  // "true" if we want the row to end up paid, "false" otherwise.
  isPaid: z.enum(["true", "false"]),
});

const notesSchema = poolIdentSchema.extend({
  // Cap at 1000 to match the DB CHECK constraint on the column. Strip
  // trailing whitespace at the edges — admins paste from chat clients
  // a lot, and a trailing newline shouldn't count as "the notes
  // changed" for audit purposes.
  notes: z.string().max(1000).transform((s) => s.trim()),
});

// ----------------------------------------------------------------------------
// Auth + pool ownership check (shared)
// ----------------------------------------------------------------------------

async function requireAdminAndPickSet(
  poolId: string,
  poolSlug: string,
  pickSetId: string
): Promise<
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getPoolSession>>> }
  | { ok: false; error: string }
> {
  const session = await getPoolSession(poolId, poolSlug);
  if (!session) {
    return { ok: false, error: "Not authenticated." };
  }
  if (session.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  // Verify the pick set belongs to this pool. One indexed read; if the
  // row isn't found OR belongs to a different pool, we reject.
  const { data: pickSet } = await supabaseAdmin
    .from("pick_sets")
    .select("pool_id, is_active")
    .eq("id", pickSetId)
    .maybeSingle();

  if (!pickSet || pickSet.pool_id !== poolId || !pickSet.is_active) {
    return {
      ok: false,
      error: "That pick set is not part of this pool.",
    };
  }

  return { ok: true, session };
}

// ----------------------------------------------------------------------------
// Toggle paid
// ----------------------------------------------------------------------------

export async function togglePickSetPaidAction(
  _prev: PaymentActionResult,
  formData: FormData
): Promise<PaymentActionResult> {
  const parsed = toggleSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    pickSetId: formData.get("pickSetId"),
    isPaid: formData.get("isPaid"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolId, poolSlug, pickSetId, isPaid } = parsed.data;
  const desired = isPaid === "true";

  const auth = await requireAdminAndPickSet(poolId, poolSlug, pickSetId);
  if (!auth.ok) return { success: false, error: auth.error };

  let previous: { previousPaid: boolean; previousNotes: string };
  try {
    previous = await setPickSetPaid(
      poolId,
      pickSetId,
      desired,
      auth.session.participantId
    );
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update payment.",
    };
  }

  // Audit only when the state actually changed. A no-op click (already-
  // paid + click "mark paid") shouldn't pollute the log.
  if (previous.previousPaid !== desired) {
    await logAdminAction(
      auth.session,
      AuditAction.TOGGLE_PICK_SET_PAID,
      AuditEntity.PAYMENT,
      pickSetId,
      { is_paid: previous.previousPaid },
      { is_paid: desired }
    );
  }

  revalidatePath(`/${poolSlug}/admin/payments`);
  return { success: true };
}

// ----------------------------------------------------------------------------
// Update notes
// ----------------------------------------------------------------------------

export async function updatePickSetPaymentNotesAction(
  _prev: PaymentActionResult,
  formData: FormData
): Promise<PaymentActionResult> {
  const parsed = notesSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    pickSetId: formData.get("pickSetId"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolId, poolSlug, pickSetId, notes } = parsed.data;

  const auth = await requireAdminAndPickSet(poolId, poolSlug, pickSetId);
  if (!auth.ok) return { success: false, error: auth.error };

  let previous: { previousPaid: boolean; previousNotes: string };
  try {
    previous = await setPickSetPaymentNotes(
      poolId,
      pickSetId,
      notes,
      auth.session.participantId
    );
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update notes.",
    };
  }

  // Skip the audit row if the notes are unchanged. The client's blur-
  // save fires on every blur regardless of whether the user actually
  // edited anything, so this guard saves a lot of noise.
  if (previous.previousNotes !== notes) {
    await logAdminAction(
      auth.session,
      AuditAction.UPDATE_PICK_SET_PAYMENT_NOTES,
      AuditEntity.PAYMENT,
      pickSetId,
      { notes: previous.previousNotes },
      { notes }
    );
  }

  revalidatePath(`/${poolSlug}/admin/payments`);
  return { success: true };
}

// ----------------------------------------------------------------------------
// Log CSV export
// ----------------------------------------------------------------------------

/**
 * Log a CSV export. The CSV is built and downloaded client-side from
 * the data already on the page, so there's nothing to fetch here —
 * just an audit-log entry recording that an admin pulled the data.
 *
 * Money-relevant operations earn a trail; this gives an after-the-
 * fact answer to "who downloaded the payments list?" without needing
 * a separate server route.
 */
const exportSchema = z.object({
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
  rowCount: z.coerce.number().int().min(0),
});

export async function logPaymentsCsvExportAction(
  _prev: PaymentActionResult,
  formData: FormData
): Promise<PaymentActionResult> {
  const parsed = exportSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    rowCount: formData.get("rowCount"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolId, poolSlug, rowCount } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Admin role required." };
  }

  await logAdminAction(
    session,
    AuditAction.EXPORT_PAYMENTS_CSV,
    AuditEntity.PAYMENT,
    null,
    null,
    { row_count: rowCount }
  );

  return { success: true };
}
