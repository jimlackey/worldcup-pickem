import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Aggregate counts for the per-pool /about page Payout section
 * (added on top of migrations 024 + 025).
 *
 * The About page wants to display:
 *   - Total pot from paid pick-set entries: entry_fee_cents * paidCount
 *   - Per-place payouts: pot * percent / 100
 *   - Optionally (when consolation_mode = 'preseason_pick'):
 *       consolation pot = consolation_fee_cents * consolationPickCount
 *
 * This module returns the two counts the page needs. Everything else
 * (fees, percent schedule, consolation mode) already lives on the
 * Pool row, so we keep this helper narrow.
 *
 * SCOPE
 * -----
 * Authorization happens in the calling page (it's a public page —
 * no per-row gating). Service-role reads bypass RLS.
 *
 * The two counts are deliberately both drawn from pool_payments so
 * the main pool and the consolation pool share one basis — the admin's
 * paid-status toggles:
 *   - paidCount counts rows in pool_payments where is_paid = TRUE.
 *     This is the admin's source of truth for who has paid the
 *     entry fee and is the right denominator for "30 paid pick
 *     sets" in the user spec.
 *   - consolationPickCount counts rows in pool_payments where
 *     is_third_place_paid = TRUE — i.e. players the admin has marked
 *     as having paid the optional 3rd-place buy-in. (It previously
 *     counted 3rd-place *selections* in third_place_picks; that was
 *     inconsistent with the main pool, which only ever counts paid
 *     entries. The field name is kept for prop-shape stability even
 *     though it now reflects paid status rather than selections.)
 */

export interface AboutPayoutCounts {
  /**
   * Number of pick sets in the pool with is_paid = TRUE in
   * pool_payments. Used as the multiplier on entry_fee_cents to get
   * the total pot.
   */
  paidCount: number;
  /**
   * Number of pick sets in the pool the admin has marked as having
   * paid the optional 3rd-place buy-in (pool_payments.is_third_place_paid
   * = TRUE). Used as the multiplier on consolation_fee_cents to get the
   * consolation pot, mirroring how paidCount drives the main pool. 0
   * when nobody has been marked 3rd-place-paid (including when the pool
   * isn't in preseason_pick mode). The name predates the switch from
   * counting selections to counting paid status; kept for prop-shape
   * stability.
   */
  consolationPickCount: number;
}

/**
 * Fetch both counts in parallel. Either count may legitimately be 0
 * (no payments yet, no consolation picks yet) — the caller treats
 * those as "show the percentage row with $0 amounts" rather than as
 * a missing-data error.
 *
 * Both counts are scoped to the pool's *active* pick sets. A
 * deactivated pick set isn't paying anything, so excluding inactive
 * ones from the denominator keeps the displayed pot honest. The
 * filter is on pick_sets.is_active, not on pool_payments — a
 * deactivated player who was previously marked paid still counts as
 * paid for ledger-accuracy purposes, BUT they don't participate in
 * the prize pool any more, so we drop them from the count.
 */
export async function getAboutPayoutCounts(
  poolId: string
): Promise<AboutPayoutCounts> {
  // Count paid pick sets. We join through pick_sets so the
  // is_active filter sticks. Supabase's count syntax (head:true)
  // returns just the count without the row payload — cheap.
  //
  // We do this in two reads rather than a fancy nested filter
  // because the supabase-js builder doesn't compose "WHERE
  // pick_sets.is_active = true" on a pool_payments query cleanly.
  // Step 1: pull the IDs of active pick sets in the pool.
  // Step 2: count payments rows that point at any of those IDs
  // and have is_paid = true.
  const { data: activePickSets } = await supabaseAdmin
    .from("pick_sets")
    .select("id")
    .eq("pool_id", poolId)
    .eq("is_active", true);

  const activeIds = ((activePickSets ?? []) as { id: string }[]).map(
    (p) => p.id
  );
  if (activeIds.length === 0) {
    return { paidCount: 0, consolationPickCount: 0 };
  }

  // Run the two counts in parallel against the active-id list. Both
  // counts now read from pool_payments so the main pool and the
  // consolation pool use the SAME source of truth — the admin's
  // paid-status toggles — rather than one counting payments and the
  // other counting selections:
  //   - paidCount           → pool_payments.is_paid = TRUE
  //   - consolationPaidCount → pool_payments.is_third_place_paid = TRUE
  // Previously the consolation pot multiplied the fee by the number of
  // 3rd-place *selections* (rows in third_place_picks), which double-
  // counted players who'd selected but not paid and was inconsistent
  // with the main pool's paid-only basis.
  const [paidResult, consolationResult] = await Promise.all([
    supabaseAdmin
      .from("pool_payments")
      .select("pick_set_id", { count: "exact", head: true })
      .in("pick_set_id", activeIds)
      .eq("is_paid", true),
    supabaseAdmin
      .from("pool_payments")
      .select("pick_set_id", { count: "exact", head: true })
      .in("pick_set_id", activeIds)
      .eq("is_third_place_paid", true),
  ]);

  return {
    paidCount: paidResult.count ?? 0,
    consolationPickCount: consolationResult.count ?? 0,
  };
}
