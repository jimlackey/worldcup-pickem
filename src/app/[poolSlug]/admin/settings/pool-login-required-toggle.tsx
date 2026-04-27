"use client";

import { useActionState } from "react";
import { togglePoolLoginRequiredAction } from "../actions-privacy";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

const initial: AdminActionResult = { success: false };

export function PoolLoginRequiredToggle({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(togglePoolLoginRequiredAction, initial);

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      {/* Submit the inverse so a click toggles the current value. */}
      <input
        type="hidden"
        name="requiresLogin"
        value={pool.requires_login_to_view ? "false" : "true"}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {pool.requires_login_to_view
              ? "Login required to view"
              : "Anyone with the link can view"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {pool.requires_login_to_view
              ? "Standings, picks, and match pages are visible only to people who have logged in to this pool."
              : "Standings, picks, and match pages are visible to anyone who reaches the pool URL — no login required."}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors shrink-0"
        >
          {pending
            ? "..."
            : pool.requires_login_to_view
              ? "Make Public"
              : "Require Login"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && <p className="text-xs text-pitch-600 mt-2">{state.message}</p>}
    </form>
  );
}
