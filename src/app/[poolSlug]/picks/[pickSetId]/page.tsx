import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPickSetById, getGroupPicks, getKnockoutPicks } from "@/lib/picks/queries";
import { getMatches, getGroups, getTeams } from "@/lib/tournament/queries";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import type { Pool } from "@/types/database";
import { PickSetDetail } from "./pick-set-detail";

interface PickSetViewPageProps {
  params: Promise<{ poolSlug: string; pickSetId: string }>;
}

/**
 * Tournament phase (same 4-phase model used elsewhere):
 *   1: Group picks open                  — page hidden, picks are secret
 *   2: Group games underway              — show Group Phase picks
 *   3: Knockout picks open               — show Group Phase picks; KO picks hidden
 *   4: Knockout games underway           — show Group Phase + Knockout Bracket (toggleable)
 */
function derivePhase(pool: Pool): 1 | 2 | 3 | 4 {
  if (isGroupPhaseOpen(pool)) return 1;
  if (isKnockoutPhaseOpen(pool)) return 3;
  const knockoutLocked =
    !!pool.knockout_lock_at &&
    Date.now() >= new Date(pool.knockout_lock_at).getTime();
  return knockoutLocked ? 4 : 2;
}

export default async function PickSetViewPage({ params }: PickSetViewPageProps) {
  const { poolSlug, pickSetId } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) notFound();
  const typedPool = pool as Pool;

  const phase = derivePhase(typedPool);

  // Phase 1: Group picks are still open. Don't render anyone's pick detail
  // page — anyone with the id in the URL could peek at an in-progress set of
  // picks and either copy it or use it to their strategic advantage. We
  // short-circuit BEFORE any pick data is queried so nothing leaks even via
  // view-source.
  if (phase === 1) {
    return (
      <div className="space-y-4">
        <Link
          href={`/${poolSlug}/standings`}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
        >
          ← Back to Standings
        </Link>
        <h1 className="text-2xl font-display font-bold">Picks hidden</h1>
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)]">
            Individual pick sets are hidden while the Group Phase is still open.
            They become visible once group picks are locked and games begin.
          </p>
        </div>
      </div>
    );
  }

  const pickSet = await getPickSetById(pickSetId, pool.id);
  if (!pickSet) notFound();

  const { data: participant } = await supabaseAdmin
    .from("participants")
    .select("display_name, email")
    .eq("id", pickSet.participant_id)
    .single();

  const knockoutStillOpen = phase === 3;

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

  const knockoutPicksMap: Record<
    string,
    { picked_team_id: string; is_correct: boolean | null }
  > = {};
  for (const kp of knockoutPicks) {
    knockoutPicksMap[kp.match_id] = {
      picked_team_id: kp.picked_team_id,
      is_correct: kp.is_correct,
    };
  }

  const groupCorrect = groupPicks.filter((p) => p.is_correct === true).length;
  const knockoutCorrect = knockoutPicks.filter((p) => p.is_correct === true).length;

  // Graded counts: how many of the player's picks have a decided (non-null)
  // is_correct value. This is the denominator for the preview tiles so that
  // "31/72" is understood as "31 correct out of 31 graded so far" rather than
  // "picked 31 of 72 matches", which is misleading when the player has in
  // fact picked every match.
  const groupGraded = groupPicks.filter((p) => p.is_correct !== null).length;
  const knockoutGraded = knockoutPicks.filter((p) => p.is_correct !== null).length;

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
      groupGraded={groupGraded}
      knockoutGraded={knockoutGraded}
      totalGroupPicks={groupPicks.length}
      totalKnockoutPicks={knockoutPicks.length}
      knockoutPicksHidden={knockoutStillOpen}
      phase={phase as 2 | 3 | 4}
      poolSlug={poolSlug}
      pool={typedPool}
    />
  );
}
