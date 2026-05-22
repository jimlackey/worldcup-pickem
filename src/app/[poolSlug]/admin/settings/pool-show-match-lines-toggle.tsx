"use client";

import { useActionState } from "react";
import { togglePoolShowMatchLinesAction } from "../actions-display";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

const initial: AdminActionResult = { success: false };

/**
 * Per-pool toggle for showing money lines under the home / draw / away
 * pick buttons on the editable group picks form.
 *
 * When ENABLED, each pick button gets a small "(-190)" / "(+330)" /
 * "(+600)" subscript. Matches with no lines on file render unchanged.
 *
 * When DISABLED, the buttons look exactly as they did before this
 * feature shipped.
 *
 * Lines are sourced from the super-admin (`/super-admin/lines`). Real
 * pools read those values directly; demo pools receive a copy of the
 * GROUP-PHASE lines via the writeLinesGlobalAndDemos sync helper.
 * Demo knockout matches stay line-free by design (knockout fixtures
 * can be rewired in a demo pool, so the global lines wouldn't match).
 * The `isDemo` prop just adjusts the description copy to mention
 * this — the data-side gate lives in src/lib/lines/sync.ts.
 */
export function PoolShowMatchLinesToggle({
  pool,
  isDemo,
}: {
  pool: Pool;
  /**
   * True when pool.is_demo === true. Drives the description copy so
   * demo admins understand the toggle only surfaces lines for the
   * group phase.
   */
  isDemo: boolean;
}) {
  const [state, action, pending] = useActionState(
    togglePoolShowMatchLinesAction,
    initial
  );

  // Description copy varies by pool type. Real pools see lines across
  // every phase; demo pools see them only for group matches. The
  // wording reflects that so admins don't toggle ON expecting knockout
  // lines and find an empty section. Keeping the same overall structure
  // (one sentence describing the ON state, one describing the OFF
  // affordance) means the toggle's footprint doesn't change visually.
  const onCopyReal =
    "Money lines render under each pick button on the editable group picks form. Lines are edited by the super-admin and shared across every pool.";
  const onCopyDemo =
    "Money lines render under each pick button on the editable group picks form for Group Phase matches. Knockout matches in demo pools never show lines (their fixtures can differ from the real tournament). Lines are edited by the super-admin.";
  const offCopyReal =
    "Pick buttons render without lines. Turn this on to surface each match's money lines under the home / draw / away buttons.";
  const offCopyDemo =
    "Pick buttons render without lines. Turn this on to surface money lines under the home / draw / away buttons on Group Phase matches. (Knockout matches in demo pools don't show lines.)";

  const onCopy = isDemo ? onCopyDemo : onCopyReal;
  const offCopy = isDemo ? offCopyDemo : offCopyReal;

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input
        type="hidden"
        name="enabled"
        value={pool.show_match_lines ? "false" : "true"}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {pool.show_match_lines
              ? "Match lines shown on picks form"
              : "Match lines hidden on picks form"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {pool.show_match_lines ? onCopy : offCopy}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "..." : pool.show_match_lines ? "Disable" : "Enable"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && <p className="text-xs text-pitch-600 mt-2">{state.message}</p>}
    </form>
  );
}
