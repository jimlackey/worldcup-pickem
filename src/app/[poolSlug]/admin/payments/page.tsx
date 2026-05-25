import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { getPaymentRows } from "@/lib/payments/queries";
import type { Pool } from "@/types/database";
import { PaymentsView } from "./payments-view";

interface PaymentsPageProps {
  params: Promise<{ poolSlug: string }>;
}

/**
 * Admin → Payments
 *
 * Per-pick-set paid/unpaid tracking with admin notes. One row per
 * active pick set in the pool (a participant with three pick sets
 * appears on three rows, each independently markable).
 *
 * Authorization: the parent admin layout already gates this to
 * role=admin, but we call requirePoolAuth here too for defense in
 * depth and to keep the page self-contained if the layout ever
 * changes.
 */
export default async function PaymentsPage({ params }: PaymentsPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;
  const typedPool = pool as Pool;

  await requirePoolAuth(pool.id, pool.slug, "admin");

  const rows = await getPaymentRows(pool.id);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold">Payments</h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          {rows.length} pick set{rows.length !== 1 ? "s" : ""} in this
          pool. Toggle paid status per pick set and add notes. Use Export
          CSV to pull the full list.
        </p>
      </div>

      <PaymentsView poolId={typedPool.id} poolSlug={poolSlug} rows={rows} />
    </div>
  );
}
