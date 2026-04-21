import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { getPickSetById, getKnockoutPicks } from "@/lib/picks/queries";
import { getMatches, getTeams } from "@/lib/tournament/queries";
import { isKnockoutPhaseOpen } from "@/lib/picks/validation";
import type { Pool } from "@/types/database";
import { BracketPicker } from "./bracket-picker";

interface KnockoutPicksPageProps {
  params: Promise<{ poolSlug: string; pickSetId: string }>;
}

export default async function KnockoutPicksPage({ params }: KnockoutPicksPageProps) {
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

  const pickSet = await getPickSetById(pickSetId, pool.id);
  if (!pickSet || pickSet.participant_id !== session.participantId) {
    return redirect(`/${poolSlug}/my-picks`) as never;
  }

  const knockoutOpen = isKnockoutPhaseOpen(typedPool);

  const [matches, teams, existingPicks] = await Promise.all([
    getMatches(typedPool),
    getTeams(typedPool),
    getKnockoutPicks(pickSetId),
  ]);

  const knockoutMatches = matches
    .filter((m) => m.phase !== "group")
    .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));

  // Existing picks as matchId → teamId
  const picksMap: Record<string, string> = {};
  for (const pick of existingPicks) {
    picksMap[pick.match_id] = pick.picked_team_id;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-display font-bold">{pickSet.name}</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Knockout Bracket Picks
          {!knockoutOpen && (
            <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
              {pool.knockout_open_at ? "Locked" : "Not open"}
            </span>
          )}
        </p>
      </div>

      <BracketPicker
        matches={knockoutMatches}
        teams={teams}
        existingPicks={picksMap}
        pickSetId={pickSetId}
        pool={typedPool}
        isLocked={!knockoutOpen}
      />
    </div>
  );
}
