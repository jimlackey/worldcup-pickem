import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getWhatIfData } from "@/lib/what-if/queries";
import { getGroups, getTeams } from "@/lib/tournament/queries";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import type { Pool } from "@/types/database";
import { WhatIfShell } from "./what-if-shell";

interface WhatIfPageProps {
  params: Promise<{ poolSlug: string }>;
}

/**
 * Tournament phase (same 4-phase model used in pick-set-dashboard):
 *   1: Group picks open                  — picks aren't visible yet; nothing to simulate.
 *   2: Group games underway              — show Group Phase picker only.
 *   3: Knockout picks open               — picks aren't visible yet; nothing to simulate.
 *   4: Knockout games underway           — show Knockout Bracket only.
 *
 * Phases 2 and 4 both have all lock flags in the "closed" state; we distinguish
 * them by whether knockout_lock_at has passed.
 */
function derivePhase(pool: Pool): 1 | 2 | 3 | 4 {
  if (isGroupPhaseOpen(pool)) return 1;
  if (isKnockoutPhaseOpen(pool)) return 3;
  const knockoutLocked =
    !!pool.knockout_lock_at && Date.now() >= new Date(pool.knockout_lock_at).getTime();
  return knockoutLocked ? 4 : 2;
}

export default async function WhatIfPage({ params }: WhatIfPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) notFound();
  const typedPool = pool as Pool;

  const phase = derivePhase(typedPool);

  // Phases 1 & 3: picks are still being entered, so there's nothing meaningful
  // to simulate. Render a note-only page.
  if (phase === 1 || phase === 3) {
    const message =
      phase === 1
        ? "The What If page will be functional after the Group Phase matches begin."
        : "The What If page will be functional after the Knockout Bracket matches begin.";

    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-display font-bold">What If</h1>
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)]">{message}</p>
          <Link
            href={`/${poolSlug}/standings`}
            className="mt-3 inline-block text-sm font-medium text-pitch-600 hover:text-pitch-700 transition-colors"
          >
            ← Back to Standings
          </Link>
        </div>
      </div>
    );
  }

  // Phases 2 & 4: show the shell, restricted to the phase that's currently
  // underway. Phase 2 shows Group Phase matches only; Phase 4 shows the
  // Knockout Bracket only.
  const restrictTo: "group" | "knockout" = phase === 2 ? "group" : "knockout";

  const [data, groups, teams] = await Promise.all([
    getWhatIfData(typedPool),
    getGroups(typedPool),
    getTeams(typedPool),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-display font-bold">What If</h1>
      <WhatIfShell
        data={data}
        groups={groups}
        teams={teams}
        poolSlug={poolSlug}
        restrictTo={restrictTo}
        pool={typedPool}
      />
    </div>
  );
}
