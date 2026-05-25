"use server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import { sendBroadcastEmail } from "@/lib/email/resend-broadcast";
import { loadEmailContext } from "@/lib/email/load-context";
import { getCustomWidgetsForPool } from "@/lib/email/custom-widgets";
import { renderCustomWidgetsToTokenMap } from "@/lib/email/widget-rendering";
import { buildRecipientTemplateData } from "@/lib/email/recipient-data";
import {
  RECIPIENT_LIST_VALUES,
  RECIPIENT_LIST_LABELS,
} from "./recipient-lists";
import type { PreviewBundleResult } from "./preview-action-types";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

// ---------------------------------------------------------------------------
// Admin broadcast email — server action
//
// Pipeline:
//   1. Auth-gate (admin only).
//   2. loadEmailContext() pulls everything we need in one batch: active
//      members, matches, teams, picks, standings, per-participant rollups
//      with completion flags. The same loader feeds the preview pane on
//      the email composer page, so the admin's preview shows what a real
//      recipient would actually see.
//   3. Filter recipients by the admin's chosen "send to" list.
//   4. For each filtered recipient, run expandWidgetsForParticipant() to
//      get the widget strings, hand them to sendBroadcastEmail (which
//      does the HTML-aware splice via renderEmailBodyHtml), and call
//      Resend.
//   5. Audit log: one row per broadcast.
//
// Rate-limit handling:
//   Resend free tier rate-limits per second. We sequentialise sends with a
//   small per-message delay so a 50-player pool doesn't trip the limit.
//   Paid Resend plans are the production fix.
// ---------------------------------------------------------------------------

const sendBroadcastSchema = z.object({
  poolSlug: z.string().min(1),
  poolId: z.string().uuid(),
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required.")
    .max(200, "Subject must be 200 characters or fewer."),
  body: z
    .string()
    .min(1, "Body is required.")
    .max(20000, "Body is too long."),
  recipientList: z.enum(RECIPIENT_LIST_VALUES),
});

// Small delay (ms) between successive Resend calls so the free tier's
// per-second cap doesn't immediately bite. 250ms = 4 sends/sec target,
// which sits below Resend's free 10/sec limit with comfortable headroom.
const SEND_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function sendBroadcastEmailAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = sendBroadcastSchema.safeParse({
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    recipientList: formData.get("recipientList"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { poolSlug, poolId, subject, body, recipientList } = parsed.data;

  // ---- Auth ----
  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // ---- Pool ----
  const { data: poolRow } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();

  if (!poolRow) {
    return { success: false, error: "Pool not found." };
  }
  const pool = poolRow as Pool;

  // ---- Context (everything the preview also uses) ------------------------
  const ctx = await loadEmailContext(pool);

  if (ctx.activeMembers.length === 0) {
    return { success: false, error: "No active players to send to." };
  }

  // ---- Apply the recipient list filter ----------------------------------
  const filteredRecipients = ctx.activeMembers.filter((m) => {
    if (recipientList === "all") return true;
    const rollup = ctx.rollupByParticipant.get(m.participant_id);
    if (!rollup) return false;
    if (recipientList === "incomplete-group") return rollup.hasGroupIncomplete;
    if (recipientList === "incomplete-knockout")
      return rollup.hasKnockoutIncomplete;
    if (recipientList === "unpaid-pickset") return rollup.hasUnpaidPickSet;
    return false;
  });

  if (filteredRecipients.length === 0) {
    return {
      success: false,
      error:
        "No recipients match the selected list. Try a different recipient list.",
    };
  }

  // ---- Pool's custom HTML widgets ---------------------------------------
  // The rows are loaded once before the loop, but rendering each
  // widget's template happens per recipient since custom widgets can
  // now reference recipient data (e.g. {{recipient.name}}, {{#each
  // pickSets}}). renderCustomWidgetsToTokenMap is called inside the
  // loop below with each recipient's projected data.
  const customWidgetRows = await getCustomWidgetsForPool(pool.id);

  // ---- Send loop ---------------------------------------------------------
  const attempted = filteredRecipients.length;
  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  for (let i = 0; i < filteredRecipients.length; i++) {
    const r = filteredRecipients[i];
    const rollup = ctx.rollupByParticipant.get(r.participant_id);
    const participantPickSets = rollup?.pickSets ?? [];

    // Build the per-recipient template data — the documented data
    // contract that custom widget templates render against. See
    // recipient-data.ts.
    //
    // The five canonical widgets (standings-summary, missing-group-picks,
    // missing-knockout-picks, group-phase-picks, knockout-round-picks)
    // are seeded into every pool as custom_email_widgets rows by
    // migration 019, so they flow through the same render path as any
    // admin-authored widget. No hard-coded HTML token bucket here.
    const recipientName =
      r.participant.display_name || r.participant.email || "";
    const templateData = buildRecipientTemplateData({
      ctx,
      participantId: r.participant_id,
      rollup: { pickSets: participantPickSets },
      recipientName,
      recipientEmail: r.participant.email,
      poolName: pool.name,
    });
    const customWidgetTokens = renderCustomWidgetsToTokenMap(
      customWidgetRows,
      templateData
    );

    const result = await sendBroadcastEmail({
      to: r.participant.email,
      subject,
      body,
      tokens: {
        // All widgets are HTML. The plain bucket stays empty to keep
        // the RenderTokens shape stable for resend-broadcast.ts.
        plain: {},
        html: customWidgetTokens,
      },
      poolName: pool.name,
      sentByEmail: session.email,
    });

    if (result.success) {
      sent += 1;
    } else {
      failures.push({
        email: r.participant.email,
        error: result.error ?? "unknown",
      });
    }

    if (i < filteredRecipients.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  // ---- Audit -------------------------------------------------------------
  await logAdminAction(
    session,
    AuditAction.SEND_BROADCAST_EMAIL,
    AuditEntity.EMAIL,
    null,
    null,
    {
      subject,
      recipientList,
      recipientListLabel: RECIPIENT_LIST_LABELS[recipientList],
      attempted,
      sent,
      failed: failures.length,
      // Cap the failure list so a bulk-rejection (e.g. Resend domain
      // change) doesn't blow up the audit row.
      failures: failures.slice(0, 10),
    }
  );

  if (failures.length === 0) {
    return {
      success: true,
      message: `Sent to ${sent} of ${attempted} player${attempted === 1 ? "" : "s"}.`,
    };
  }
  return {
    success: true,
    message: `Sent to ${sent} of ${attempted} player${attempted === 1 ? "" : "s"}. ${failures.length} failed — check the audit log for details.`,
  };
}

// ===========================================================================
// previewRecipientAction
//
// Returns the per-participant preview bundle for a single recipient. The
// email composer's preview pane fires this when the admin picks a
// specific player from the in-preview recipient dropdown, so they can
// spot-check what THAT player will see.
//
// Why a separate action (vs. embedding the participant in
// sendBroadcastEmailAction): the send action runs the full send loop and
// audit log; the preview is read-only. Splitting them avoids accidentally
// re-using the send schema or audit machinery for what is effectively a
// query.
//
// Authorization rules:
//   - Admin session for THIS pool only (matches the send action's gate).
//   - The participant being previewed must be an active member of THIS
//     pool. We don't trust the client to scope cross-pool — the action
//     re-checks against ctx.activeMembers.
//
// Failure modes return a PreviewBundleResult with success=false and the
// participant fields empty so the client can render an inline error
// without throwing.
// ===========================================================================

const previewRecipientSchema = z.object({
  poolSlug: z.string().min(1),
  poolId: z.string().uuid(),
  participantId: z.string().uuid(),
});

export async function previewRecipientAction(input: {
  poolSlug: string;
  poolId: string;
  participantId: string;
}): Promise<PreviewBundleResult> {
  const empty: Omit<PreviewBundleResult, "success" | "error"> = {
    participantName: null,
    templateData: null,
  };

  const parsed = previewRecipientSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0].message,
      ...empty,
    };
  }

  const { poolSlug, poolId, participantId } = parsed.data;

  // ---- Auth ----
  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized", ...empty };
  }

  // ---- Pool ----
  const { data: poolRow } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();
  if (!poolRow) {
    return { success: false, error: "Pool not found.", ...empty };
  }
  const pool = poolRow as Pool;

  // ---- Context + membership check ----
  // loadEmailContext is the same loader the send action uses; reusing it
  // here means a preview can never see a participant the action would
  // exclude (and vice versa). The membership check guards against
  // someone hand-crafting a payload with a participantId from a
  // different pool — the server is the only place that decision lives.
  const ctx = await loadEmailContext(pool);
  const member = ctx.activeMembers.find(
    (m) => m.participant_id === participantId
  );
  if (!member) {
    return {
      success: false,
      error: "That player isn't an active member of this pool.",
      ...empty,
    };
  }

  const rollup = ctx.rollupByParticipant.get(participantId);
  const participantName =
    member.participant.display_name || member.participant.email || null;

  // Per-recipient template data — the only output the preview needs.
  // The five canonical widgets are no longer code-rendered: they're
  // seeded as editable custom_email_widgets rows, so the client
  // renders them against this data the same way it renders any
  // admin-authored widget.
  const templateData = buildRecipientTemplateData({
    ctx,
    participantId,
    rollup: { pickSets: rollup?.pickSets ?? [] },
    recipientName: participantName ?? member.participant.email,
    recipientEmail: member.participant.email,
    poolName: pool.name,
  });

  return {
    success: true,
    participantName,
    templateData,
  };
}
