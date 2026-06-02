"use client";

import { useActionState, useEffect, useState } from "react";
import { setPoolMaxPickSetsAction } from "../actions-display";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

const initial: AdminActionResult = { success: false };

/**
 * Per-pool control for the maximum number of pick sets a single email
 * address may create in this pool (pools.max_pick_sets_per_player).
 *
 * The limit is enforced per email because every participant row is keyed
 * to a unique email (participants.email is CITEXT UNIQUE), and pick sets
 * are counted by participant_id at creation time in
 * createPickSetAction → countPickSets. So configuring this number here
 * directly bounds how many pick sets one email can hold in the pool.
 *
 * The DB CHECK constraint pins the value to 1–10; the input mirrors that
 * range so the form can't submit a value the database would reject. The
 * server action re-validates, so a hand-crafted POST can't slip past it.
 *
 * Lowering the limit below what some players have already created does
 * NOT delete anyone's existing pick sets — it only blocks new creations
 * until a player is back under the cap. Existing over-cap players simply
 * can't add more.
 */
export function PoolMaxPickSetsForm({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(
    setPoolMaxPickSetsAction,
    initial
  );

  // Controlled input seeded from the server value, kept in sync if the
  // prop changes after a successful save (revalidatePath re-renders the
  // parent with the new pool). Standard useState + useEffect resync.
  const [value, setValue] = useState<number>(pool.max_pick_sets_per_player);
  useEffect(() => {
    setValue(pool.max_pick_sets_per_player);
  }, [pool.max_pick_sets_per_player]);

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Pick sets per player</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            The maximum number of pick sets a single email address can
            create in this pool. Each player sees how many they&apos;ve used
            on their My Picks page. Lowering this won&apos;t remove pick sets
            anyone already made — it only blocks new ones until they&apos;re
            back under the limit. Allowed range: 1–10.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            name="maxPickSets"
            type="number"
            min={1}
            max={10}
            step={1}
            required
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-center tabular-nums focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />
          <button
            type="submit"
            disabled={pending || value === pool.max_pick_sets_per_player}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors"
          >
            {pending ? "..." : "Save"}
          </button>
        </div>
      </div>

      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && (
        <p className="text-xs text-pitch-600 mt-2">{state.message}</p>
      )}
    </form>
  );
}
