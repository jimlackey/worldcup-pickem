"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import {
  getGroupPicks,
  getKnockoutPicks,
  upsertGroupPicks,
  upsertKnockoutPicks,
} from "@/lib/picks/queries";
import {
  isGroupPhaseOpen,
  isKnockoutPhaseOpen,
} from "@/lib/picks/validation";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import type { Pool, PickValue } from "@/types/database";

/**
 * Admin pick-edit server actions.
 *
 * These are the admin-side counterparts to the player actions in
 * /my-picks/actions.ts. The shape is intentionally similar — same
 * form payload, same upsert helpers, same enrichment pattern for the
 * audit log — but with three meaningful differences:
 *
 *   1. Authorization. The session must have role === "admin". The
 *      ownership check is REMOVED so an admin can edit any pick set
 *      in the pool. Phase locks (group / knockout open) still apply.
 *
 *   2. Audit constants. We log ADMIN_EDIT_GROUP_PICKS /
 *      ADMIN_EDIT_KNOCKOUT_PICKS rather than the player-side
 *      SUBMIT_GROUP_PICKS / EDIT_GROUP_PICK / SUBMIT_KNOCKOUT_BRACKET.
 *      Same audit table, different action verb — keeps the player
 *      audit history clean of admin overrides and makes it trivial
 *      to filter "show me everything admins changed" in the audit log
 *      UI.
 *
 *   3. Audit payload. We include the target participant's display
 *      name in the new_value blob so a reader doesn't need an extra
 *      join to know whose picks were modified. The actor on the audit
 *      row is the admin (logAdminAction takes the session); the
 *      target is the pick set, and the target's owner is recorded
 *      inline.
 *
 * SECURITY:
 *   - Session role is verified via getPoolSession + an explicit
 *     `role === "admin"` check. requirePoolAuth would also work but
 *     it throws on failure — we want to return a structured error
 *     to the client form so it can surface it inline.
 *   - The pick_set_id passed in is verified to belong to THIS pool.
 *     Without that, a malicious admin of pool A could submit picks
 *     against a pick set in pool B.
 *   - Match IDs in the form payload aren't validated against the
 *     pool's match set — the upsert helpers enforce FK constraints
 *     so an invalid match_id will cause the action to fail with a
 *     DB error rather than silently writing garbage.
 */

export type AdminPickEditResult = {
  success: boolean;
  message?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Shared auth helper
// ---------------------------------------------------------------------------

const baseSchema = z.object({
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
  pickSetId: z.string().uuid(),
});

async function requireAdminAndPickSet(
  poolId: string,
  poolSlug: string,
  pickSetId: string
): Promise<
  | {
      ok: true;
      session: NonNullable<Awaited<ReturnType<typeof getPoolSession>>>;
      pool: Pool;
      pickSet: {
        id: string;
        participant_id: string;
        name: string;
        participant: { email: string; display_name: string | null };
      };
    }
  | { ok: false; error: string }
> {
  const session = await getPoolSession(poolId, poolSlug);
  if (!session) return { ok: false, error: "Not authenticated." };
  if (session.role !== "admin") {
    return { ok: false, error: "Admin role required." };
  }

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();
  if (!pool) return { ok: false, error: "Pool not found." };

  // Verify pick set is part of THIS pool (cross-pool guard) and pull
  // the owner's name+email for the audit payload.
  const { data: pickSetRow } = await supabaseAdmin
    .from("pick_sets")
    .select(
      "id, name, participant_id, pool_id, is_active, participant:participants(email, display_name)"
    )
    .eq("id", pickSetId)
    .maybeSingle();

  if (!pickSetRow || pickSetRow.pool_id !== poolId || !pickSetRow.is_active) {
    return { ok: false, error: "Pick set not found in this pool." };
  }

  // Defensive participant unwrap — supabase-js types nested-select
  // relations as arrays but returns a single object at runtime for
  // to-one FKs. Match the pattern used in payments/queries.ts.
  const rawParticipant = (
    pickSetRow as { participant: unknown }
  ).participant;
  const participantObj = Array.isArray(rawParticipant)
    ? (rawParticipant[0] as
        | { email: string; display_name: string | null }
        | undefined)
    : (rawParticipant as
        | { email: string; display_name: string | null }
        | null
        | undefined);

  return {
    ok: true,
    session,
    pool: pool as Pool,
    pickSet: {
      id: pickSetRow.id,
      participant_id: pickSetRow.participant_id,
      name: pickSetRow.name,
      participant: {
        email: participantObj?.email ?? "",
        display_name: participantObj?.display_name ?? null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Phase-label dictionary (shared between the two enrichment helpers)
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<string, string> = {
  group: "Group Phase",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarterfinals",
  sf: "Semifinals",
  final: "Final",
  consolation: "Consolation",
};

// ---------------------------------------------------------------------------
// Group pick edit
// ---------------------------------------------------------------------------

export async function adminEditGroupPicksAction(
  _prev: AdminPickEditResult,
  formData: FormData
): Promise<AdminPickEditResult> {
  const parsed = baseSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    pickSetId: formData.get("pickSetId"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolId, poolSlug, pickSetId } = parsed.data;

  const auth = await requireAdminAndPickSet(poolId, poolSlug, pickSetId);
  if (!auth.ok) return { success: false, error: auth.error };

  if (!isGroupPhaseOpen(auth.pool)) {
    return { success: false, error: "Group phase picks are locked." };
  }

  // Parse picks from form data. Same wire format as the player action.
  const validPicks = ["home", "draw", "away"];
  const picks: { match_id: string; pick: PickValue }[] = [];
  for (const [key, value] of formData.entries()) {
    if (
      key.startsWith("pick_") &&
      typeof value === "string" &&
      validPicks.includes(value)
    ) {
      picks.push({
        match_id: key.replace("pick_", ""),
        pick: value as PickValue,
      });
    }
  }

  if (picks.length === 0) {
    return { success: false, error: "No picks submitted." };
  }

  // Snapshot existing picks for the audit diff. The diff is what we
  // record in old_value/new_value — only entries that actually
  // changed, not the whole picks list. Saves a lot of audit noise
  // when an admin opens the page and saves without changing anything.
  const existingPicks = await getGroupPicks(pickSetId);
  const existingByMatchId = new Map(
    existingPicks.map((p) => [p.match_id, p.pick])
  );

  await upsertGroupPicks(pickSetId, picks);

  // Enrich for audit log: "Group Phase | Game 2 | CAN" instead of
  // raw UUIDs. Mirrors the player action's enrichment so audit log
  // entries from both code paths read the same way.
  const matchIds = picks.map((p) => p.match_id);
  const { data: matchDetails } = await supabaseAdmin
    .from("matches")
    .select("id, match_number, phase, home_team_id, away_team_id")
    .in("id", matchIds);

  const teamIds = new Set<string>();
  for (const m of matchDetails ?? []) {
    if (m.home_team_id) teamIds.add(m.home_team_id);
    if (m.away_team_id) teamIds.add(m.away_team_id);
  }
  const { data: teamDetails } = await supabaseAdmin
    .from("teams")
    .select("id, short_code")
    .in("id", [...teamIds]);
  const teamCodeMap = new Map(
    (teamDetails ?? []).map((t) => [t.id, t.short_code])
  );
  const matchLookup = new Map(
    (matchDetails ?? []).map((m) => [m.id, m])
  );

  // Build the diff: only matches where the new pick differs from the
  // existing pick (or there was no existing pick).
  const changedPicks: Record<string, { from: string; to: string }> = {};
  for (const p of picks) {
    const prev = existingByMatchId.get(p.match_id);
    if (prev === p.pick) continue;
    const m = matchLookup.get(p.match_id);
    if (!m) continue;
    const phase = PHASE_LABELS[m.phase] ?? m.phase;
    const key = `${phase} | Game ${m.match_number}`;
    changedPicks[key] = {
      from: formatGroupPick(prev ?? null, m, teamCodeMap),
      to: formatGroupPick(p.pick, m, teamCodeMap),
    };
  }

  const changedCount = Object.keys(changedPicks).length;

  if (changedCount > 0) {
    await logAdminAction(
      auth.session,
      AuditAction.ADMIN_EDIT_GROUP_PICKS,
      AuditEntity.GROUP_PICK,
      pickSetId,
      null,
      {
        // Owner identity goes in the audit row so a reader doesn't
        // need to chase joins.
        target_pick_set_name: auth.pickSet.name,
        target_participant_email: auth.pickSet.participant.email,
        target_participant_display_name:
          auth.pickSet.participant.display_name ?? null,
        changes: changedPicks,
      }
    );
  }

  revalidatePath(`/${poolSlug}/admin/players`);
  revalidatePath(
    `/${poolSlug}/admin/players/edit-picks/${pickSetId}`
  );

  return {
    success: true,
    message:
      changedCount === 0
        ? "No changes to save."
        : `${changedCount} pick${changedCount === 1 ? "" : "s"} updated.`,
  };
}

function formatGroupPick(
  pick: string | null,
  match: { home_team_id: string | null; away_team_id: string | null },
  teamCodeMap: Map<string, string>
): string {
  if (pick === null) return "—";
  if (pick === "draw") return "Draw";
  if (pick === "home")
    return match.home_team_id
      ? (teamCodeMap.get(match.home_team_id) ?? "Home")
      : "Home";
  if (pick === "away")
    return match.away_team_id
      ? (teamCodeMap.get(match.away_team_id) ?? "Away")
      : "Away";
  return pick;
}

// ---------------------------------------------------------------------------
// Knockout pick edit
// ---------------------------------------------------------------------------

export async function adminEditKnockoutPicksAction(
  _prev: AdminPickEditResult,
  formData: FormData
): Promise<AdminPickEditResult> {
  const parsed = baseSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    pickSetId: formData.get("pickSetId"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolId, poolSlug, pickSetId } = parsed.data;

  const auth = await requireAdminAndPickSet(poolId, poolSlug, pickSetId);
  if (!auth.ok) return { success: false, error: auth.error };

  if (!isKnockoutPhaseOpen(auth.pool)) {
    return {
      success: false,
      error: "Knockout picks are not open yet or are locked.",
    };
  }

  // Parse picks: knockout_{matchId} = teamId
  const picks: { match_id: string; picked_team_id: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("knockout_") && typeof value === "string" && value) {
      picks.push({
        match_id: key.replace("knockout_", ""),
        picked_team_id: value,
      });
    }
  }

  if (picks.length === 0) {
    return { success: false, error: "No picks submitted." };
  }

  // Diff snapshot — same approach as the group action above.
  const existingPicks = await getKnockoutPicks(pickSetId);
  const existingByMatchId = new Map(
    existingPicks.map((p) => [p.match_id, p.picked_team_id])
  );

  await upsertKnockoutPicks(pickSetId, picks);

  // Enrich: "Round of 32 | Game 73 | BRA"
  const matchIds = picks.map((p) => p.match_id);
  const teamIds = [
    ...new Set(
      [...picks.map((p) => p.picked_team_id), ...existingByMatchId.values()]
    ),
  ];

  const { data: matchDetails } = await supabaseAdmin
    .from("matches")
    .select("id, match_number, phase")
    .in("id", matchIds);
  const { data: teamDetails } = await supabaseAdmin
    .from("teams")
    .select("id, short_code")
    .in("id", teamIds);

  const teamCodeMap = new Map(
    (teamDetails ?? []).map((t) => [t.id, t.short_code])
  );
  const matchLookup = new Map(
    (matchDetails ?? []).map((m) => [m.id, m])
  );

  const changedPicks: Record<string, { from: string; to: string }> = {};
  for (const p of picks) {
    const prev = existingByMatchId.get(p.match_id);
    if (prev === p.picked_team_id) continue;
    const m = matchLookup.get(p.match_id);
    if (!m) continue;
    const phase = PHASE_LABELS[m.phase] ?? m.phase;
    const key = `${phase} | Game ${m.match_number}`;
    changedPicks[key] = {
      from: prev ? (teamCodeMap.get(prev) ?? "—") : "—",
      to: teamCodeMap.get(p.picked_team_id) ?? p.picked_team_id,
    };
  }

  const changedCount = Object.keys(changedPicks).length;

  if (changedCount > 0) {
    await logAdminAction(
      auth.session,
      AuditAction.ADMIN_EDIT_KNOCKOUT_PICKS,
      AuditEntity.KNOCKOUT_PICK,
      pickSetId,
      null,
      {
        target_pick_set_name: auth.pickSet.name,
        target_participant_email: auth.pickSet.participant.email,
        target_participant_display_name:
          auth.pickSet.participant.display_name ?? null,
        changes: changedPicks,
      }
    );
  }

  revalidatePath(`/${poolSlug}/admin/players`);
  revalidatePath(
    `/${poolSlug}/admin/players/edit-picks/${pickSetId}/knockout`
  );

  return {
    success: true,
    message:
      changedCount === 0
        ? "No changes to save."
        : `${changedCount} pick${changedCount === 1 ? "" : "s"} updated.`,
  };
}
