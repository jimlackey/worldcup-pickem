import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolWhitelist } from "@/lib/pool/queries";
import type { Pool } from "@/types/database";
import { WhitelistManager } from "./whitelist-manager";

interface WhitelistPageProps {
  params: Promise<{ poolSlug: string }>;
}

/**
 * Email whitelist management — extracted from the Settings page so it can
 * live as its own tab between Players and Settings. The widget itself
 * (WhitelistManager) is unchanged from when it sat under Settings;
 * relocation only.
 *
 * Applies to both demo and real pools — every pool has a whitelist that
 * gates who can join, regardless of pool type.
 */
export default async function WhitelistPage({ params }: WhitelistPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;

  const whitelist = await getPoolWhitelist(pool.id);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold">
          Email Whitelist
          <span className="text-sm font-normal text-[var(--color-text-muted)] ml-2">
            {whitelist.length} email{whitelist.length === 1 ? "" : "s"}
          </span>
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Only emails on this list can join the pool. Add individuals from the
          &quot;Add one&quot; tab or paste a list with &quot;Add many.&quot;
        </p>
      </div>

      <WhitelistManager pool={pool as Pool} whitelist={whitelist} />
    </div>
  );
}
