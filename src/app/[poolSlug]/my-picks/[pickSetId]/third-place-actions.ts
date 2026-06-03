"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logPlayerAction, AuditAction, AuditEntity } from "@/lib/audit";
import { isGroupPhaseOpen } from "@/lib/picks/validation";
import {
  setThirdPlacePick,
  clearThirdPlacePick,
} from "@/lib/third-place/queries";
import type { Pool } from "@/types/database";

/**
 * Player-side server actions for the optional Pre-Tournament 3rd-Place
 * pick (migration 024).
 *
 * Two actions instead of one because "save a pick" and "clear my pick"
 * are semantically distinct events worth keeping separate in the audit
 * log. Both share the same authorization shape:
 *
 *   1. Session must belong to the pool.
 *   2. The pick set must belong to the session's participant (no
 *      saving someone else's pick from the player surface).
 *   3. The pool must have consolation_mode = 'preseason_pick'.
 *   4. The group phase must still be open (same gate as group picks).
 *
 * Admin override (editing/removing someone else's pre-season pick)
 * lives separately in
 * src/app/[poolSlug]/admin/players/edit-picks-actions.ts
 * (adminClearThirdPlacePickAction), mirroring the group/knockout admin
 * edit pattern. Unlike these player actions, the admin removal has no
 * group-phase gate — an admin can remove a 3rd-place pick at any time.
 */

export type ThirdPlacePickResult = {
  success: boolean;
  message?: string;
  error?: string;
};

const baseSchema = z.object({
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
  pickSetId: z.string().uuid(),
});

const setSchema = baseSchema.extend({
  teamId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Shared auth + gate check
// ---------------------------------------------------------------------------

async function requirePlayerAndPickSetOpen(
  poolId: string,
  poolSlug: string,
  pickSetId: string
): Promise<
  | { ok: true; pool: Pool; session: NonNullable<Awaited<ReturnType<typeof getPoolSession>>>; pickSetName: string }
  | { ok: false; error: string }
> {
  const session = await getPoolSession(poolId, poolSlug);
  if (!session) {
    return { ok: false, error: "Not authenticated." };
  }

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();

  if (!pool) {
    return { ok: false, error: "Pool not found." };
  }
  const typedPool = pool as Pool;

  if (typedPool.consolation_mode !== "preseason_pick") {
    return {
      ok: false,
      error: "Pre-tournament 3rd-place pick is not enabled for this pool.",
    };
  }

  if (!isGroupPhaseOpen(typedPool)) {
    return { ok: false, error: "Group phase picks are locked." };
  }

  // Ownership check. We re-fetch the pick set rather than trusting the
  // session because the URL path that brought us here may not have
  // been gated on ownership (e.g. a stale tab).
  const { data: pickSet } = await supabaseAdmin
    .from("pick_sets")
    .select("participant_id, name, is_active, pool_id")
    .eq("id", pickSetId)
    .maybeSingle();

  if (
    !pickSet ||
    pickSet.pool_id !== poolId ||
    !pickSet.is_active ||
    pickSet.participant_id !== session.participantId
  ) {
    return { ok: false, error: "Pick set not found." };
  }

  return {
    ok: true,
    pool: typedPool,
    session,
    pickSetName: pickSet.name as string,
  };
}

// ---------------------------------------------------------------------------
// Save / update the 3rd-place pick
// ---------------------------------------------------------------------------

export async function submitThirdPlacePickAction(
  _prev: ThirdPlacePickResult,
  formData: FormData
): Promise<ThirdPlacePickResult> {
  const parsed = setSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    pickSetId: formData.get("pickSetId"),
    teamId: formData.get("teamId"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolId, poolSlug, pickSetId, teamId } = parsed.data;

  const auth = await requirePlayerAndPickSetOpen(poolId, poolSlug, pickSetId);
  if (!auth.ok) return { success: false, error: auth.error };

  // Validate the team belongs to the pool's tournament data so we
  // can't end up storing an off-tournament team_id via a forged form
  // POST. Demo pools have pool-scoped teams; real pools share the
  // global ones. We accept whichever the pool's tournament filter
  // would return.
  const poolFilter = auth.pool.is_demo ? auth.pool.id : null;
  const teamQuery = supabaseAdmin
    .from("teams")
    .select("id, short_code, name")
    .eq("id", teamId)
    .eq("tournament_id", auth.pool.tournament_id);
  const { data: team } = poolFilter
    ? await teamQuery.eq("pool_id", poolFilter).maybeSingle()
    : await teamQuery.is("pool_id", null).maybeSingle();

  if (!team) {
    return { success: false, error: "That team is not part of this pool." };
  }

  let previous: { previousTeamId: string | null };
  try {
    previous = await setThirdPlacePick(pickSetId, teamId);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save pick.",
    };
  }

  // No-op short circuit on the audit-log side. The DB write still
  // happens (touches updated_at) but we don't pollute the audit log
  // with rows whose old/new values are identical.
  if (previous.previousTeamId === teamId) {
    revalidatePath(`/${poolSlug}/my-picks/${pickSetId}`);
    revalidatePath(`/${poolSlug}/my-picks`);
    return { success: true, message: "Saved." };
  }

  // Resolve the previous team's short_code for the audit log so the
  // diff reads "USA → BRA" rather than two UUIDs.
  let previousCode: string | null = null;
  if (previous.previousTeamId) {
    const { data: prevTeam } = await supabaseAdmin
      .from("teams")
      .select("short_code")
      .eq("id", previous.previousTeamId)
      .maybeSingle();
    previousCode = (prevTeam?.short_code as string | undefined) ?? null;
  }

  await logPlayerAction(
    auth.session,
    AuditAction.SUBMIT_THIRD_PLACE_PICK,
    AuditEntity.THIRD_PLACE_PICK,
    pickSetId,
    previous.previousTeamId
      ? { picked_team: previousCode ?? previous.previousTeamId }
      : null,
    { picked_team: team.short_code as string }
  );

  revalidatePath(`/${poolSlug}/my-picks/${pickSetId}`);
  revalidatePath(`/${poolSlug}/my-picks`);
  return { success: true, message: "3rd-place pick saved." };
}

// ---------------------------------------------------------------------------
// Clear the 3rd-place pick
// ---------------------------------------------------------------------------

export async function clearThirdPlacePickAction(
  _prev: ThirdPlacePickResult,
  formData: FormData
): Promise<ThirdPlacePickResult> {
  const parsed = baseSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    pickSetId: formData.get("pickSetId"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolId, poolSlug, pickSetId } = parsed.data;

  const auth = await requirePlayerAndPickSetOpen(poolId, poolSlug, pickSetId);
  if (!auth.ok) return { success: false, error: auth.error };

  let previous: { previousTeamId: string | null };
  try {
    previous = await clearThirdPlacePick(pickSetId);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to clear pick.",
    };
  }

  // Nothing to clear → quiet no-op, no audit entry.
  if (previous.previousTeamId === null) {
    revalidatePath(`/${poolSlug}/my-picks/${pickSetId}`);
    revalidatePath(`/${poolSlug}/my-picks`);
    return { success: true, message: "No pick to clear." };
  }

  // Capture the cleared team's short_code for the audit log.
  let previousCode: string | null = null;
  const { data: prevTeam } = await supabaseAdmin
    .from("teams")
    .select("short_code")
    .eq("id", previous.previousTeamId)
    .maybeSingle();
  previousCode = (prevTeam?.short_code as string | undefined) ?? null;

  await logPlayerAction(
    auth.session,
    AuditAction.CLEAR_THIRD_PLACE_PICK,
    AuditEntity.THIRD_PLACE_PICK,
    pickSetId,
    { picked_team: previousCode ?? previous.previousTeamId },
    null
  );

  revalidatePath(`/${poolSlug}/my-picks/${pickSetId}`);
  revalidatePath(`/${poolSlug}/my-picks`);
  return { success: true, message: "3rd-place pick cleared." };
}
