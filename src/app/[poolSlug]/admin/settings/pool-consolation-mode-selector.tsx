"use client";

import { useActionState, useEffect, useState } from "react";
import { setPoolConsolationModeAction } from "../actions-consolation";
import type { AdminActionResult } from "../actions";
import type { Pool, ConsolationMode } from "@/types/database";
import { cn } from "@/lib/utils/cn";

const initial: AdminActionResult = { success: false };

/**
 * Per-pool selector for the consolation feature. Three mutually
 * exclusive options:
 *
 *   "none"           — No consolation feature. 31-pick bracket; no
 *                      pre-tournament 3rd-place pick.
 *   "bracket"        — In-bracket #104 consolation match (the original
 *                      consolation feature). Players' bracket totals
 *                      become 32 picks; loser of each semifinal auto-
 *                      advances to #104; consolation pick is graded
 *                      with the standard scoring pipeline.
 *   "preseason_pick" — Optional pre-tournament 3rd-place pick. Players
 *                      select any country at the bottom of the Group
 *                      Phase picks page, editable until group lock.
 *                      Requires a separate "3rd Place Paid" buy-in
 *                      tracked on the /admin/payments page.
 *
 * Replaces the previous PoolConsolationToggle (a 2-state on/off
 * switch). The underlying DB column consolation_match_enabled stays
 * in sync with this selector via a Postgres trigger (it's TRUE iff
 * mode='bracket'), so every pre-024 code path that reads the boolean
 * continues to work without modification.
 *
 * RENDERING: a single form with three radio buttons; saving submits
 * the form via the server action. Could be three buttons that each
 * post directly, but radio + Save reads more naturally as "I am
 * selecting from a list of options" — which is the actual semantic
 * model — and avoids the visual confusion of three separate buttons
 * fighting for primary-action status. The Save button disables when
 * the selection matches the current saved value.
 */
export function PoolConsolationModeSelector({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(
    setPoolConsolationModeAction,
    initial
  );

  // Controlled radio group. We seed local state from the pool prop and
  // resync whenever the server-supplied value changes (i.e. after a
  // successful save triggers revalidatePath). Without this useEffect,
  // an uncontrolled radio with defaultChecked won't update its visible
  // selection after the prop changes — a known React quirk that bit
  // the picks form before and pushed it to the same controlled pattern.
  const [selected, setSelected] = useState<ConsolationMode>(
    pool.consolation_mode
  );

  useEffect(() => {
    setSelected(pool.consolation_mode);
  }, [pool.consolation_mode]);

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3"
    >
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />

      <div>
        <p className="text-sm font-medium">Consolation feature</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Pick at most one. The two consolation features are mutually
          exclusive — a pool runs one of them or neither.
        </p>
      </div>

      <div className="space-y-2">
        <ModeOption
          value="none"
          selected={selected}
          onSelect={setSelected}
          label="None"
          description="No consolation feature. Players make 31 knockout picks; no pre-tournament 3rd-place pick."
        />
        <ModeOption
          value="bracket"
          selected={selected}
          onSelect={setSelected}
          label="Enable Bracket Consolation"
          description="The 3rd-place match (losers of the two semifinals) is part of the bracket. Players make 32 knockout picks total. Existing consolation picks are preserved if you switch away and back later."
        />
        <ModeOption
          value="preseason_pick"
          selected={selected}
          onSelect={setSelected}
          label="Enable Pre-Tournament 3rd Place Selection"
          description="Players make an optional pick for any country to finish third, presented at the bottom of the Group Phase picks page. Editable until the group phase locks. Requires a separate 3rd Place buy-in tracked in admin Payments."
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-xs">
          {state.error && <span className="text-red-600">{state.error}</span>}
          {state.success && (
            <span className="text-pitch-600">{state.message}</span>
          )}
        </div>
        <button
          type="submit"
          // Disable when the selection is the current saved value —
          // saves an unnecessary round-trip and an audit-log no-op (the
          // action also short-circuits server-side, but this gives the
          // admin a clearer affordance).
          disabled={pending || selected === pool.consolation_mode}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/**
 * Single radio-style option row. Controlled — checked is derived from
 * the parent's `selected` state and onChange flips it via `onSelect`.
 * The `name="mode"` hidden+actual radio pair ensures the form posts
 * the right value: the parent renders a hidden `<input>` with the
 * current selection as a safety net, and the actual radios drive the
 * visual state.
 *
 * (We could've used a single hidden input plus three regular buttons,
 * but native radios are the more accessible primitive — keyboard
 * users get arrow-key navigation for free, and screen readers
 * recognise the group semantics.)
 */
function ModeOption({
  value,
  selected,
  onSelect,
  label,
  description,
}: {
  value: ConsolationMode;
  selected: ConsolationMode;
  onSelect: (v: ConsolationMode) => void;
  label: string;
  description: string;
}) {
  const isCurrent = value === selected;
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
        isCurrent
          ? "border-pitch-500 bg-pitch-50"
          : "border-[var(--color-border)] hover:bg-[var(--color-surface-raised)]"
      )}
    >
      <input
        type="radio"
        name="mode"
        value={value}
        checked={isCurrent}
        onChange={() => onSelect(value)}
        className="mt-0.5 accent-pitch-600"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {description}
        </p>
      </div>
    </label>
  );
}
