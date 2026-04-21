import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatchById } from "@/lib/tournament/queries";
import { getStandings } from "@/lib/tournament/standings";
import { isKnockoutPhaseOpen } from "@/lib/picks/validation";
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

  // Get group picks for this match
  const { data: picks } = await supabaseAdmin
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

  // Only fetch knockout picks if knockout phase is locked (not still open)
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
      groupPicks={(picks ?? []) as any}
      knockoutPicks={knockoutPicks as any}
      rankByPickSet={Object.fromEntries(rankByPickSet)}
      poolSlug={poolSlug}
      knockoutPicksHidden={isKnockoutMatch && knockoutStillOpen}
    />
  );
}
