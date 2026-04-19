import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  PickSet,
  GroupPick,
  KnockoutPick,
  PickValue,
  PickSetWithParticipant,
} from "@/types/database";

// ---- Pick Sets ----

/**
 * Get all pick sets for a participant in a pool.
 */
export async function getParticipantPickSets(
  poolId: string,
  participantId: string
): Promise<PickSet[]> {
  const { data } = await supabaseAdmin
    .from("pick_sets")
    .select("*")
    .eq("pool_id", poolId)
    .eq("participant_id", participantId)
    .eq("is_active", true)
    .order("created_at");

  return (data ?? []) as PickSet[];
}

/**
 * Get all pick sets for a pool (for standings, picks grid).
 */
export async function getAllPickSets(
  poolId: string
): Promise<PickSetWithParticipant[]> {
  const { data } = await supabaseAdmin
    .from("pick_sets")
    .select("*, participant:participants(*)")
    .eq("pool_id", poolId)
    .eq("is_active", true)
    .order("name");

  return (data ?? []) as PickSetWithParticipant[];
}

/**
 * Get a single pick set by ID, verifying pool ownership.
 */
export async function getPickSetById(
  pickSetId: string,
  poolId: string
): Promise<PickSet | null> {
  const { data } = await supabaseAdmin
    .from("pick_sets")
    .select("*")
    .eq("id", pickSetId)
    .eq("pool_id", poolId)
    .eq("is_active", true)
    .single();

  return data as PickSet | null;
}

/**
 * Count pick sets for a participant in a pool (for limit enforcement).
 */
export async function countPickSets(
  poolId: string,
  participantId: string
): Promise<number> {
  const { count } = await supabaseAdmin
    .from("pick_sets")
    .select("*", { count: "exact", head: true })
    .eq("pool_id", poolId)
    .eq("participant_id", participantId)
    .eq("is_active", true);

  return count ?? 0;
}

/**
 * Create a new pick set.
 */
export async function createPickSet(
  poolId: string,
  participantId: string,
  name: string
): Promise<PickSet> {
  const { data, error } = await supabaseAdmin
    .from("pick_sets")
    .insert({
      pool_id: poolId,
      participant_id: participantId,
      name: name.trim(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create pick set: ${error.message}`);
  return data as PickSet;
}

/**
 * Rename a pick set.
 */
export async function renamePickSet(
  pickSetId: string,
  newName: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("pick_sets")
    .update({ name: newName.trim() })
    .eq("id", pickSetId);

  if (error) throw new Error(`Failed to rename pick set: ${error.message}`);
}

// ---- Group Picks ----

/**
 * Get all group picks for a pick set.
 */
export async function getGroupPicks(
  pickSetId: string
): Promise<GroupPick[]> {
  const { data } = await supabaseAdmin
    .from("group_picks")
    .select("*")
    .eq("pick_set_id", pickSetId);

  return (data ?? []) as GroupPick[];
}

/**
 * Get all group picks for all pick sets in a pool (for picks grid).
 */
export async function getAllGroupPicksForPool(
  poolId: string
): Promise<GroupPick[]> {
  const { data } = await supabaseAdmin
    .from("group_picks")
    .select("*, pick_set:pick_sets!inner(pool_id)")
    .eq("pick_set.pool_id", poolId);

  return (data ?? []) as GroupPick[];
}

/**
 * Upsert group picks for a pick set (batch).
 * Each entry: { match_id, pick }
 */
export async function upsertGroupPicks(
  pickSetId: string,
  picks: { match_id: string; pick: PickValue }[]
): Promise<void> {
  const rows = picks.map((p) => ({
    pick_set_id: pickSetId,
    match_id: p.match_id,
    pick: p.pick,
  }));

  const { error } = await supabaseAdmin
    .from("group_picks")
    .upsert(rows, { onConflict: "pick_set_id,match_id" });

  if (error) throw new Error(`Failed to save group picks: ${error.message}`);
}

// ---- Knockout Picks ----

/**
 * Get all knockout picks for a pick set.
 */
export async function getKnockoutPicks(
  pickSetId: string
): Promise<KnockoutPick[]> {
  const { data } = await supabaseAdmin
    .from("knockout_picks")
    .select("*")
    .eq("pick_set_id", pickSetId);

  return (data ?? []) as KnockoutPick[];
}

/**
 * Upsert knockout picks for a pick set (batch).
 */
export async function upsertKnockoutPicks(
  pickSetId: string,
  picks: { match_id: string; picked_team_id: string }[]
): Promise<void> {
  const rows = picks.map((p) => ({
    pick_set_id: pickSetId,
    match_id: p.match_id,
    picked_team_id: p.picked_team_id,
  }));

  const { error } = await supabaseAdmin
    .from("knockout_picks")
    .upsert(rows, { onConflict: "pick_set_id,match_id" });

  if (error)
    throw new Error(`Failed to save knockout picks: ${error.message}`);
}
