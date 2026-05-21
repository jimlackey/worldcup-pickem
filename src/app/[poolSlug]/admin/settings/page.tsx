import { supabaseAdmin } from "@/lib/supabase/server";
import { getScoringConfig } from "@/lib/tournament/queries";
import { getPoolWhitelist } from "@/lib/pool/queries";
import type { Pool } from "@/types/database";
import { ScoringForm } from "./scoring-form";
import { DatesForm } from "./dates-form";
import { WhitelistManager } from "./whitelist-manager";
import { PoolVisibilityToggle } from "./pool-visibility-toggle";
import { PoolLoginRequiredToggle } from "./pool-login-required-toggle";
import { PoolConsolationToggle } from "./pool-consolation-toggle";
import { PoolShowFifaRankingsToggle } from "./pool-show-fifa-rankings-toggle";
import { PoolShowMatchLinesToggle } from "./pool-show-match-lines-toggle";

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

  // Match lines are a real-pool-only feature. Demo pools have their own
  // pool-scoped match rows whose fixtures may diverge from the real
  // tournament (admins can rewire knockout brackets to demo alternate
  // scenarios), so attaching globally-fetched lines to those rows would
  // surface incorrect odds against the wrong matchups. Migration 017
  // force-disables the flag on every demo pool, and this page hides the
  // toggle so it can't be re-enabled.
  const isDemo = Boolean(pool.is_demo);

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
        <h2 className="text-lg font-display font-bold mb-3">Bracket Settings</h2>
        <PoolConsolationToggle pool={pool as Pool} />
      </section>

      <section>
        <h2 className="text-lg font-display font-bold mb-3">Picks Form Display</h2>
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          Optional context for players on the editable group picks form.
          These don&apos;t affect scoring — just what shows up beside the
          team names and pick buttons.
        </p>
        <div className="space-y-3">
          <PoolShowFifaRankingsToggle pool={pool as Pool} />
          {/* Match lines are global tournament data managed at
              /super-admin/lines. The lines are tied to specific match
              fixtures, which demo pools can rewire — so we don't surface
              them on demo pools at all. Real pools get the toggle. */}
          {!isDemo && <PoolShowMatchLinesToggle pool={pool as Pool} />}
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
