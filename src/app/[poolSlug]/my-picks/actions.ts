"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logPlayerAction, AuditAction, AuditEntity } from "@/lib/audit";
import {
  countPickSets,
  createPickSet,
  renamePickSet,
  upsertGroupPicks,
  upsertKnockoutPicks,
  getGroupPicks,
} from "@/lib/picks/queries";
import { isGroupPhaseOpen, isKnockoutPhaseOpen, canCreatePickSet } from "@/lib/picks/validation";
import type { Pool, PickValue } from "@/types/database";

export type PickActionResult = {
  success: boolean;
  error?: string;
  message?: string;
};

// ---- Create Pick Set ----

export async function createPickSetAction(
  _prev: PickActionResult,
  formData: FormData
): Promise<PickActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const name = (formData.get("name") as string)?.trim();

  if (!name || name.length < 1 || name.length > 50) {
    return { success: false, error: "Pick set name must be 1–50 characters." };
  }

  const session = await getPoolSession(poolId, poolSlug);
  if (!session) {
    return { success: false, error: "Not authenticated." };
  }

  // Check pool limit
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("max_pick_sets_per_player")
    .eq("id", poolId)
    .single();

  if (!pool) return { success: false, error: "Pool not found." };

  const currentCount = await countPickSets(poolId, session.participantId);
  if (!canCreatePickSet(currentCount, pool.max_pick_sets_per_player)) {
    return {
      success: false,
      error: `You've reached the maximum of ${pool.max_pick_sets_per_player} pick sets for this pool.`,
    };
  }

  const pickSet = await createPickSet(poolId, session.participantId, name);

  await logPlayerAction(
    session,
    AuditAction.CREATE_PICK_SET,
    AuditEntity.PICK_SET,
    pickSet.id,
    null,
    { name: pickSet.name }
  );

  revalidatePath(`/${poolSlug}/my-picks`);
  redirect(`/${poolSlug}/my-picks/${pickSet.id}`);
}

// ---- Rename Pick Set ----

export async function renamePickSetAction(
  _prev: PickActionResult,
  formData: FormData
): Promise<PickActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const pickSetId = formData.get("pickSetId") as string;
  const newName = (formData.get("name") as string)?.trim();

  if (!newName || newName.length < 1 || newName.length > 50) {
    return { success: false, error: "Name must be 1–50 characters." };
  }

  const session = await getPoolSession(poolId, poolSlug);
  if (!session) return { success: false, error: "Not authenticated." };

  // Verify ownership
  const { data: pickSet } = await supabaseAdmin
    .from("pick_sets")
    .select("name, participant_id")
    .eq("id", pickSetId)
    .eq("pool_id", poolId)
    .single();

  if (!pickSet || pickSet.participant_id !== session.participantId) {
    return { success: false, error: "Pick set not found." };
  }

  await renamePickSet(pickSetId, newName);

  await logPlayerAction(
    session,
    AuditAction.RENAME_PICK_SET,
    AuditEntity.PICK_SET,
    pickSetId,
    { name: pickSet.name },
    { name: newName }
  );

  revalidatePath(`/${poolSlug}/my-picks`);
  return { success: true, message: "Renamed." };
}

// ---- Submit Group Picks ----

export async function submitGroupPicksAction(
  _prev: PickActionResult,
  formData: FormData
): Promise<PickActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const pickSetId = formData.get("pickSetId") as string;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session) return { success: false, error: "Not authenticated." };

  // Verify pool lock
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();

  if (!pool) return { success: false, error: "Pool not found." };
  if (!isGroupPhaseOpen(pool as Pool)) {
    return { success: false, error: "Group phase picks are locked." };
  }

  // Verify pick set ownership
  const { data: pickSet } = await supabaseAdmin
    .from("pick_sets")
    .select("participant_id")
    .eq("id", pickSetId)
    .eq("pool_id", poolId)
    .single();

  if (!pickSet || pickSet.participant_id !== session.participantId) {
    return { success: false, error: "Pick set not found." };
  }

  // Get existing picks for audit comparison
  const existingPicks = await getGroupPicks(pickSetId);
  const existingMap = new Map(existingPicks.map((p) => [p.match_id, p.pick]));

  // Parse picks from form data
  // Form sends: pick_{matchId} = "home" | "draw" | "away"
  const picks: { match_id: string; pick: PickValue }[] = [];
  const validPicks = ["home", "draw", "away"];

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("pick_") && typeof value === "string" && validPicks.includes(value)) {
      const matchId = key.replace("pick_", "");
      picks.push({ match_id: matchId, pick: value as PickValue });
    }
  }

  if (picks.length === 0) {
    return { success: false, error: "No picks submitted." };
  }

  await upsertGroupPicks(pickSetId, picks);

  // Build enriched audit log data: "Group Phase | Game 2 | CAN" instead of raw IDs
  const matchIds = picks.map((p) => p.match_id);
  const { data: matchDetails } = await supabaseAdmin
    .from("matches")
    .select("id, match_number, phase, home_team_id, away_team_id")
    .in("id", matchIds);

  // Get all team short codes for lookups
  const teamIds = new Set<string>();
  for (const m of matchDetails ?? []) {
    if (m.home_team_id) teamIds.add(m.home_team_id);
    if (m.away_team_id) teamIds.add(m.away_team_id);
  }
  const { data: teamDetails } = await supabaseAdmin
    .from("teams")
    .select("id, short_code")
    .in("id", [...teamIds]);
  const teamCodeMap = new Map((teamDetails ?? []).map((t) => [t.id, t.short_code]));

  const phaseLabels: Record<string, string> = {
    group: "Group Phase", r32: "Round of 32", r16: "Round of 16",
    qf: "Quarterfinals", sf: "Semifinals", final: "Final",
    consolation: "Consolation",
  };

  const matchLookup = new Map((matchDetails ?? []).map((m) => [m.id, m]));
  const enrichedPicks: Record<string, string> = {};
  for (const p of picks) {
    const m = matchLookup.get(p.match_id);
    if (m) {
      const phase = phaseLabels[m.phase] ?? m.phase;
      let selection: string = p.pick;
      if (p.pick === "home" && m.home_team_id) {
        selection = teamCodeMap.get(m.home_team_id) ?? "Home";
      } else if (p.pick === "away" && m.away_team_id) {
        selection = teamCodeMap.get(m.away_team_id) ?? "Away";
      } else if (p.pick === "draw") {
        selection = "Draw";
      }
      enrichedPicks[`${phase} | Game ${m.match_number}`] = selection;
    }
  }

  const isFirstTime = existingPicks.length === 0;

  await logPlayerAction(
    session,
    isFirstTime ? AuditAction.SUBMIT_GROUP_PICKS : AuditAction.EDIT_GROUP_PICK,
    AuditEntity.GROUP_PICK,
    pickSetId,
    null,
    enrichedPicks
  );

  revalidatePath(`/${poolSlug}/my-picks/${pickSetId}`);
  return {
    success: true,
    message: `${picks.length} picks saved successfully.`,
  };
}

// ---- Submit Knockout Picks ----

export async function submitKnockoutPicksAction(
  _prev: PickActionResult,
  formData: FormData
): Promise<PickActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const pickSetId = formData.get("pickSetId") as string;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session) return { success: false, error: "Not authenticated." };

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("id", poolId)
    .single();

  if (!pool) return { success: false, error: "Pool not found." };
  if (!isKnockoutPhaseOpen(pool as Pool)) {
    return { success: false, error: "Knockout picks are not open yet or are locked." };
  }

  // Verify ownership
  const { data: pickSet } = await supabaseAdmin
    .from("pick_sets")
    .select("participant_id")
    .eq("id", pickSetId)
    .eq("pool_id", poolId)
    .single();

  if (!pickSet || pickSet.participant_id !== session.participantId) {
    return { success: false, error: "Pick set not found." };
  }

  // Parse picks: knockout_{matchId} = teamId
  const picks: { match_id: string; picked_team_id: string }[] = [];

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("knockout_") && typeof value === "string" && value) {
      const matchId = key.replace("knockout_", "");
      picks.push({ match_id: matchId, picked_team_id: value });
    }
  }

  if (picks.length === 0) {
    return { success: false, error: "No picks submitted." };
  }

  await upsertKnockoutPicks(pickSetId, picks);

  // Build enriched audit log: "Round of 32 | Game 73 | BRA"
  const koMatchIds = picks.map((p) => p.match_id);
  const koTeamIds = [...new Set(picks.map((p) => p.picked_team_id))];

  const { data: koMatchDetails } = await supabaseAdmin
    .from("matches")
    .select("id, match_number, phase")
    .in("id", koMatchIds);

  const { data: koTeamDetails } = await supabaseAdmin
    .from("teams")
    .select("id, short_code")
    .in("id", koTeamIds);

  const koTeamCodeMap = new Map((koTeamDetails ?? []).map((t) => [t.id, t.short_code]));
  const koMatchLookup = new Map((koMatchDetails ?? []).map((m) => [m.id, m]));

  const koPhaseLabels: Record<string, string> = {
    group: "Group Phase", r32: "Round of 32", r16: "Round of 16",
    qf: "Quarterfinals", sf: "Semifinals", final: "Final",
    consolation: "Consolation",
  };

  const enrichedKoPicks: Record<string, string> = {};
  for (const p of picks) {
    const m = koMatchLookup.get(p.match_id);
    const teamCode = koTeamCodeMap.get(p.picked_team_id) ?? p.picked_team_id;
    if (m) {
      const phase = koPhaseLabels[m.phase] ?? m.phase;
      enrichedKoPicks[`${phase} | Game ${m.match_number}`] = teamCode;
    }
  }

  await logPlayerAction(
    session,
    AuditAction.SUBMIT_KNOCKOUT_BRACKET,
    AuditEntity.KNOCKOUT_PICK,
    pickSetId,
    null,
    enrichedKoPicks
  );

  revalidatePath(`/${poolSlug}/my-picks/${pickSetId}`);
  return {
    success: true,
    message: `${picks.length} knockout picks saved.`,
  };
}
