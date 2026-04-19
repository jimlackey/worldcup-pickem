"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createPickSetAction, renamePickSetAction } from "./actions";
import type { PickActionResult } from "./actions";
import type { Pool, PickSet, PoolSession } from "@/types/database";
import { cn } from "@/lib/utils/cn";

interface PickSetDashboardProps {
  pool: Pool;
  session: PoolSession;
  pickSets: PickSet[];
  currentCount: number;
  groupPickCounts: Record<string, number>;
  knockoutPickCounts: Record<string, number>;
  groupPhaseOpen: boolean;
  knockoutPhaseOpen: boolean;
}

const initial: PickActionResult = { success: false };

export function PickSetDashboard({
  pool,
  session,
  pickSets,
  currentCount,
  groupPickCounts,
  knockoutPickCounts,
  groupPhaseOpen,
  knockoutPhaseOpen,
}: PickSetDashboardProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [createState, createAction, createPending] = useActionState(
    createPickSetAction,
    initial
  );

  const canCreate = currentCount < pool.max_pick_sets_per_player;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">My Pick Sets</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {session.displayName || session.email}
            {session.role === "admin" && (
              <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full bg-gold-100 text-gold-700">
                admin
              </span>
            )}
          </p>
        </div>

        {canCreate && !showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 transition-colors shrink-0 tap-target"
          >
            + New Pick Set
          </button>
        )}
      </div>

      {/* Phase status */}
      <div className="flex gap-3 text-xs">
        <span
          className={cn(
            "px-2.5 py-1 rounded-full font-medium",
            groupPhaseOpen
              ? "bg-pitch-100 text-pitch-700"
              : "bg-gray-100 text-gray-600"
          )}
        >
          Group picks: {groupPhaseOpen ? "Open" : "Locked"}
        </span>
        <span
          className={cn(
            "px-2.5 py-1 rounded-full font-medium",
            knockoutPhaseOpen
              ? "bg-pitch-100 text-pitch-700"
              : "bg-gray-100 text-gray-600"
          )}
        >
          Knockout: {knockoutPhaseOpen ? "Open" : pool.knockout_open_at ? "Locked" : "Not open"}
        </span>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          action={createAction}
          className="rounded-xl border border-pitch-200 bg-pitch-50/50 p-4 space-y-3"
        >
          <input type="hidden" name="poolId" value={pool.id} />
          <input type="hidden" name="poolSlug" value={pool.slug} />

          <label className="block text-sm font-medium">
            Pick set name
          </label>
          <input
            name="name"
            type="text"
            maxLength={50}
            required
            autoFocus
            placeholder="e.g. My Bold Picks"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />

          {createState.error && (
            <p className="text-sm text-red-600">{createState.error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createPending}
              className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
            >
              {createPending ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-md px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-[var(--color-text-muted)]">
            {currentCount} of {pool.max_pick_sets_per_player} pick sets used
          </p>
        </form>
      )}

      {/* Pick set cards */}
      <div className="space-y-3">
        {pickSets.map((ps) => (
          <PickSetCard
            key={ps.id}
            pickSet={ps}
            pool={pool}
            groupPickCount={groupPickCounts[ps.id] ?? 0}
            knockoutPickCount={knockoutPickCounts[ps.id] ?? 0}
            groupPhaseOpen={groupPhaseOpen}
            knockoutPhaseOpen={knockoutPhaseOpen}
          />
        ))}

        {pickSets.length === 0 && !showCreate && (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
            <p className="text-[var(--color-text-secondary)]">
              No pick sets yet. Create one to start making picks.
            </p>
          </div>
        )}
      </div>

      {!canCreate && pickSets.length > 0 && (
        <p className="text-xs text-[var(--color-text-muted)] text-center">
          Maximum of {pool.max_pick_sets_per_player} pick sets reached.
        </p>
      )}
    </div>
  );
}

function PickSetCard({
  pickSet,
  pool,
  groupPickCount,
  knockoutPickCount,
  groupPhaseOpen,
  knockoutPhaseOpen,
}: {
  pickSet: PickSet;
  pool: Pool;
  groupPickCount: number;
  knockoutPickCount: number;
  groupPhaseOpen: boolean;
  knockoutPhaseOpen: boolean;
}) {
  const groupTotal = 72;
  const knockoutTotal = 31;
  const groupProgress = Math.round((groupPickCount / groupTotal) * 100);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display font-semibold">{pickSet.name}</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Created {new Date(pickSet.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--color-text-secondary)]">Group picks</span>
            <span className="font-medium">{groupPickCount}/{groupTotal}</span>
          </div>
          <div className="h-1.5 bg-[var(--color-surface-raised)] rounded-full overflow-hidden">
            <div
              className="h-full bg-pitch-500 rounded-full transition-all"
              style={{ width: `${groupProgress}%` }}
            />
          </div>
        </div>

        {knockoutPickCount > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-[var(--color-text-secondary)]">Knockout picks</span>
            <span className="font-medium">{knockoutPickCount}/{knockoutTotal}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {groupPhaseOpen && (
          <Link
            href={`/${pool.slug}/my-picks/${pickSet.id}`}
            className="rounded-md bg-pitch-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pitch-700 transition-colors tap-target"
          >
            {groupPickCount > 0 ? "Edit Group Picks" : "Make Group Picks"}
          </Link>
        )}

        {knockoutPhaseOpen && (
          <Link
            href={`/${pool.slug}/my-picks/${pickSet.id}/knockout`}
            className="rounded-md border border-pitch-600 text-pitch-600 px-3 py-2 text-xs font-semibold hover:bg-pitch-50 transition-colors tap-target"
          >
            {knockoutPickCount > 0 ? "Edit Knockout Picks" : "Make Knockout Picks"}
          </Link>
        )}

        {!groupPhaseOpen && !knockoutPhaseOpen && (
          <span className="text-xs text-[var(--color-text-muted)] py-2">
            All picks are locked.
          </span>
        )}
      </div>
    </div>
  );
}
