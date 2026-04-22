import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolMembers } from "@/lib/pool/queries";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { PlayerList } from "./player-list";

interface PlayersPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function PlayersPage({ params }: PlayersPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;

  // Admin layout already gates this, but we need the session for the current
  // participant id so the UI can hide the self-demote button.
  const session = await requirePoolAuth(pool.id, pool.slug, "admin");

  const members = await getPoolMembers(pool.id);

  // Get pick sets for all members
  const { data: pickSets } = await supabaseAdmin
    .from("pick_sets")
    .select("*")
    .eq("pool_id", pool.id)
    .eq("is_active", true)
    .order("created_at");

  // Group pick sets by participant
  const pickSetsByParticipant: Record<string, NonNullable<typeof pickSets>> = {};
  for (const ps of pickSets ?? []) {
    if (!pickSetsByParticipant[ps.participant_id]) {
      pickSetsByParticipant[ps.participant_id] = [];
    }
    pickSetsByParticipant[ps.participant_id].push(ps);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        {members.length} member{members.length !== 1 ? "s" : ""} in this pool
      </p>

      <PlayerList
        members={members}
        pickSetsByParticipant={pickSetsByParticipant}
        poolId={pool.id}
        poolSlug={poolSlug}
        currentParticipantId={session.participantId}
      />
    </div>
  );
}
