import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Server-side helpers for the per-pool Payment Config (migration 025).
 *
 * The Payment Config lives at /admin/settings and records:
 *   - Entry fee (per pick set, cents)
 *   - Consolation fee (cents) — gates the optional 3rd-place pick
 *   - Payout schedule (0–10 places, each with a percent)
 *
 * The entry/consolation fees live on the `pools` row directly (added
 * in migration 025); the payout schedule lives in the separate
 * `pool_payouts` table, one row per (pool, place). This module
 * provides typed read/write helpers; the calling server action
 * handles auth and audit-logging.
 */

export interface PayoutRow {
  place: number;
  percent: number;
}

export interface PaymentConfig {
  entryFeeCents: number;
  consolationFeeCents: number;
  winnerCount: number;
  /**
   * Rows in place order (1, 2, 3, ...). Length is exactly
   * winnerCount; if the DB ever drifts (e.g. winnerCount=3 but only
   * 2 rows exist after a partial save), missing places are filled
   * with percent=0 so the UI can render a stable grid.
   */
  payouts: PayoutRow[];
}

/**
 * Fetch the full Payment Config for a pool. Three reads in parallel
 * — the pool row (for the cents columns + winner count) and the
 * pool_payouts rows. We don't fan this out to the caller because
 * the admin settings page always needs all three at once.
 */
export async function getPaymentConfig(
  poolId: string
): Promise<PaymentConfig> {
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select(
      "entry_fee_cents, consolation_fee_cents, payout_winner_count"
    )
    .eq("id", poolId)
    .single();

  const entryFeeCents = (pool?.entry_fee_cents as number | undefined) ?? 2000;
  const consolationFeeCents =
    (pool?.consolation_fee_cents as number | undefined) ?? 500;
  const winnerCount =
    (pool?.payout_winner_count as number | undefined) ?? 0;

  const { data: payoutRows } = await supabaseAdmin
    .from("pool_payouts")
    .select("place, percent")
    .eq("pool_id", poolId)
    .order("place");

  // Build a place→percent map then re-emit in 1..winnerCount order.
  // Defensive against schema drift (rows beyond winnerCount, missing
  // places, etc.); the admin form is the source of truth for "what's
  // a valid schedule" and rebuilds the table on every save.
  const byPlace = new Map<number, number>();
  for (const row of (payoutRows ?? []) as { place: number; percent: number }[]) {
    byPlace.set(row.place, row.percent);
  }
  const payouts: PayoutRow[] = [];
  for (let p = 1; p <= winnerCount; p++) {
    payouts.push({ place: p, percent: byPlace.get(p) ?? 0 });
  }

  return {
    entryFeeCents,
    consolationFeeCents,
    winnerCount,
    payouts,
  };
}

/**
 * Atomically replace a pool's full Payment Config — fees, winner
 * count, and payout rows — in one round-trip. Returns the previous
 * config (in the same shape) so the calling server action can write
 * a clean diff to the audit log.
 *
 * STRATEGY
 * --------
 * Two writes, sequenced:
 *   1. UPDATE pools SET entry_fee_cents=..., consolation_fee_cents=...,
 *      payout_winner_count=...
 *   2. DELETE all existing pool_payouts rows for the pool, then
 *      INSERT one row per place in the new schedule.
 *
 * Why delete-then-insert rather than upsert + delete-excess: it's
 * fewer round-trips for the common "admin changed every percent"
 * case, the delete is bounded (≤10 rows), and the insert is also
 * bounded. We don't wrap in an explicit transaction because
 * Supabase's REST client doesn't expose them; if the delete
 * succeeds and the insert fails the row count temporarily drops to
 * zero — the next page render rebuilds via getPaymentConfig's
 * defensive Map (winnerCount columns still exist) so the admin sees
 * percent=0 rows they can re-enter rather than an opaque error.
 *
 * The sum-to-100 rule is enforced at the calling action's Zod schema
 * BEFORE this function runs; we don't re-check it here because the
 * fix path is to surface the error in the form, not to silently
 * reject in the data layer.
 */
export async function setPaymentConfig(
  poolId: string,
  next: PaymentConfig
): Promise<{ previous: PaymentConfig }> {
  const previous = await getPaymentConfig(poolId);

  const { error: updateErr } = await supabaseAdmin
    .from("pools")
    .update({
      entry_fee_cents: next.entryFeeCents,
      consolation_fee_cents: next.consolationFeeCents,
      payout_winner_count: next.winnerCount,
    })
    .eq("id", poolId);

  if (updateErr) {
    throw new Error(`Failed to update pool fees: ${updateErr.message}`);
  }

  // Clear the existing schedule. Cheap when there's nothing to clear
  // (returns 0 rows affected).
  const { error: delErr } = await supabaseAdmin
    .from("pool_payouts")
    .delete()
    .eq("pool_id", poolId);

  if (delErr) {
    throw new Error(`Failed to clear payouts: ${delErr.message}`);
  }

  // Insert the new schedule. Skipped entirely when winnerCount=0 so
  // we don't issue an empty INSERT (which Supabase would reject).
  if (next.payouts.length > 0) {
    const { error: insErr } = await supabaseAdmin
      .from("pool_payouts")
      .insert(
        next.payouts.map((p) => ({
          pool_id: poolId,
          place: p.place,
          percent: p.percent,
        }))
      );

    if (insErr) {
      throw new Error(`Failed to write payouts: ${insErr.message}`);
    }
  }

  return { previous };
}
