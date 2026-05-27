import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatchById } from "@/lib/tournament/queries";
import { getStandings } from "@/lib/tournament/standings";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import { getPoolSession } from "@/lib/auth/session";
import { getFavoritePickSetIds } from "@/lib/favorites/queries";
import { getFinalPicksByPickSet } from "@/lib/picks/standings-extras";
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

  // Phase-4 distinguisher — knockout was open at some point and is
  // now locked. Mirrors the same derivation used in the standings
  // page (delivery 5) and the /matches distribution page. We need
  // it to gate the new "Tourney winner" column: phase 4 only.
  const now = Date.now();
  const knockoutLocked =
    !!typedPool.knockout_lock_at &&
    now >= new Date(typedPool.knockout_lock_at).getTime();

  const [match, standings] = await Promise.all([
    getMatchById(matchId),
    getStandings(pool.id),
  ]);

  if (!match) return notFound();

  const isKnockoutMatch = match.phase !== "group";

  // Build the lookup maps the drilldown view needs. Rank was already
  // computed here; we additionally derive a points map (group /
  // knockout / total) so the new point columns render the same
  // numbers the /standings page shows. Both maps are keyed on
  // pick_set_id and serialised as plain objects (Records, not Maps)
  // so they cross the server → client boundary cleanly.
  const rankByPickSet = new Map<string, number>();
  const pointsByPickSet = new Map<
    string,
    { group: number; knockout: number; total: number }
  >();
  for (const row of standings) {
    rankByPickSet.set(row.pick_set_id, row.rank ?? 0);
    pointsByPickSet.set(row.pick_set_id, {
      group: row.group_points,
      knockout: row.knockout_points,
      total: row.total_points,
    });
  }

  // ---- Favorites ----
  //
  // Same fetch the /standings page does: the per-user favorites set,
  // empty for guests. Drives both the per-row star toggle and the
  // "Favorites" sub-tab on the drilldown's player list.
  const session = await getPoolSession(pool.id, pool.slug);
  const favoriteIds = session
    ? await getFavoritePickSetIds(pool.id, session.participantId)
    : new Set<string>();

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

  // ---- Tourney Winner picks (for the new column) ----
  //
  // Surfaced only when the knockout phase has fully locked (phase 4).
  // Pre-lock the data never crosses the wire — same privacy gate the
  // /standings page enforces in delivery 5. The map is empty in
  // phases 1-3; the view hides the column entirely via
  // showTourneyWinnerColumn.
  const tourneyWinnerPicksRecord: Record<
    string,
    { teamName: string; teamCode: string; flagCode: string }
  > = {};
  if (knockoutLocked && standings.length > 0) {
    const pickSetIds = standings.map((s) => s.pick_set_id);
    const finalMap = await getFinalPicksByPickSet(pool.id, pickSetIds);
    for (const [id, team] of finalMap) {
      tourneyWinnerPicksRecord[id] = {
        teamName: team.name,
        teamCode: team.code,
        flagCode: team.flagCode,
      };
    }
  }

  return (
    <GameDrilldown
      match={match}
      groupPicks={groupPicks as any}
      knockoutPicks={knockoutPicks as any}
      rankByPickSet={Object.fromEntries(rankByPickSet)}
      pointsByPickSet={Object.fromEntries(pointsByPickSet)}
      poolSlug={poolSlug}
      poolId={pool.id}
      // Pool is passed through so the drilldown can read the two display
      // flags (show_fifa_rankings, show_match_lines). Same pattern used by
      // the editable picks form at /my-picks/{id}/group-picks-form.tsx —
      // those flags toggle the same per-team rank badge and money-line
      // text in both places.
      pool={typedPool}
      groupPicksHidden={!isKnockoutMatch && groupStillOpen}
      knockoutPicksHidden={isKnockoutMatch && knockoutStillOpen}
      favoritePickSetIds={Array.from(favoriteIds)}
      isLoggedIn={!!session}
      knockoutLocked={knockoutLocked}
      tourneyWinnerPicks={tourneyWinnerPicksRecord}
    />
  );
}
