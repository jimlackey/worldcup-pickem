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
 * The two counts are deliberately independent:
 *   - paidCount counts rows in pool_payments where is_paid = TRUE.
 *     This is the admin's source of truth for who has paid the
 *     entry fee and is the right denominator for "30 paid pick
 *     sets" in the user spec.
 *   - consolationPickCount counts rows in third_place_picks for
 *     the pool's pick sets. Per the spec, this is "players who
 *     have selected a 3rd place winner", not "players who have
 *     paid the consolation fee" — the admin tracks payment
 *     separately on pool_payments.is_third_place_paid, but the
 *     About page shows the *potential* pot based on selections
 *     made.
 */

export interface AboutPayoutCounts {
  /**
   * Number of pick sets in the pool with is_paid = TRUE in
   * pool_payments. Used as the multiplier on entry_fee_cents to get
   * the total pot.
   */
  paidCount: number;
  /**
   * Number of pick sets in the pool that have a row in
   * third_place_picks. Used as the multiplier on consolation_fee_cents
   * to get the consolation pot. Always 0 when the pool isn't in
   * preseason_pick mode (the rows wouldn't exist), but we don't
   * gate this query on the mode flag — the cost of the extra count
   * is one indexed read and keeping the logic mode-agnostic is
   * simpler.
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

  // Run the two counts in parallel against the active-id list.
  const [paidResult, consolationResult] = await Promise.all([
    supabaseAdmin
      .from("pool_payments")
      .select("pick_set_id", { count: "exact", head: true })
      .in("pick_set_id", activeIds)
      .eq("is_paid", true),
    supabaseAdmin
      .from("third_place_picks")
      .select("pick_set_id", { count: "exact", head: true })
      .in("pick_set_id", activeIds),
  ]);

  return {
    paidCount: paidResult.count ?? 0,
    consolationPickCount: consolationResult.count ?? 0,
  };
}
