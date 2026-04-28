import { supabaseAdmin } from "@/lib/supabase/server";
import { getStandings } from "@/lib/tournament/standings";
import { countPicksByPickSet } from "@/lib/picks/pick-counts";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import type { Pool } from "@/types/database";
import { StandingsView } from "./standings-view";

interface StandingsPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function StandingsPage({ params }: StandingsPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) return <p>Pool not found.</p>;

  const typedPool = pool as Pool;
  const standings = await getStandings(pool.id);

  const groupOpen = isGroupPhaseOpen(typedPool);
  const knockoutOpen = isKnockoutPhaseOpen(typedPool);

  // If group picks are still open, fetch pick counts per pick set
  // so we can show progress (e.g. "63 of 72").
  //
  // NOTE: counts are paginated. With ~14+ pick sets fully filled out
  // (14 × 72 = 1008 rows) the un-paginated query was hitting Supabase's
  // default 1000-row cap, which left some pick sets reporting 0/72 even
  // though they were complete. countPicksByPickSet pages through with
  // .range() so the rollup is exhaustive.
  let pickCounts: Record<string, number> = {};
  let knockoutPickCounts: Record<string, number> = {};

  if (groupOpen || knockoutOpen) {
    const pickSetIds = standings.map((s) => s.pick_set_id);
    if (pickSetIds.length > 0) {
      if (groupOpen) {
        pickCounts = await countPicksByPickSet("group_picks", pickSetIds);
      }
      if (knockoutOpen) {
        knockoutPickCounts = await countPicksByPickSet(
          "knockout_picks",
          pickSetIds
        );
      }
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Standings</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {standings.length} player{standings.length !== 1 ? "s" : ""}
        </p>
      </div>

      <StandingsView
        standings={standings}
        poolSlug={poolSlug}
        groupPicksOpen={groupOpen}
        knockoutPicksOpen={knockoutOpen}
        groupPickCounts={pickCounts}
        knockoutPickCounts={knockoutPickCounts}
      />
    </div>
  );
}
