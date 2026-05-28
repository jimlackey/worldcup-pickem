import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { getParticipantPickSets } from "@/lib/picks/queries";
import { countPickSets } from "@/lib/picks/queries";
import { countPicksByPickSet } from "@/lib/picks/pick-counts";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import { getThirdPlacePicksByPickSet } from "@/lib/third-place/queries";
import type { Pool } from "@/types/database";
import { PickSetDashboard } from "./pick-set-dashboard";
import { OWN_PICKS_FROM } from "@/lib/email/resend-own-picks";

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

  // Count picks per pick set for progress display.
  //
  // Uses the paginated countPicksByPickSet helper. A single user typically
  // has ≤3 pick sets so the 1000-row Supabase cap is unlikely to bite here,
  // but we route through the same helper as the standings page to keep the
  // two views in sync and so the latent bug doesn't surface in larger pools
  // with the per-player cap raised.
  const pickSetIds = pickSets.map((ps) => ps.id);
  const [groupPickCounts, knockoutPickCounts, thirdPlaceByPickSet] =
    await Promise.all([
      countPicksByPickSet("group_picks", pickSetIds),
      countPicksByPickSet("knockout_picks", pickSetIds),
      // Migration 024: only fetch third-place picks when the pool has
      // the pre-season pick mode enabled. For other modes the map is
      // empty and the dashboard card silently skips the row.
      typedPool.consolation_mode === "preseason_pick"
        ? getThirdPlacePicksByPickSet(pickSetIds)
        : Promise.resolve(
            new Map<
              string,
              {
                pickSetId: string;
                pickedTeamId: string;
                pickedTeamName: string;
                pickedTeamCode: string;
                pickedTeamFlagCode: string;
                isCorrect: boolean | null;
              }
            >()
          ),
    ]);

  // Flatten the third-place lookup into a plain object so the dashboard
  // component can stay a server-friendly plain-prop shape (Maps aren't
  // serializable across the client boundary). One entry per pick set
  // that has a pick.
  const thirdPlaceLookup: Record<
    string,
    { teamName: string; teamCode: string; flagCode: string }
  > = {};
  for (const [pickSetId, row] of thirdPlaceByPickSet.entries()) {
    thirdPlaceLookup[pickSetId] = {
      teamName: row.pickedTeamName,
      teamCode: row.pickedTeamCode,
      flagCode: row.pickedTeamFlagCode,
    };
  }

  return (
    <PickSetDashboard
      pool={typedPool}
      session={session}
      pickSets={pickSets}
      currentCount={currentCount}
      groupPickCounts={groupPickCounts}
      knockoutPickCounts={knockoutPickCounts}
      thirdPlacePicks={thirdPlaceLookup}
      groupPhaseOpen={isGroupPhaseOpen(typedPool)}
      knockoutPhaseOpen={isKnockoutPhaseOpen(typedPool)}
      emailFromAddress={OWN_PICKS_FROM}
    />
  );
}
