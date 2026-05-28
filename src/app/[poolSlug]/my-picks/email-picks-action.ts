"use server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logPlayerAction, AuditAction, AuditEntity } from "@/lib/audit";
import { loadEmailContext } from "@/lib/email/load-context";
import { getCustomWidgetsForPool } from "@/lib/email/custom-widgets";
import { renderCustomWidget } from "@/lib/email/widget-rendering";
import { buildRecipientTemplateData } from "@/lib/email/recipient-data";
import { sendOwnPicksEmail } from "@/lib/email/resend-own-picks";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import { formatPacificDateTime } from "@/lib/utils/dates";
import type { Pool } from "@/types/database";

export type EmailPicksResult = {
  success: boolean;
  error?: string;
  message?: string;
};

// ---------------------------------------------------------------------------
// "Email My Picks" — player-initiated snapshot email.
//
// A player clicks "Email My Picks" on /{slug}/my-picks; we email a snapshot
// of ALL their pick sets to their own session email. Which widgets appear
// depends on the tournament phase (same 4-phase model the dashboard uses):
//
//   Phase 1 (Group Picking, group open)        → group-phase-picks only
//   Phase 2 (Group Phase Round, group locked)  → group-phase-picks only
//   Phase 3 (Knockout Picking, knockout open)  → group + knockout widgets
//   Phase 4 (Knockout Phase Round, all locked) → group + knockout widgets
//
// "Locked" finality note: shown when no picking window is currently open
// for the picks being emailed — i.e. phases 2 and 4. In phases 1 and 3
// there's still an editable window, so the picks aren't final yet.
//
// Reuses the standard email machinery: loadEmailContext +
// buildRecipientTemplateData produce the per-recipient data; the pool's
// seeded "group-phase-picks" / "knockout-round-picks" custom widgets are
// rendered against it. The send goes through the dedicated
// sendOwnPicksEmail sender (same Resend client, player-appropriate
// envelope — no admin footer).
// ---------------------------------------------------------------------------

const schema = z.object({
  poolSlug: z.string().min(1),
  poolId: z.string().uuid(),
});

const GROUP_WIDGET_SLUG = "group-phase-picks";
const KNOCKOUT_WIDGET_SLUG = "knockout-round-picks";

// Body paragraph style — matches the broadcast email's body paragraphs so
// the snapshot reads consistently with admin mail.
const PARAGRAPH_STYLE =
  "margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5";
const NOTE_STYLE =
  "margin:0 0 16px;padding:10px 12px;border-radius:8px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5";

export async function emailMyPicksAction(
  _prev: EmailPicksResult,
  formData: FormData
): Promise<EmailPicksResult> {
  const parsed = schema.safeParse({
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolSlug, poolId } = parsed.data;

  // ---- Auth: player must have a session for THIS pool --------------------
  const session = await getPoolSession(poolId, poolSlug);
  if (!session) {
    return { success: false, error: "You must be signed in to email your picks." };
  }
  if (!session.email) {
    return {
      success: false,
      error: "Your account has no email address on file to send to.",
    };
  }

  // ---- Pool --------------------------------------------------------------
  const { data: poolRow } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();
  if (!poolRow) {
    return { success: false, error: "Pool not found." };
  }
  const pool = poolRow as Pool;

  // ---- Phase derivation (mirrors pick-set-dashboard) ---------------------
  const groupOpen = isGroupPhaseOpen(pool);
  const knockoutOpen = isKnockoutPhaseOpen(pool);
  const knockoutLocked =
    !!pool.knockout_lock_at &&
    Date.now() >= new Date(pool.knockout_lock_at).getTime();
  const phase: 1 | 2 | 3 | 4 = groupOpen
    ? 1
    : knockoutOpen
      ? 3
      : knockoutLocked
        ? 4
        : 2;

  const includeKnockout = phase === 3 || phase === 4;
  const picksAreFinal = phase === 2 || phase === 4;

  // ---- Per-recipient template data ---------------------------------------
  // loadEmailContext is the same loader the admin email path uses, so the
  // widgets render identically here. We locate this player's active
  // membership inside it.
  const ctx = await loadEmailContext(pool);
  const member = ctx.activeMembers.find(
    (m) => m.participant_id === session.participantId
  );
  if (!member) {
    return {
      success: false,
      error: "We couldn't find your membership in this pool.",
    };
  }

  const rollup = ctx.rollupByParticipant.get(session.participantId);
  const recipientName =
    member.participant.display_name || member.participant.email || "";
  const templateData = buildRecipientTemplateData({
    ctx,
    participantId: session.participantId,
    rollup: { pickSets: rollup?.pickSets ?? [] },
    recipientName,
    recipientEmail: member.participant.email,
    poolName: pool.name,
  });

  // ---- Render the phase-appropriate widgets ------------------------------
  const widgetRows = await getCustomWidgetsForPool(pool.id);
  const bySlug = new Map(widgetRows.map((w) => [w.slug, w]));

  const slugsToRender = includeKnockout
    ? [GROUP_WIDGET_SLUG, KNOCKOUT_WIDGET_SLUG]
    : [GROUP_WIDGET_SLUG];

  const renderedWidgets: string[] = [];
  for (const slug of slugsToRender) {
    const widget = bySlug.get(slug);
    if (!widget) continue; // Pool missing a seeded widget — skip gracefully.
    renderedWidgets.push(renderCustomWidget(widget, templateData));
  }

  if (renderedWidgets.length === 0) {
    return {
      success: false,
      error:
        "Your picks couldn't be assembled (the pick widgets aren't set up for this pool). Please contact your pool admin.",
    };
  }

  // ---- Compose body ------------------------------------------------------
  const nowLabel = formatPacificDateTime(new Date().toISOString()) ?? "now";

  const subject = "World Cup Pool Picks";

  const finalNoteHtml = picksAreFinal
    ? `<p style="${NOTE_STYLE}">These picks are final and can no longer be modified.</p>`
    : "";

  const bodyHtml = [
    `<p style="${PARAGRAPH_STYLE}">Hello World Cup picker! As of ${escapeHtml(
      nowLabel
    )}, your picks are as follows:</p>`,
    finalNoteHtml,
    renderedWidgets.join('<div style="height:16px"></div>'),
    `<p style="${PARAGRAPH_STYLE};margin-top:16px">Good luck in the pool!</p>`,
  ]
    .filter(Boolean)
    .join("\n");

  const finalNoteText = picksAreFinal
    ? "These picks are final and can no longer be modified.\n\n"
    : "";
  const bodyText = `Hello World Cup picker! As of ${nowLabel}, your picks are as follows:\n\n${finalNoteText}[ Your picks — view in an HTML-capable email client ]\n\nGood luck in the pool!`;

  // ---- Send --------------------------------------------------------------
  const result = await sendOwnPicksEmail({
    to: session.email,
    subject,
    bodyHtml,
    bodyText,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error
        ? `Couldn't send the email: ${result.error}`
        : "Couldn't send the email. Please try again.",
    };
  }

  // ---- Audit -------------------------------------------------------------
  await logPlayerAction(
    session,
    AuditAction.EMAIL_OWN_PICKS,
    AuditEntity.EMAIL,
    null,
    null,
    {
      to: session.email,
      phase,
      includeKnockout,
      picksAreFinal,
      pickSetCount: rollup?.pickSets.length ?? 0,
    }
  );

  return {
    success: true,
    message: `Sent to ${session.email}.`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
