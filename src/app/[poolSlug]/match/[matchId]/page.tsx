import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatchById } from "@/lib/tournament/queries";
import { getStandings } from "@/lib/tournament/standings";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import type { Pool } from "@/types/database";
import { GameDrilldown } from "./game-drilldown";

interface MatchPageProps {
  params: Promise<{ poolSlug: string; matchId: string }>;
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { poolSlug, matchId } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) notFound();

  const typedPool = pool as Pool;
  const groupStillOpen = isGroupPhaseOpen(typedPool);
  const knockoutStillOpen = isKnockoutPhaseOpen(typedPool);

  const [match, standings] = await Promise.all([
    getMatchById(matchId),
    getStandings(pool.id),
  ]);

  if (!match) return notFound();

  const isKnockoutMatch = match.phase !== "group";

  // Build rank lookup: pickSetId → rank
  const rankByPickSet = new Map<string, number>();
  for (const row of standings) {
    rankByPickSet.set(row.pick_set_id, row.rank ?? 0);
  }

  // GROUP PICKS: Only fetch if picks are locked (games have started / lock passed).
  // Before the group-phase lock, picks are secret — don't even query them from
  // the DB, so there's no chance of leakage via view-source or devtools.
  let groupPicks: any[] = [];
  if (!isKnockoutMatch && !groupStillOpen) {
    const { data } = await supabaseAdmin
      .from("group_picks")
      .select(`
        pick,
        is_correct,
        pick_set:pick_sets!inner(
          id,
          name,
          pool_id,
          participant:participants(display_name, email)
        )
      `)
      .eq("match_id", matchId)
      .eq("pick_set.pool_id", pool.id);
    groupPicks = data ?? [];
  }

  // KNOCKOUT PICKS: Only fetch when knockout lock has passed.
  let knockoutPicks: any[] = [];
  if (isKnockoutMatch && !knockoutStillOpen) {
    const { data } = await supabaseAdmin
      .from("knockout_picks")
      .select(`
        picked_team_id,
        is_correct,
        pick_set:pick_sets!inner(
          id,
          name,
          pool_id,
          participant:participants(display_name, email)
        )
      `)
      .eq("match_id", matchId)
      .eq("pick_set.pool_id", pool.id);
    knockoutPicks = data ?? [];
  }

  return (
    <GameDrilldown
      match={match}
      groupPicks={groupPicks as any}
      knockoutPicks={knockoutPicks as any}
      rankByPickSet={Object.fromEntries(rankByPickSet)}
      poolSlug={poolSlug}
      groupPicksHidden={!isKnockoutMatch && groupStillOpen}
      knockoutPicksHidden={isKnockoutMatch && knockoutStillOpen}
    />
  );
}
