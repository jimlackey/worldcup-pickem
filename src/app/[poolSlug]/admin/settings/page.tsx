import { supabaseAdmin } from "@/lib/supabase/server";
import { getScoringConfig } from "@/lib/tournament/queries";
import { getPoolWhitelist } from "@/lib/pool/queries";
import type { Pool } from "@/types/database";
import { ScoringForm } from "./scoring-form";
import { DatesForm } from "./dates-form";
import { WhitelistManager } from "./whitelist-manager";
import { PoolVisibilityToggle } from "./pool-visibility-toggle";
import { PoolLoginRequiredToggle } from "./pool-login-required-toggle";

interface SettingsPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;

  const [scoring, whitelist] = await Promise.all([
    getScoringConfig(pool.id),
    getPoolWhitelist(pool.id),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-display font-bold mb-3">Pool Visibility</h2>
        <div className="space-y-3">
          <PoolVisibilityToggle pool={pool as Pool} />
          <PoolLoginRequiredToggle pool={pool as Pool} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-display font-bold mb-3">Tournament Dates</h2>
        <p className="text-xs text-[var(--color-text-muted)] mb-2">
          All times are in Pacific Time (PT).
        </p>
        <DatesForm pool={pool as Pool} />
      </section>

      <section>
        <h2 className="text-lg font-display font-bold mb-3">Scoring Config</h2>
        <ScoringForm pool={pool as Pool} scoring={scoring} />
      </section>

      <section>
        <h2 className="text-lg font-display font-bold mb-3">
          Email Whitelist
          <span className="text-sm font-normal text-[var(--color-text-muted)] ml-2">
            {whitelist.length} emails
          </span>
        </h2>
        <WhitelistManager pool={pool as Pool} whitelist={whitelist} />
      </section>
    </div>
  );
}
