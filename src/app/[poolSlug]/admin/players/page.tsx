import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolMembers } from "@/lib/pool/queries";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import { countPicksByPickSet } from "@/lib/picks/pick-counts";
import { getMainPaidByPickSet } from "@/lib/payments/queries";
import type { Pool } from "@/types/database";
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
  const typedPool = pool as Pool;

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

  // Phase flags drive whether the "Edit picks" links on each pick set
  // are clickable. We compute them once here and pass them down so
  // the client component doesn't need to know pool internals.
  //
  // We surface the affordance even when locked (so admins can still
  // VIEW the picks via the edit URL — the picker pages render
  // read-only when isLocked is true), but visually mute it so it's
  // clear writes won't take.
  const groupOpen = isGroupPhaseOpen(typedPool);
  const knockoutOpen = isKnockoutPhaseOpen(typedPool);

  // Per-pick-set group progress ("X of 72") and main-payment status.
  //
  // Both are keyed on pick_set_id and drive the two new admin filters:
  //   - "Has empty pick set" → any pick set with 0 group picks made.
  //   - "Has unpaid pick set" → any pick set whose MAIN buy-in is
  //     unpaid (the separate 3rd-place payment is intentionally not
  //     considered here).
  //
  // Counts are paginated (countPicksByPickSet pages with .range()) so
  // pools large enough to exceed Supabase's 1000-row cap still report
  // accurate per-pick-set totals — the same correctness fix the
  // standings progress column relies on.
  const allPickSetIds = (pickSets ?? []).map((ps) => ps.id);

  const groupPickCounts =
    allPickSetIds.length > 0
      ? await countPicksByPickSet("group_picks", allPickSetIds)
      : {};

  const paidMap =
    allPickSetIds.length > 0
      ? await getMainPaidByPickSet(pool.id, allPickSetIds)
      : new Map<string, boolean>();

  // Serialise the paid Map to a plain object for the client boundary.
  // Pick sets with no payment row are absent here; the client defaults
  // missing entries to unpaid (false).
  const paidByPickSet: Record<string, boolean> = {};
  for (const [id, paid] of paidMap.entries()) {
    paidByPickSet[id] = paid;
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
        groupPhaseOpen={groupOpen}
        knockoutPhaseOpen={knockoutOpen}
        groupPickCounts={groupPickCounts}
        paidByPickSet={paidByPickSet}
      />
    </div>
  );
}
