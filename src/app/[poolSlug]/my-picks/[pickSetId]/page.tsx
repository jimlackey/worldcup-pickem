import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { getPickSetById } from "@/lib/picks/queries";
import { getGroupPicks } from "@/lib/picks/queries";
import { getMatches, getGroups, getTeams } from "@/lib/tournament/queries";
import { isGroupPhaseOpen } from "@/lib/picks/validation";
import { getThirdPlacePick } from "@/lib/third-place/queries";
import type { Pool } from "@/types/database";
import { GroupPicksForm } from "./group-picks-form";
import { ThirdPlacePicker } from "./third-place-picker";

interface PickSetPageProps {
  params: Promise<{ poolSlug: string; pickSetId: string }>;
}

export default async function PickSetPage({ params }: PickSetPageProps) {
  const { poolSlug, pickSetId } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) notFound();

  const session = await requirePoolAuth(pool.id, pool.slug);
  const typedPool = pool as Pool;

  // Verify pick set exists and belongs to this user
  const pickSet = await getPickSetById(pickSetId, pool.id);
  if (!pickSet || pickSet.participant_id !== session.participantId) {
    redirect(`/${poolSlug}/my-picks`);
  }

  // Check if group phase is open
  const groupOpen = isGroupPhaseOpen(typedPool);

  // Migration 024: only fetch teams + the third-place pick when the
  // pool actually has the pre-tournament pick mode enabled. For pools
  // in any other mode the picker doesn't render and we save the
  // round-trip. Teams are also needed by the picker UI to render the
  // 48 countries grouped by group.
  const showThirdPlacePicker =
    typedPool.consolation_mode === "preseason_pick";

  // Parallel fetches — same shape as before, with teams and the
  // third-place pick added conditionally on the new mode.
  const [matches, groups, existingPicks, teams, thirdPlacePick] =
    await Promise.all([
      getMatches(typedPool, "group"),
      getGroups(typedPool),
      getGroupPicks(pickSetId),
      showThirdPlacePicker ? getTeams(typedPool) : Promise.resolve([]),
      showThirdPlacePicker
        ? getThirdPlacePick(pickSetId)
        : Promise.resolve(null),
    ]);

  // Build picks map: matchId → pick value
  const picksMap: Record<string, string> = {};
  for (const pick of existingPicks) {
    picksMap[pick.match_id] = pick.pick;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-display font-bold">{pickSet.name}</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Group Phase Picks
          {!groupOpen && (
            <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
              Locked
            </span>
          )}
        </p>
      </div>

      <GroupPicksForm
        matches={matches}
        groups={groups}
        existingPicks={picksMap}
        pickSetId={pickSetId}
        pool={typedPool}
        isLocked={!groupOpen}
      />

      {/* Migration 024: optional Pre-Tournament 3rd-Place pick. Renders
          BELOW the group picks form so it's the last thing on the
          page — players are expected to finish the 72 group picks
          first and then optionally add the 3rd-place selection. The
          picker is a sibling of GroupPicksForm rather than a section
          inside it, so the much larger group picks form stays
          untouched by this change. */}
      {showThirdPlacePicker && (
        <ThirdPlacePicker
          pool={typedPool}
          pickSetId={pickSetId}
          teams={teams}
          groups={groups}
          initialTeamId={thirdPlacePick?.pickedTeamId ?? null}
          isLocked={!groupOpen}
        />
      )}
    </div>
  );
}
