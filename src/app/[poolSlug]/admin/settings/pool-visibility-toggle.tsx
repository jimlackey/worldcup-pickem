"use client";

import { useActionState } from "react";
import { togglePoolVisibilityAction } from "../actions";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

const initial: AdminActionResult = { success: false };

export function PoolVisibilityToggle({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(togglePoolVisibilityAction, initial);

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="isListed" value={pool.is_listed ? "false" : "true"} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {pool.is_listed ? "Pool is visible" : "Pool is hidden"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {pool.is_listed
              ? "This pool appears on the public pool listing page."
              : "This pool is hidden from the listing. Only accessible via direct URL."}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors"
        >
          {pending ? "..." : pool.is_listed ? "Hide Pool" : "Show Pool"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && <p className="text-xs text-pitch-600 mt-2">{state.message}</p>}
    </form>
  );
}
