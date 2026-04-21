import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPickSetById, getGroupPicks, getKnockoutPicks } from "@/lib/picks/queries";
import { getMatches, getGroups, getTeams } from "@/lib/tournament/queries";
import { isKnockoutPhaseOpen } from "@/lib/picks/validation";
import type { Pool } from "@/types/database";
import { PickSetDetail } from "./pick-set-detail";

interface PickSetViewPageProps {
  params: Promise<{ poolSlug: string; pickSetId: string }>;
}

export default async function PickSetViewPage({ params }: PickSetViewPageProps) {
  const { poolSlug, pickSetId } = await params;

  const { data: pool } = await supabaseAdmin.from("pools")
    .select("*").eq("slug", poolSlug).eq("is_active", true).single();

  if (!pool) notFound();
  const typedPool = pool as Pool;

  const pickSet = await getPickSetById(pickSetId, pool.id);
  if (!pickSet) notFound();

  const { data: participant } = await supabaseAdmin
    .from("participants")
    .select("display_name, email")
    .eq("id", pickSet.participant_id)
    .single();

  const knockoutStillOpen = isKnockoutPhaseOpen(typedPool);

  const [matches, groups, teams, groupPicks, knockoutPicks] = await Promise.all([
    getMatches(typedPool),
    getGroups(typedPool),
    getTeams(typedPool),
    getGroupPicks(pickSetId),
    // Only fetch knockout picks if knockout is locked (not still open)
    knockoutStillOpen ? Promise.resolve([]) : getKnockoutPicks(pickSetId),
  ]);

  const groupPicksMap: Record<string, { pick: string; is_correct: boolean | null }> = {};
  for (const gp of groupPicks) {
    groupPicksMap[gp.match_id] = { pick: gp.pick, is_correct: gp.is_correct };
  }

  const knockoutPicksMap: Record<string, { picked_team_id: string; is_correct: boolean | null }> = {};
  for (const kp of knockoutPicks) {
    knockoutPicksMap[kp.match_id] = { picked_team_id: kp.picked_team_id, is_correct: kp.is_correct };
  }

  const groupCorrect = groupPicks.filter((p) => p.is_correct === true).length;
  const knockoutCorrect = knockoutPicks.filter((p) => p.is_correct === true).length;

  return (
    <PickSetDetail
      pickSetName={pickSet.name}
      participantName={participant?.display_name || participant?.email || "Unknown"}
      matches={matches}
      groups={groups}
      teams={teams}
      groupPicksMap={groupPicksMap}
      knockoutPicksMap={knockoutPicksMap}
      groupCorrect={groupCorrect}
      knockoutCorrect={knockoutCorrect}
      totalGroupPicks={groupPicks.length}
      totalKnockoutPicks={knockoutPicks.length}
      knockoutPicksHidden={knockoutStillOpen}
      poolSlug={poolSlug}
    />
  );
}
