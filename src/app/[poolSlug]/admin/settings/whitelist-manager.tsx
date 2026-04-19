"use client";

import { useActionState } from "react";
import { addWhitelistAction, removeWhitelistAction } from "../actions";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

interface WhitelistManagerProps {
  pool: Pool;
  whitelist: { id: string; email: string; added_at: string }[];
}

const initial: AdminActionResult = { success: false };

export function WhitelistManager({ pool, whitelist }: WhitelistManagerProps) {
  const [addState, addAction, addPending] = useActionState(addWhitelistAction, initial);
  const [removeState, removeAction, removePending] = useActionState(removeWhitelistAction, initial);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Add form */}
      <form action={addAction} className="p-4 border-b border-[var(--color-border)]">
        <input type="hidden" name="poolId" value={pool.id} />
        <input type="hidden" name="poolSlug" value={pool.slug} />

        <div className="flex gap-2">
          <input
            name="email"
            type="email"
            placeholder="email@example.com"
            required
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />
          <button
            type="submit"
            disabled={addPending}
            className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {addPending ? "Adding..." : "Add"}
          </button>
        </div>
        {addState.error && <p className="text-xs text-red-600 mt-1">{addState.error}</p>}
        {addState.success && <p className="text-xs text-pitch-600 mt-1">{addState.message}</p>}
      </form>

      {/* Email list */}
      <div className="divide-y divide-[var(--color-border)] max-h-80 overflow-y-auto">
        {whitelist.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm truncate">{entry.email}</span>
            <form action={removeAction}>
              <input type="hidden" name="poolId" value={pool.id} />
              <input type="hidden" name="poolSlug" value={pool.slug} />
              <input type="hidden" name="email" value={entry.email} />
              <button
                type="submit"
                disabled={removePending}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                Remove
              </button>
            </form>
          </div>
        ))}
        {whitelist.length === 0 && (
          <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">
            No emails on the whitelist yet.
          </p>
        )}
      </div>
    </div>
  );
}
