"use server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import { getPoolMembers } from "@/lib/pool/queries";
import { getStandings } from "@/lib/tournament/standings";
import { sendBroadcastEmail } from "@/lib/email/resend-broadcast";
import {
  applyBodyTokens,
  buildStandingsSummary,
  type SummaryPickSet,
} from "@/lib/email/standings-summary";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

// ---------------------------------------------------------------------------
// Admin broadcast email — server action
//
// Flow:
//   1. Auth-gate to admin role for the named pool.
//   2. Load active members, their pick sets, and the pool standings.
//   3. Detect whether the knockout phase has actually started (any
//      graded knockout pick anywhere in the pool). This controls the
//      "Not yet started" branch in the standings-summary widget so it
//      reflects the real state of the pool, not just per-recipient
//      activity.
//   4. For each active player, build a per-recipient body by expanding
//      {{standings-summary}} from real data and call Resend.
//   5. Write a single audit entry with attempted/sent/failed counts.
//
// Rate-limit handling:
//   Resend free tier has a low per-second limit. We sequentialise sends
//   and tuck a small delay between them so a 50-player pool doesn't
//   immediately tip over. For very large pools the admin will need a
//   paid Resend plan (acknowledged in the user's request).
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
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { poolSlug, poolId, subject, body } = parsed.data;

  // ---- Auth ----
  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // ---- Pool (for name in From header) ----
  const { data: poolRow } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();

  if (!poolRow) {
    return { success: false, error: "Pool not found." };
  }
  const pool = poolRow as Pool;

  // ---- Recipients: active members ----
  // getPoolMembers already filters to is_active = true, which is the
  // "active players" definition the user asked for.
  const members = await getPoolMembers(poolId);

  // Skip members whose participant row is inactive (defensive — the
  // join could return inactive participants if memberships drift). Also
  // skip anyone with a missing email, though this shouldn't happen.
  const recipients = members.filter(
    (m) =>
      m.is_active &&
      m.participant.is_active !== false &&
      m.participant.email &&
      m.participant.email.length > 0
  );

  if (recipients.length === 0) {
    return {
      success: false,
      error: "No active players to send to.",
    };
  }

  // ---- Standings snapshot (used by every recipient's widget) ----
  const standings = await getStandings(poolId);

  // ---- Pick sets, grouped by participant ----
  const { data: pickSetRows } = await supabaseAdmin
    .from("pick_sets")
    .select("id, name, participant_id")
    .eq("pool_id", poolId)
    .eq("is_active", true)
    .order("created_at");

  // Correct counts per pick set, both phases. We pull all picks for the
  // pool's pick sets in two queries and reduce in memory rather than
  // making N round-trips.
  const pickSetIds = (pickSetRows ?? []).map((ps) => ps.id);

  const [groupPicksRes, knockoutPicksRes] = await Promise.all([
    pickSetIds.length === 0
      ? Promise.resolve({ data: [] as { pick_set_id: string; is_correct: boolean | null }[] })
      : supabaseAdmin
          .from("group_picks")
          .select("pick_set_id, is_correct")
          .in("pick_set_id", pickSetIds),
    pickSetIds.length === 0
      ? Promise.resolve({ data: [] as { pick_set_id: string; is_correct: boolean | null }[] })
      : supabaseAdmin
          .from("knockout_picks")
          .select("pick_set_id, is_correct")
          .in("pick_set_id", pickSetIds),
  ]);

  const groupCorrectById = new Map<string, number>();
  for (const p of (groupPicksRes.data ?? []) as { pick_set_id: string; is_correct: boolean | null }[]) {
    if (p.is_correct === true) {
      groupCorrectById.set(p.pick_set_id, (groupCorrectById.get(p.pick_set_id) ?? 0) + 1);
    }
  }
  const knockoutCorrectById = new Map<string, number>();
  let anyKnockoutGraded = false;
  for (const p of (knockoutPicksRes.data ?? []) as { pick_set_id: string; is_correct: boolean | null }[]) {
    if (p.is_correct !== null) anyKnockoutGraded = true;
    if (p.is_correct === true) {
      knockoutCorrectById.set(p.pick_set_id, (knockoutCorrectById.get(p.pick_set_id) ?? 0) + 1);
    }
  }

  // Bucket pick sets by participant for fast lookup at send time.
  const pickSetsByParticipant = new Map<string, SummaryPickSet[]>();
  for (const ps of pickSetRows ?? []) {
    const arr = pickSetsByParticipant.get(ps.participant_id) ?? [];
    arr.push({
      pick_set_id: ps.id,
      pick_set_name: ps.name,
      group_correct: groupCorrectById.get(ps.id) ?? 0,
      knockout_correct: knockoutCorrectById.get(ps.id) ?? 0,
    });
    pickSetsByParticipant.set(ps.participant_id, arr);
  }

  // ---- Send loop ----
  const attempted = recipients.length;
  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];

    const participantPickSets =
      pickSetsByParticipant.get(r.participant_id) ?? [];

    const standingsSummary = buildStandingsSummary({
      standings,
      participantPickSets,
      knockoutPhaseStarted: anyKnockoutGraded,
    });

    const expandedBody = applyBodyTokens(body, {
      "standings-summary": standingsSummary,
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

    // Don't sleep after the last send.
    if (i < recipients.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  // ---- Audit ----
  await logAdminAction(
    session,
    AuditAction.SEND_BROADCAST_EMAIL,
    AuditEntity.EMAIL,
    null,
    null,
    {
      subject,
      attempted,
      sent,
      failed: failures.length,
      // Cap the failure list in the audit row so a giant failure doesn't
      // bloat the audit table; the first ten are enough to diagnose.
      failures: failures.slice(0, 10),
    }
  );

  if (failures.length === 0) {
    return {
      success: true,
      message: `Sent to ${sent} of ${attempted} player${attempted === 1 ? "" : "s"}.`,
    };
  }

  // Partial success — still return success=true so the form shows the
  // green confirmation, but include the failure count in the message.
  return {
    success: true,
    message: `Sent to ${sent} of ${attempted} player${attempted === 1 ? "" : "s"}. ${failures.length} failed — check the audit log for details.`,
  };
}
