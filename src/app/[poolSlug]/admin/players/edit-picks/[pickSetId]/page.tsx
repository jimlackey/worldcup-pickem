import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { getPickSetById, getGroupPicks } from "@/lib/picks/queries";
import { getThirdPlacePick } from "@/lib/third-place/queries";
import { getMatches, getGroups, getTeams } from "@/lib/tournament/queries";
import { isGroupPhaseOpen } from "@/lib/picks/validation";
import type { Pool, Participant } from "@/types/database";
import { GroupPicksForm } from "@/app/[poolSlug]/my-picks/[pickSetId]/group-picks-form";
import { AdminEditConfirmation } from "../admin-edit-confirmation";
import { AdminThirdPlacePicker } from "./admin-third-place-removal";
import { adminEditGroupPicksAction } from "../../edit-picks-actions";

interface PageProps {
  params: Promise<{ poolSlug: string; pickSetId: string }>;
}

/**
 * Admin → Players → Edit Picks (Group Phase).
 *
 * Mirrors /my-picks/[pickSetId] but with admin auth instead of
 * ownership auth. The same GroupPicksForm is reused via the
 * `overrideAction` prop, which redirects writes to the audit-logged
 * admin action.
 *
 * Phase gating: same as the player route — group phase must be open.
 * If it's locked the form renders read-only (existing behaviour of
 * the GroupPicksForm via `isLocked`); we don't block access entirely
 * because an admin might still want to view a player's locked-state
 * picks via this URL.
 */
export default async function AdminEditGroupPicksPage({
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

  // Admin auth — distinct from /my-picks (which only requires player
  // auth). The layout already enforces this for the /admin tree, but
  // we re-check defensively in case this URL is ever hit outside the
  // admin layout's chain (e.g. shared sub-route layouts).
  const session = await requirePoolAuth(pool.id, pool.slug, "admin");

  // Pick set must exist and belong to this pool. We do NOT check
  // ownership — the whole point of this page is to edit on someone
  // else's behalf.
  const pickSet = await getPickSetById(pickSetId, pool.id);
  if (!pickSet) {
    redirect(`/${poolSlug}/admin/players`);
  }

  // Look up the target participant for the banner and the
  // confirmation modal. Separate query because getPickSetById doesn't
  // join participants.
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

  const groupOpen = isGroupPhaseOpen(typedPool);

  const [matches, groups, existingPicks] = await Promise.all([
    getMatches(typedPool, "group"),
    getGroups(typedPool),
    getGroupPicks(pickSetId),
  ]);

  // The pre-tournament 3rd-place pick (if the pool runs that feature),
  // plus the full team list for the admin picker. Admins can set,
  // change, or remove the pick at any time during the tournament, so we
  // fetch both regardless of phase — the picker below is gated only on
  // the feature being enabled. We fetch teams only in preseason_pick
  // mode to avoid an unnecessary query when the feature is off.
  const isPreseasonPick = typedPool.consolation_mode === "preseason_pick";
  const [thirdPlacePick, thirdPlaceTeams] = await Promise.all([
    isPreseasonPick ? getThirdPlacePick(pickSetId) : Promise.resolve(null),
    isPreseasonPick ? getTeams(typedPool) : Promise.resolve([]),
  ]);

  const picksMap: Record<string, string> = {};
  for (const pick of existingPicks) {
    picksMap[pick.match_id] = pick.pick;
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
          Group Phase Picks
          {!groupOpen && (
            <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
              Locked
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
        {isPreseasonPick && (
          <AdminThirdPlacePicker
            poolId={typedPool.id}
            poolSlug={poolSlug}
            pickSetId={pickSetId}
            teams={thirdPlaceTeams}
            initialTeamId={thirdPlacePick?.pickedTeamId ?? null}
          />
        )}
        <GroupPicksForm
          matches={matches}
          groups={groups}
          existingPicks={picksMap}
          pickSetId={pickSetId}
          pool={typedPool}
          isLocked={!groupOpen}
          overrideAction={adminEditGroupPicksAction}
        />
      </AdminEditConfirmation>
    </div>
  );
}
