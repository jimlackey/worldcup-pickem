import { supabaseAdmin } from "@/lib/supabase/server";
import { getScoringConfig } from "@/lib/tournament/queries";
import type { Pool } from "@/types/database";
import { ScoringForm } from "./scoring-form";
import { DatesForm } from "./dates-form";
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

  const scoring = await getScoringConfig(pool.id);

  // Demo pools used to be barred from the match-lines toggle because
  // their knockout fixtures can be rewired by admins and the global
  // lines therefore wouldn't match. The current policy is narrower:
  // group-stage fixtures ARE stable across all pools (real and demo),
  // so demo pools get the toggle too — but the data path only
  // propagates lines for group-phase matches (see writeLinesGlobalAndDemos
  // in src/lib/lines/sync.ts). Knockout demo rows stay line-free
  // forever, so the picks form for those simply renders nothing under
  // the buttons even when the toggle is on.
  //
  // The toggle component reads `isDemo` to adjust its description copy
  // so demo admins know the scope is group-phase only.
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
          {/* Match lines: shown to both real and demo pools. The toggle
              reads isDemo to clarify in its description that demo pools
              only surface lines for group-phase matches (knockout
              fixtures can be rewired and the line data wouldn't match).
              The propagation helper (writeLinesGlobalAndDemos) enforces
              that data-side gate. */}
          <PoolShowMatchLinesToggle pool={pool as Pool} isDemo={isDemo} />
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
    </div>
  );
}
