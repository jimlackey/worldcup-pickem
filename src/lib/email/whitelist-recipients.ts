import { supabaseAdmin } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Whitelist-based recipient resolution.
//
// The original recipient lists (all / incomplete-group / incomplete-knockout
// / unpaid-pickset) all filter over ctx.activeMembers — people who have
// already joined the pool and own a participant + pick sets. The two
// whitelist lists are fundamentally different: they target the
// pool_whitelist table, which can include people who have been invited but
// have never created a pick set (so they have no membership/participant
// rollup at all).
//
// Because of that, these lists resolve to bare email strings rather than
// participants. A whitelist-only recipient has no picks to personalise, so
// the broadcast action sends them subject + body with the same widget
// tokens every other recipient gets; per-recipient widgets that depend on
// pick data simply render their empty branch. That's the intended behaviour
// for a "nudge people who haven't entered yet" email.
//
// Two resolved lists:
//   whitelist-all              — every email on the pool's whitelist.
//   whitelist-no-pickset       — whitelist emails with no active pick set
//                                in this pool (i.e. invited but never
//                                created at least one pick set).
//
// Email matching is case-insensitive. The DB columns (pool_whitelist.email,
// participants.email) are CITEXT, but we also lowercase in JS so the
// set-difference below is robust regardless of how a row was stored.
// ---------------------------------------------------------------------------

export interface WhitelistRecipients {
  /** Every whitelisted email for the pool (lowercased, de-duplicated). */
  all: string[];
  /**
   * Whitelisted emails that do NOT own at least one active pick set in
   * this pool. Sorted alphabetically, lowercased, de-duplicated.
   */
  withoutPickSet: string[];
}

/**
 * Resolve the two whitelist recipient lists for a pool in a single pass.
 *
 * Strategy:
 *   1. Pull every whitelist email for the pool.
 *   2. Pull every active pick set's participant_id for the pool, then map
 *      those participant_ids back to emails. The set of those emails is
 *      "has at least one pick set".
 *   3. all              = the whitelist emails.
 *      withoutPickSet   = whitelist emails minus the has-pick-set set.
 */
export async function resolveWhitelistRecipients(
  poolId: string
): Promise<WhitelistRecipients> {
  // ---- 1. Whitelist emails -------------------------------------------------
  const { data: whitelistRows } = await supabaseAdmin
    .from("pool_whitelist")
    .select("email")
    .eq("pool_id", poolId)
    .order("email");

  const whitelistEmails = Array.from(
    new Set(
      (whitelistRows ?? [])
        .map((r) => (r.email as string | null)?.trim().toLowerCase())
        .filter((e): e is string => !!e && e.length > 0)
    )
  );

  if (whitelistEmails.length === 0) {
    return { all: [], withoutPickSet: [] };
  }

  // ---- 2. Emails that own at least one active pick set in this pool --------
  // pick_sets -> participant_id, then participant_id -> email. We only need
  // participants that actually have a pick set here, so we gather the
  // distinct participant_ids first and resolve their emails in one query.
  const { data: pickSetRows } = await supabaseAdmin
    .from("pick_sets")
    .select("participant_id")
    .eq("pool_id", poolId)
    .eq("is_active", true);

  const participantIdsWithPickSet = Array.from(
    new Set(
      (pickSetRows ?? [])
        .map((r) => r.participant_id as string | null)
        .filter((id): id is string => !!id)
    )
  );

  const emailsWithPickSet = new Set<string>();
  if (participantIdsWithPickSet.length > 0) {
    const { data: participantRows } = await supabaseAdmin
      .from("participants")
      .select("email")
      .in("id", participantIdsWithPickSet);

    for (const p of participantRows ?? []) {
      const email = (p.email as string | null)?.trim().toLowerCase();
      if (email) emailsWithPickSet.add(email);
    }
  }

  // ---- 3. Build the two lists ---------------------------------------------
  const withoutPickSet = whitelistEmails
    .filter((email) => !emailsWithPickSet.has(email))
    .sort((a, b) => a.localeCompare(b));

  const all = [...whitelistEmails].sort((a, b) => a.localeCompare(b));

  return { all, withoutPickSet };
}
