import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { getParticipantPickSets } from "@/lib/picks/queries";
import { countPickSets } from "@/lib/picks/queries";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import type { Pool } from "@/types/database";
import { PickSetDashboard } from "./pick-set-dashboard";

interface MyPicksPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function MyPicksPage({ params }: MyPicksPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) return <p>Pool not found.</p>;

  const session = await requirePoolAuth(pool.id, pool.slug);
  const typedPool = pool as Pool;

  const [pickSets, currentCount] = await Promise.all([
    getParticipantPickSets(pool.id, session.participantId),
    countPickSets(pool.id, session.participantId),
  ]);

  // Count picks per pick set for progress display
  const pickSetIds = pickSets.map((ps) => ps.id);
  let groupPickCounts: Record<string, number> = {};
  let knockoutPickCounts: Record<string, number> = {};

  if (pickSetIds.length > 0) {
    const { data: gpCounts } = await supabaseAdmin
      .from("group_picks")
      .select("pick_set_id")
      .in("pick_set_id", pickSetIds);

    const { data: kpCounts } = await supabaseAdmin
      .from("knockout_picks")
      .select("pick_set_id")
      .in("pick_set_id", pickSetIds);

    for (const gp of gpCounts ?? []) {
      groupPickCounts[gp.pick_set_id] = (groupPickCounts[gp.pick_set_id] ?? 0) + 1;
    }
    for (const kp of kpCounts ?? []) {
      knockoutPickCounts[kp.pick_set_id] = (knockoutPickCounts[kp.pick_set_id] ?? 0) + 1;
    }
  }

  return (
    <PickSetDashboard
      pool={typedPool}
      session={session}
      pickSets={pickSets}
      currentCount={currentCount}
      groupPickCounts={groupPickCounts}
      knockoutPickCounts={knockoutPickCounts}
      groupPhaseOpen={isGroupPhaseOpen(typedPool)}
      knockoutPhaseOpen={isKnockoutPhaseOpen(typedPool)}
    />
  );
}
