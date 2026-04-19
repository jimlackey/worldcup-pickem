import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { getPickSetById } from "@/lib/picks/queries";
import { getGroupPicks } from "@/lib/picks/queries";
import { getMatches, getGroups } from "@/lib/tournament/queries";
import { isGroupPhaseOpen } from "@/lib/picks/validation";
import type { Pool } from "@/types/database";
import { GroupPicksForm } from "./group-picks-form";

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

  // Load matches and existing picks
  const [matches, groups, existingPicks] = await Promise.all([
    getMatches(typedPool, "group"),
    getGroups(typedPool),
    getGroupPicks(pickSetId),
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
    </div>
  );
}
