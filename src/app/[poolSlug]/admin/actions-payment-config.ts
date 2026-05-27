"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import {
  setPaymentConfig,
  type PaymentConfig,
} from "@/lib/payments/config-queries";
import { parseDollarStringToCents } from "@/lib/utils/money";
import type { AdminActionResult } from "./actions";

// ---- Payment Config (migration 025) ----

/**
 * Save the per-pool Payment Config — entry fee, consolation fee, and
 * payout schedule — from the /admin/settings form.
 *
 * Form payload shape:
 *   poolId, poolSlug             — context
 *   entryFee                     — dollar string, e.g. "20", "20.00", "20.50"
 *   consolationFee               — dollar string, same shape
 *   winnerCount                  — string "0".."10"
 *   percent_1, percent_2, ...    — integer percent per place. Only
 *                                  the first `winnerCount` entries
 *                                  are read; any extras are ignored.
 *
 * Validation rules (ordered as the user would discover them):
 *   1. Fees must parse as valid money (the regex from money.ts).
 *   2. winnerCount must be an integer 0–10.
 *   3. When winnerCount > 0, every percent_N input (1..winnerCount)
 *      must be a non-negative integer 0–100.
 *   4. When winnerCount > 0, the sum of all percents must equal
 *      exactly 100. (When winnerCount = 0, no percents are read at
 *      all — the payout grid is hidden in the UI.)
 *
 * Each rule produces a discrete error message so the form can be
 * friendly. The client-side form also enforces (1) and (4) before
 * submitting, but server-side validation is the source of truth —
 * a tampered form post still hits these checks.
 *
 * Lives in its own file (mirroring actions-privacy.ts and
 * actions-consolation.ts) so the new code doesn't have to be
 * intermixed with the much larger actions.ts.
 */

const baseSchema = z.object({
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
});

export async function updatePaymentConfigAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsedBase = baseSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
  });
  if (!parsedBase.success) {
    return { success: false, error: parsedBase.error.issues[0].message };
  }
  const { poolId, poolSlug } = parsedBase.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // ----- Validate fees -----
  const entryFeeRaw = String(formData.get("entryFee") ?? "");
  const consolationFeeRaw = String(formData.get("consolationFee") ?? "");

  const entryFeeCents = parseDollarStringToCents(entryFeeRaw);
  if (entryFeeCents === null) {
    return {
      success: false,
      error: "Entry Fee must be a valid dollar amount (e.g. 20 or 20.00).",
    };
  }
  const consolationFeeCents = parseDollarStringToCents(consolationFeeRaw);
  if (consolationFeeCents === null) {
    return {
      success: false,
      error:
        "Consolation Fee must be a valid dollar amount (e.g. 5 or 5.00).",
    };
  }

  // ----- Validate winner count -----
  const winnerCountRaw = String(formData.get("winnerCount") ?? "0");
  const winnerCount = Number.parseInt(winnerCountRaw, 10);
  if (
    !Number.isFinite(winnerCount) ||
    winnerCount < 0 ||
    winnerCount > 10 ||
    String(winnerCount) !== winnerCountRaw.trim()
  ) {
    return {
      success: false,
      error: "Number of winners must be an integer 0–10.",
    };
  }

  // ----- Validate per-place percents -----
  // We only read percent_1..percent_winnerCount. Extras submitted by
  // a stale/cached form are silently ignored — they'd otherwise
  // produce confusing errors when an admin lowers winnerCount but
  // the cached form still POSTs old percent_N fields.
  const payouts: { place: number; percent: number }[] = [];
  let sum = 0;
  for (let p = 1; p <= winnerCount; p++) {
    const raw = String(formData.get(`percent_${p}`) ?? "");
    const trimmed = raw.trim();
    if (trimmed === "" || !/^\d+$/.test(trimmed)) {
      return {
        success: false,
        error: `Place ${p}: payout percent must be a whole number.`,
      };
    }
    const percent = Number.parseInt(trimmed, 10);
    if (percent < 0 || percent > 100) {
      return {
        success: false,
        error: `Place ${p}: payout percent must be between 0 and 100.`,
      };
    }
    payouts.push({ place: p, percent });
    sum += percent;
  }

  if (winnerCount > 0 && sum !== 100) {
    return {
      success: false,
      error: `Payout percentages must add up to 100 (currently ${sum}).`,
    };
  }

  const next: PaymentConfig = {
    entryFeeCents,
    consolationFeeCents,
    winnerCount,
    payouts,
  };

  let result: { previous: PaymentConfig };
  try {
    result = await setPaymentConfig(poolId, next);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save config.",
    };
  }

  // ----- Audit -----
  // Skip the audit row when nothing changed. Compare on a stable
  // JSON of the meaningful fields so we don't write a noop entry
  // every time the admin opens the form and hits Save.
  const prevSerialized = serializeForAudit(result.previous);
  const nextSerialized = serializeForAudit(next);
  if (prevSerialized !== nextSerialized) {
    await logAdminAction(
      session,
      AuditAction.UPDATE_PAYMENT_CONFIG,
      AuditEntity.PAYMENT_CONFIG,
      poolId,
      JSON.parse(prevSerialized) as Record<string, unknown>,
      JSON.parse(nextSerialized) as Record<string, unknown>
    );
  }

  // Revalidate the settings tree and the admin payments page; both
  // surface this data.
  revalidatePath(`/${poolSlug}/admin/settings`);
  revalidatePath(`/${poolSlug}/admin/payments`);

  return { success: true, message: "Payment config saved." };
}

/**
 * Stable JSON for the audit-log diff. Pulls out only the fields a
 * reader cares about, in a fixed key order, so the comparison stays
 * meaningful across runs and the resulting JSON reads cleanly.
 */
function serializeForAudit(cfg: PaymentConfig): string {
  return JSON.stringify({
    entry_fee_cents: cfg.entryFeeCents,
    consolation_fee_cents: cfg.consolationFeeCents,
    payout_winner_count: cfg.winnerCount,
    payouts: cfg.payouts.map((p) => ({
      place: p.place,
      percent: p.percent,
    })),
  });
}
