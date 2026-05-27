import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatches, getGroups } from "@/lib/tournament/queries";
import { isGroupPhaseOpen } from "@/lib/picks/validation";
import {
  getGroupPickDistribution,
  getKnockoutPickDistribution,
  type MatchPickDistribution,
} from "@/lib/picks/match-pick-counts";
import type { Pool } from "@/types/database";
import { MatchBrowser } from "./match-browser";

interface MatchesPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function MatchesPage({ params }: MatchesPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) return <p>Pool not found.</p>;
  const typedPool = pool as Pool;

  const [matches, groups] = await Promise.all([
    getMatches(typedPool),
    getGroups(typedPool),
  ]);

  // ---- Pick distributions (per-match aggregations) ----
  //
  // The /matches view surfaces, beneath each match row, the count and
  // percentage of pick sets that picked each outcome. PRIVACY GATE: we
  // only fetch the data once the relevant phase has locked, mirroring
  // the /match/{matchId} drilldown's "before lock, don't even query
  // them from the DB so there's no chance of leakage via view-source
  // or devtools" pattern.
  //
  //   - Group distributions surface once isGroupPhaseOpen is false
  //     (i.e. group_lock_at is in the past).
  //   - Knockout distributions surface once knockout_lock_at is in
  //     the past — which is strictly later than knockout_open_at,
  //     not the same gate. We compute it server-side here rather
  //     than reusing isKnockoutPhaseOpen, since that helper returns
  //     true ONLY during the open window and would also be false
  //     pre-open (when picks don't exist yet); we specifically need
  //     "after the lock."
  const now = Date.now();
  const groupLocked = !isGroupPhaseOpen(typedPool);
  const knockoutLocked =
    !!typedPool.knockout_lock_at &&
    now >= new Date(typedPool.knockout_lock_at).getTime();

  // Build the home/away lookup the knockout aggregator needs. We have
  // the full match list in memory; one pass to extract the relevant
  // fields is cheap.
  const knockoutTeamMap = new Map<
    string,
    { home_team_id: string | null; away_team_id: string | null }
  >();
  for (const m of matches) {
    if (m.phase === "group") continue;
    knockoutTeamMap.set(m.id, {
      home_team_id: m.home_team_id ?? null,
      away_team_id: m.away_team_id ?? null,
    });
  }

  let groupDistribution = new Map<string, MatchPickDistribution>();
  let knockoutDistribution = new Map<string, MatchPickDistribution>();

  if (groupLocked || knockoutLocked) {
    // Issue the reads in parallel where possible. Either query is a
    // no-op when its gate is false.
    const [gd, kd] = await Promise.all([
      groupLocked
        ? getGroupPickDistribution(pool.id)
        : Promise.resolve(new Map<string, MatchPickDistribution>()),
      knockoutLocked
        ? getKnockoutPickDistribution(pool.id, knockoutTeamMap)
        : Promise.resolve(new Map<string, MatchPickDistribution>()),
    ]);
    groupDistribution = gd;
    knockoutDistribution = kd;
  }

  // Serialise the maps to plain objects for the client boundary —
  // Maps don't survive the server → client component prop crossing
  // in Next.js. Both maps are typically small (≤103 matches).
  const distributionRecord: Record<string, MatchPickDistribution> = {};
  for (const [k, v] of groupDistribution) distributionRecord[k] = v;
  for (const [k, v] of knockoutDistribution) distributionRecord[k] = v;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Matches</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Select a match to see how everyone picked it.
        </p>
      </div>

      <MatchBrowser
        matches={matches}
        groups={groups}
        poolSlug={poolSlug}
        pickDistributions={distributionRecord}
        groupLocked={groupLocked}
        knockoutLocked={knockoutLocked}
      />
    </div>
  );
}
