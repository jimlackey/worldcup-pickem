import { supabaseAdmin } from "@/lib/supabase/server";
import type { Pool, PoolMembership, Participant } from "@/types/database";

/**
 * Fetch a pool by slug.
 */
export async function getPoolBySlug(slug: string): Promise<Pool | null> {
  const { data } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  return data as Pool | null;
}

/**
 * Fetch a participant's membership in a pool.
 */
export async function getPoolMembership(
  poolId: string,
  participantId: string
): Promise<PoolMembership | null> {
  const { data } = await supabaseAdmin
    .from("pool_memberships")
    .select("*")
    .eq("pool_id", poolId)
    .eq("participant_id", participantId)
    .eq("is_active", true)
    .single();

  return data as PoolMembership | null;
}

/**
 * Check if an email is whitelisted for a pool.
 */
export async function isEmailWhitelisted(
  poolId: string,
  email: string
): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("pool_whitelist")
    .select("*", { count: "exact", head: true })
    .eq("pool_id", poolId)
    .eq("email", email.toLowerCase());

  return (count ?? 0) > 0;
}

/**
 * Find or create a participant by email.
 * Returns the participant record.
 */
export async function findOrCreateParticipant(
  email: string,
  displayName?: string
): Promise<Participant> {
  const normalizedEmail = email.toLowerCase();

  // Try to find existing
  const { data: existing } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (existing) return existing as Participant;

  // Create new
  const { data: created, error } = await supabaseAdmin
    .from("participants")
    .insert({
      email: normalizedEmail,
      display_name: displayName ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create participant: ${error.message}`);
  return created as Participant;
}

/**
 * Find or create a pool membership.
 * New members get "player" role and is_approved=true (whitelist is the gate).
 */
export async function findOrCreateMembership(
  poolId: string,
  participantId: string
): Promise<PoolMembership> {
  const { data: existing } = await supabaseAdmin
    .from("pool_memberships")
    .select("*")
    .eq("pool_id", poolId)
    .eq("participant_id", participantId)
    .single();

  if (existing) return existing as PoolMembership;

  const { data: created, error } = await supabaseAdmin
    .from("pool_memberships")
    .insert({
      pool_id: poolId,
      participant_id: participantId,
      role: "player",
      is_approved: true,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create membership: ${error.message}`);
  return created as PoolMembership;
}

/**
 * Get all members of a pool with their participant details.
 */
export async function getPoolMembers(
  poolId: string
): Promise<(PoolMembership & { participant: Participant })[]> {
  const { data } = await supabaseAdmin
    .from("pool_memberships")
    .select("*, participant:participants(*)")
    .eq("pool_id", poolId)
    .eq("is_active", true)
    .order("created_at");

  return (data ?? []) as (PoolMembership & { participant: Participant })[];
}

/**
 * Get all whitelisted emails for a pool.
 */
export async function getPoolWhitelist(
  poolId: string
): Promise<{ id: string; email: string; added_at: string }[]> {
  const { data } = await supabaseAdmin
    .from("pool_whitelist")
    .select("id, email, added_at")
    .eq("pool_id", poolId)
    .order("added_at");

  return data ?? [];
}

/**
 * Add an email to a pool's whitelist.
 */
export async function addToWhitelist(
  poolId: string,
  email: string
): Promise<void> {
  await supabaseAdmin
    .from("pool_whitelist")
    .upsert(
      { pool_id: poolId, email: email.toLowerCase() },
      { onConflict: "pool_id,email" }
    );
}

/**
 * Remove an email from a pool's whitelist.
 */
export async function removeFromWhitelist(
  poolId: string,
  email: string
): Promise<void> {
  await supabaseAdmin
    .from("pool_whitelist")
    .delete()
    .eq("pool_id", poolId)
    .eq("email", email.toLowerCase());
}
