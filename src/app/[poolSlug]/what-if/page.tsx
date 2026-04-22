import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getWhatIfData } from "@/lib/what-if/queries";
import { getGroups, getTeams } from "@/lib/tournament/queries";
import { isGroupPhaseOpen } from "@/lib/picks/validation";
import type { Pool } from "@/types/database";
import { WhatIfShell } from "./what-if-shell";

interface WhatIfPageProps {
  params: Promise<{ poolSlug: string }>;
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

  // Gate: before group picks lock, there's nothing to "what-if" because no
  // actual picks are visible yet, and nothing is undecided vs decided.
  if (isGroupPhaseOpen(typedPool)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-display font-bold">What If</h1>
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)]">
            What-If mode opens once group phase picks lock.
          </p>
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

  const [data, groups, teams] = await Promise.all([
    getWhatIfData(typedPool),
    getGroups(typedPool),
    getTeams(typedPool),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">What If</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Simulate outcomes of undecided matches to see how standings would shift.
          Your picks never leave this page — refresh to reset.
        </p>
      </div>

      <WhatIfShell
        data={data}
        groups={groups}
        teams={teams}
        poolSlug={poolSlug}
      />
    </div>
  );
}
