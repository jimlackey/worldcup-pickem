"use client";

import { useActionState } from "react";
import { updateScoringAction } from "../actions";
import type { AdminActionResult } from "../actions";
import type { Pool, MatchPhase } from "@/types/database";
import { PHASE_LABELS } from "@/lib/utils/constants";

interface ScoringFormProps {
  pool: Pool;
  scoring: Record<MatchPhase, number>;
}

const initial: AdminActionResult = { success: false };

const phases: MatchPhase[] = ["group", "r32", "r16", "qf", "sf", "final"];

export function ScoringForm({ pool, scoring }: ScoringFormProps) {
  const [state, action, pending] = useActionState(updateScoringAction, initial);

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4"
    >
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {phases.map((phase) => (
          <div key={phase}>
            <label className="block text-xs font-medium mb-1">
              {PHASE_LABELS[phase]}
            </label>
            <input
              name={phase}
              type="number"
              min={0}
              defaultValue={scoring[phase] ?? 0}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
            />
          </div>
        ))}
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-pitch-600">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "Saving..." : "Save Scoring"}
      </button>
    </form>
  );
}
