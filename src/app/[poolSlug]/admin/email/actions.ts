"use server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import { sendBroadcastEmail } from "@/lib/email/resend-broadcast";
import { applyBodyTokens } from "@/lib/email/standings-summary";
import { expandWidgetsForParticipant } from "@/lib/email/expand-widgets";
import { loadEmailContext } from "@/lib/email/load-context";
import {
  RECIPIENT_LIST_VALUES,
  RECIPIENT_LIST_LABELS,
} from "./recipient-lists";
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
//      get the three widget strings, substitute them into the body via
//      applyBodyTokens, and call Resend.
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
    return false;
  });

  if (filteredRecipients.length === 0) {
    return {
      success: false,
      error:
        "No recipients match the selected list. Try a different recipient list.",
    };
  }

  // ---- Send loop ---------------------------------------------------------
  const attempted = filteredRecipients.length;
  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  for (let i = 0; i < filteredRecipients.length; i++) {
    const r = filteredRecipients[i];
    const rollup = ctx.rollupByParticipant.get(r.participant_id);
    const participantPickSets = rollup?.pickSets ?? [];

    // Same pipeline the preview pane runs server-side, so the body the
    // admin previewed before clicking Send is structurally what every
    // recipient gets.
    const { standingsSummary, missingGroupPicks, missingKnockoutPicks } =
      expandWidgetsForParticipant({
        standings: ctx.standings,
        groupMatches: ctx.groupMatches,
        knockoutMatches: ctx.knockoutMatches,
        teamsById: ctx.teamsById,
        knockoutPhaseStarted: ctx.knockoutPhaseStarted,
        participantPickSets,
      });

    const expandedBody = applyBodyTokens(body, {
      "standings-summary": standingsSummary,
      "missing-group-picks": missingGroupPicks,
      "missing-knockout-picks": missingKnockoutPicks,
    });

    const result = await sendBroadcastEmail({
      to: r.participant.email,
      subject,
      bodyText: expandedBody,
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
