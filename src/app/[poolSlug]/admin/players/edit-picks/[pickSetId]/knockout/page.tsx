import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { getPickSetById, getKnockoutPicks } from "@/lib/picks/queries";
import { getMatches, getTeams } from "@/lib/tournament/queries";
import { isKnockoutPhaseOpen } from "@/lib/picks/validation";
import type { Pool, Participant } from "@/types/database";
import { BracketPicker } from "@/app/[poolSlug]/my-picks/[pickSetId]/knockout/bracket-picker";
import { AdminEditConfirmation } from "../../admin-edit-confirmation";
import { adminEditKnockoutPicksAction } from "../../../edit-picks-actions";

interface PageProps {
  params: Promise<{ poolSlug: string; pickSetId: string }>;
}

/**
 * Admin → Players → Edit Picks → Knockout.
 *
 * Mirrors /my-picks/[pickSetId]/knockout but with admin auth and the
 * admin-side server action. Same BracketPicker component is reused.
 */
export default async function AdminEditKnockoutPicksPage({
  params,
}: PageProps) {
  const { poolSlug, pickSetId } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();
  if (!pool) notFound();
  const typedPool = pool as Pool;

  const session = await requirePoolAuth(pool.id, pool.slug, "admin");

  const pickSet = await getPickSetById(pickSetId, pool.id);
  if (!pickSet) {
    redirect(`/${poolSlug}/admin/players`);
  }

  const { data: targetParticipant } = await supabaseAdmin
    .from("participants")
    .select("id, email, display_name")
    .eq("id", pickSet.participant_id)
    .single();
  if (!targetParticipant) {
    redirect(`/${poolSlug}/admin/players`);
  }
  const target = targetParticipant as Pick<
    Participant,
    "id" | "email" | "display_name"
  >;

  const knockoutOpen = isKnockoutPhaseOpen(typedPool);

  const [matches, teams, existingPicks] = await Promise.all([
    getMatches(typedPool),
    getTeams(typedPool),
    getKnockoutPicks(pickSetId),
  ]);

  // Knockout-only matches; sort by match number for the bracket layout.
  const knockoutMatches = matches
    .filter((m) => m.phase !== "group")
    .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));

  const picksMap: Record<string, string> = {};
  for (const pick of existingPicks) {
    picksMap[pick.match_id] = pick.picked_team_id;
  }

  const isOwnPickSet = target.id === session.participantId;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/${poolSlug}/admin/players`}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
        >
          ← Back to Players
        </Link>
        <h1 className="text-xl font-display font-bold mt-2">
          {pickSet.name}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Knockout Bracket Picks
          {!knockoutOpen && (
            <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
              {pool.knockout_open_at ? "Locked" : "Not open"}
            </span>
          )}
        </p>
      </div>

      <AdminEditConfirmation
        targetParticipantDisplayName={target.display_name}
        targetParticipantEmail={target.email}
        pickSetName={pickSet.name}
        isOwnPickSet={isOwnPickSet}
        cancelHref={`/${poolSlug}/admin/players`}
      >
        <BracketPicker
          matches={knockoutMatches}
          teams={teams}
          existingPicks={picksMap}
          pickSetId={pickSetId}
          pool={typedPool}
          isLocked={!knockoutOpen}
          overrideAction={adminEditKnockoutPicksAction}
        />
      </AdminEditConfirmation>
    </div>
  );
}
