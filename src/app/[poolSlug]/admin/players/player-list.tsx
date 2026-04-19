"use client";

import { useState, useActionState } from "react";
import { deactivateParticipantAction, deactivatePickSetAction } from "../actions";
import type { AdminActionResult } from "../actions";
import type { PoolMembership, Participant, PickSet } from "@/types/database";
import { cn } from "@/lib/utils/cn";

interface PlayerListProps {
  members: (PoolMembership & { participant: Participant })[];
  pickSetsByParticipant: Record<string, PickSet[]>;
  poolId: string;
  poolSlug: string;
}

const initial: AdminActionResult = { success: false };

export function PlayerList({
  members,
  pickSetsByParticipant,
  poolId,
  poolSlug,
}: PlayerListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
      {members.map((member) => {
        const pickSets = pickSetsByParticipant[member.participant_id] ?? [];
        const isExpanded = expandedId === member.participant_id;

        return (
          <div key={member.id}>
            <button
              type="button"
              onClick={() =>
                setExpandedId(isExpanded ? null : member.participant_id)
              }
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-surface-raised)] transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {member.participant.display_name || member.participant.email}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {member.participant.email}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span
                  className={cn(
                    "text-2xs font-medium px-1.5 py-0.5 rounded-full",
                    member.role === "admin"
                      ? "bg-gold-100 text-gold-700"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  {member.role}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {pickSets.length} pick set{pickSets.length !== 1 ? "s" : ""}
                </span>
                <svg
                  className={cn(
                    "h-4 w-4 text-[var(--color-text-muted)] transition-transform",
                    isExpanded && "rotate-180"
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3">
                {/* Pick sets */}
                {pickSets.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                      Pick Sets
                    </p>
                    {pickSets.map((ps) => (
                      <PickSetRow
                        key={ps.id}
                        pickSet={ps}
                        poolId={poolId}
                        poolSlug={poolSlug}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    No pick sets created yet.
                  </p>
                )}

                {/* Deactivate participant */}
                {member.role !== "admin" && (
                  <DeactivateButton
                    type="participant"
                    id={member.participant_id}
                    poolId={poolId}
                    poolSlug={poolSlug}
                    label="Remove from pool"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {members.length === 0 && (
        <p className="px-4 py-8 text-sm text-[var(--color-text-muted)] text-center">
          No members yet.
        </p>
      )}
    </div>
  );
}

function PickSetRow({
  pickSet,
  poolId,
  poolSlug,
}: {
  pickSet: PickSet;
  poolId: string;
  poolSlug: string;
}) {
  const [state, action, pending] = useActionState(deactivatePickSetAction, initial);

  return (
    <div className="flex items-center justify-between rounded-md bg-[var(--color-surface-raised)] px-3 py-2">
      <span className="text-sm truncate">{pickSet.name}</span>
      <form action={action}>
        <input type="hidden" name="pickSetId" value={pickSet.id} />
        <input type="hidden" name="poolId" value={poolId} />
        <input type="hidden" name="poolSlug" value={poolSlug} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
        >
          {pending ? "..." : "Deactivate"}
        </button>
      </form>
      {state.error && <span className="text-xs text-red-600 ml-2">{state.error}</span>}
    </div>
  );
}

function DeactivateButton({
  type,
  id,
  poolId,
  poolSlug,
  label,
}: {
  type: "participant";
  id: string;
  poolId: string;
  poolSlug: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(deactivateParticipantAction, initial);

  return (
    <form action={action}>
      <input type="hidden" name="participantId" value={id} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
      >
        {pending ? "..." : label}
      </button>
      {state.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
    </form>
  );
}
