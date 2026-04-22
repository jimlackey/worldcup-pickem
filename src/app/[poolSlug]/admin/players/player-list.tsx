"use client";

import { useState, useActionState } from "react";
import {
  deactivateParticipantAction,
  deactivatePickSetAction,
  promoteToAdminAction,
  demoteToPlayerAction,
} from "../actions";
import type { AdminActionResult } from "../actions";
import type { PoolMembership, Participant, PickSet } from "@/types/database";
import { cn } from "@/lib/utils/cn";

interface PlayerListProps {
  members: (PoolMembership & { participant: Participant })[];
  pickSetsByParticipant: Record<string, PickSet[]>;
  poolId: string;
  poolSlug: string;
  /** The current session's participant id — used to hide the self-demote button. */
  currentParticipantId: string;
}

const initial: AdminActionResult = { success: false };

export function PlayerList({
  members,
  pickSetsByParticipant,
  poolId,
  poolSlug,
  currentParticipantId,
}: PlayerListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
      {members.map((member) => {
        const pickSets = pickSetsByParticipant[member.participant_id] ?? [];
        const isExpanded = expandedId === member.participant_id;
        const isSelf = member.participant_id === currentParticipantId;

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
                  {isSelf && (
                    <span className="ml-1.5 text-2xs text-[var(--color-text-muted)]">
                      (you)
                    </span>
                  )}
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3">
                {/* Role management */}
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    Role
                  </p>
                  {member.role === "player" ? (
                    <PromoteButton
                      participantId={member.participant_id}
                      poolId={poolId}
                      poolSlug={poolSlug}
                      disabled={!member.is_active}
                    />
                  ) : (
                    !isSelf && (
                      <DemoteButton
                        participantId={member.participant_id}
                        poolId={poolId}
                        poolSlug={poolSlug}
                      />
                    )
                  )}
                  {isSelf && member.role === "admin" && (
                    <span className="text-xs text-[var(--color-text-muted)] italic">
                      You can&apos;t demote yourself.
                    </span>
                  )}
                </div>

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

                {/* Deactivate participant — admins and non-admins alike, but not self */}
                {!isSelf && (
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

function PromoteButton({
  participantId,
  poolId,
  poolSlug,
  disabled,
}: {
  participantId: string;
  poolId: string;
  poolSlug: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(promoteToAdminAction, initial);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />
      <button
        type="submit"
        disabled={pending || disabled}
        className="text-xs font-medium text-pitch-600 hover:text-pitch-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Promoting..." : "Make admin"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function DemoteButton({
  participantId,
  poolId,
  poolSlug,
}: {
  participantId: string;
  poolId: string;
  poolSlug: string;
}) {
  const [state, action, pending] = useActionState(demoteToPlayerAction, initial);

  return (
    <form
      action={action}
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        if (!confirm("Demote this admin to a regular player?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] disabled:opacity-50 transition-colors"
      >
        {pending ? "Demoting..." : "Demote to player"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
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
