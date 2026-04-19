import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolMembers } from "@/lib/pool/queries";
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

  const members = await getPoolMembers(pool.id);

  // Get pick sets for all members
  const { data: pickSets } = await supabaseAdmin
    .from("pick_sets")
    .select("*")
    .eq("pool_id", pool.id)
    .eq("is_active", true)
    .order("created_at");

  // Group pick sets by participant
  const pickSetsByParticipant = new Map<string, typeof pickSets>();
  for (const ps of pickSets ?? []) {
    const existing = pickSetsByParticipant.get(ps.participant_id) ?? [];
    existing.push(ps);
    pickSetsByParticipant.set(ps.participant_id, existing);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        {members.length} member{members.length !== 1 ? "s" : ""} in this pool
      </p>

      <PlayerList
        members={members}
        pickSetsByParticipant={Object.fromEntries(pickSetsByParticipant)}
        poolId={pool.id}
        poolSlug={poolSlug}
      />
    </div>
  );
}
