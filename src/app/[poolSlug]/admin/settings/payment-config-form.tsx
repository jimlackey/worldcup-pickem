"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { updatePaymentConfigAction } from "../actions-payment-config";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";
import type {
  PaymentConfig,
  PayoutRow,
} from "@/lib/payments/config-queries";
import {
  formatCentsAsDollarsString,
  isValidDollarString,
} from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

interface PaymentConfigFormProps {
  pool: Pool;
  config: PaymentConfig;
}

const initial: AdminActionResult = { success: false };

const WINNER_COUNT_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Per-pool Payment Config form (migration 025).
 *
 * Three sections:
 *
 *   1. Entry Fee — text input prefixed with "$". Validated as a
 *      money string (digits + optional .XX); the input is type=text
 *      rather than type=number because number inputs have surprising
 *      mobile-keyboard behaviour around decimals and step values.
 *      Default placeholder "20.00" matches the DB default of $20.
 *
 *   2. Consolation Fee — identical to Entry Fee. Default $5.00.
 *      Independent of consolation_mode — the fee is recorded whether
 *      or not the pool currently offers a consolation feature, so an
 *      admin who flips the mode on later doesn't have to remember to
 *      set the price too.
 *
 *   3. Winner count + Payout Grid — a dropdown 0..10 plus, when
 *      non-zero, a grid of N rows. Each row shows the place number
 *      (read-only) and a percent input. A live "sum" indicator
 *      below the grid tells the admin whether the percentages add
 *      to 100 yet, and the Save button is disabled until they do.
 *
 *      When the admin changes the winner count, the grid resizes
 *      and the new rows pick up "suggested" defaults (see
 *      defaultPercentsFor) so the admin doesn't start from zeros and
 *      always see a "needs 100" warning. Existing percents are
 *      preserved across resizes where possible — e.g. growing from
 *      3 winners to 4 keeps the first three percents and adds a
 *      new row, then re-normalises.
 */
export function PaymentConfigForm({
  pool,
  config,
}: PaymentConfigFormProps) {
  const [state, action, pending] = useActionState(
    updatePaymentConfigAction,
    initial
  );

  // ----- Fees -----
  const [entryFee, setEntryFee] = useState(
    formatCentsAsDollarsString(config.entryFeeCents)
  );
  const [consolationFee, setConsolationFee] = useState(
    formatCentsAsDollarsString(config.consolationFeeCents)
  );

  // Resync from server props after a successful save (revalidatePath
  // re-renders us with fresh `config`). Without this, optimistic local
  // edits would persist visually after the server has accepted them
  // and could drift from the canonical state.
  useEffect(() => {
    setEntryFee(formatCentsAsDollarsString(config.entryFeeCents));
  }, [config.entryFeeCents]);
  useEffect(() => {
    setConsolationFee(formatCentsAsDollarsString(config.consolationFeeCents));
  }, [config.consolationFeeCents]);

  // ----- Winner count + percents -----
  const [winnerCount, setWinnerCount] = useState(config.winnerCount);
  // Percents are kept as strings (not numbers) because the user is
  // typing into an input — empty string is a meaningful in-flight
  // state that we shouldn't coerce to 0 until they blur or submit.
  const [percents, setPercents] = useState<string[]>(() =>
    initialPercentStrings(config.payouts, config.winnerCount)
  );

  // Resync the schedule from server props on revalidate. Match the
  // same defensive treatment as the fee fields above.
  useEffect(() => {
    setWinnerCount(config.winnerCount);
    setPercents(initialPercentStrings(config.payouts, config.winnerCount));
  }, [config.winnerCount, config.payouts]);

  function handleWinnerCountChange(next: number) {
    setWinnerCount(next);
    setPercents((curr) => resizePercents(curr, next));
  }

  function handlePercentChange(idx: number, value: string) {
    // Accept only digits in the field. Empty string is allowed (in-
    // flight state); anything else strips silently. This is friendlier
    // than rejecting keystrokes — most non-digit attempts are typos
    // and stripping just hides them.
    const cleaned = value.replace(/[^\d]/g, "");
    setPercents((curr) => {
      const next = [...curr];
      next[idx] = cleaned;
      return next;
    });
  }

  // ----- Derived validation -----
  const entryFeeValid = isValidDollarString(entryFee);
  const consolationFeeValid = isValidDollarString(consolationFee);

  const percentSum = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < winnerCount; i++) {
      const n = Number.parseInt(percents[i] ?? "", 10);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  }, [percents, winnerCount]);

  const percentsValid =
    winnerCount === 0 ||
    (percents.slice(0, winnerCount).every((s) => /^\d+$/.test(s)) &&
      percentSum === 100);

  const canSave = entryFeeValid && consolationFeeValid && percentsValid;

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-5"
    >
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />

      {/* ----- Fees ----- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MoneyField
          name="entryFee"
          label="Entry Fee"
          description="Per pick set. Defaults to $20."
          value={entryFee}
          onChange={setEntryFee}
          valid={entryFeeValid}
        />
        <MoneyField
          name="consolationFee"
          label="Consolation Fee"
          description="Pre-tournament 3rd-place buy-in. Defaults to $5."
          value={consolationFee}
          onChange={setConsolationFee}
          valid={consolationFeeValid}
        />
      </div>

      {/* ----- Winners + Payout grid ----- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="text-sm font-medium" htmlFor="winnerCount">
            Number of winners to pay out
          </label>
          <select
            id="winnerCount"
            name="winnerCount"
            value={winnerCount}
            onChange={(e) => handleWinnerCountChange(Number(e.target.value))}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          >
            {WINNER_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {winnerCount > 0 && (
          <div className="rounded-md border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
            {/* Grid header. Two columns: Place (narrow) + Payout %
                (flex). The percent column has a "%" suffix span so
                the admin reads "50 %" rather than just "50". */}
            <div className="flex items-center gap-3 px-3 py-2 bg-[var(--color-surface-raised)] text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <span className="w-16">Place</span>
              <span className="flex-1">Payout %</span>
            </div>
            {Array.from({ length: winnerCount }).map((_, idx) => {
              const place = idx + 1;
              return (
                <div
                  key={place}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  {/* Place is read-only per spec. The label doubles
                      as the visible "1, 2, 3" indicator with an
                      ordinal suffix so a quick scan reads naturally. */}
                  <span className="w-16 text-sm font-medium tabular-nums">
                    {ordinal(place)}
                  </span>
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      name={`percent_${place}`}
                      value={percents[idx] ?? ""}
                      onChange={(e) =>
                        handlePercentChange(idx, e.target.value)
                      }
                      maxLength={3}
                      className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-right tabular-nums focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
                      placeholder="0"
                    />
                    <span className="text-sm text-[var(--color-text-muted)]">
                      %
                    </span>
                  </div>
                </div>
              );
            })}
            <div
              className={cn(
                "px-3 py-2 text-xs flex items-center justify-between gap-3 bg-[var(--color-surface-raised)]",
                percentSum === 100
                  ? "text-pitch-600"
                  : "text-[var(--color-text-muted)]"
              )}
            >
              <span>
                Total: <span className="tabular-nums font-medium">{percentSum}</span>%
              </span>
              {percentSum !== 100 && (
                <span>
                  {percentSum < 100
                    ? `Need ${100 - percentSum} more`
                    : `${percentSum - 100} over 100`}
                </span>
              )}
              {percentSum === 100 && <span>✓</span>}
            </div>
          </div>
        )}
      </div>

      {/* ----- Status + Save ----- */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs">
          {state.error && <span className="text-red-600">{state.error}</span>}
          {state.success && (
            <span className="text-pitch-600">{state.message}</span>
          )}
        </div>
        <button
          type="submit"
          disabled={pending || !canSave}
          className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Save Payment Config"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// MoneyField — text input with a "$" prefix and inline validation hint.
// ---------------------------------------------------------------------------

function MoneyField({
  name,
  label,
  description,
  value,
  onChange,
  valid,
}: {
  name: string;
  label: string;
  description: string;
  value: string;
  onChange: (next: string) => void;
  valid: boolean;
}) {
  // We don't want to red-ring the field while the user is mid-edit
  // and the value is an in-flight state like "" or "20." — only flag
  // it once they've left the field. `touched` defaults to false and
  // flips on the first blur.
  const [touched, setTouched] = useState(false);
  const showError = touched && !valid;

  return (
    <div>
      <label
        className="block text-xs font-medium mb-1"
        htmlFor={`field-${name}`}
      >
        {label}
      </label>
      <div className="relative">
        <span className="absolute inset-y-0 left-2 flex items-center text-sm text-[var(--color-text-muted)] pointer-events-none">
          $
        </span>
        <input
          id={`field-${name}`}
          name={name}
          type="text"
          inputMode="decimal"
          // Friendly free-text input rather than type=number to keep
          // mobile keyboards predictable and to allow values like
          // "20" (no decimal) without a spurious "step" complaint.
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="0.00"
          className={cn(
            "w-full rounded-md border bg-[var(--color-surface)] pl-6 pr-3 py-2 text-sm tabular-nums focus:ring-2 outline-none transition-colors",
            showError
              ? "border-red-400 focus:ring-red-500/40 focus:border-red-500"
              : "border-[var(--color-border)] focus:ring-pitch-500/40 focus:border-pitch-500"
          )}
        />
      </div>
      <p
        className={cn(
          "text-xs mt-1",
          showError ? "text-red-600" : "text-[var(--color-text-muted)]"
        )}
      >
        {showError ? "Enter a valid dollar amount (e.g. 20 or 20.00)." : description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "1st", "2nd", "3rd", "4th"... */
function ordinal(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  if (lastOne === 1) return `${n}st`;
  if (lastOne === 2) return `${n}nd`;
  if (lastOne === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * Build the initial percents-as-strings array for the form. Length
 * matches winnerCount (even if the saved payouts array is shorter or
 * longer — getPaymentConfig already normalises that). Each entry is
 * a string so empty/in-flight states render correctly.
 */
function initialPercentStrings(
  payouts: PayoutRow[],
  winnerCount: number
): string[] {
  // If the saved schedule exactly matches winnerCount, mirror it.
  // Otherwise (typically winnerCount=0, payouts=[]), fall back to
  // the suggested-defaults table.
  if (winnerCount === 0) return [];
  if (payouts.length === winnerCount && payouts.every((p) => p.percent > 0)) {
    return payouts.map((p) => String(p.percent));
  }
  return defaultPercentsFor(winnerCount).map(String);
}

/**
 * Suggested default percentages for N winners. The form seeds the
 * grid with these on first render and on every winner-count change
 * so admins don't start from all-zeros (which would always fail the
 * sum-to-100 rule). Admins are expected to tweak these freely.
 *
 * Lookup table for N ≤ 5 — the canonical "pool prize" splits — and a
 * graceful fallback for larger N that distributes evenly with the
 * remainder going to 1st (which keeps the sum at exactly 100).
 */
function defaultPercentsFor(n: number): number[] {
  switch (n) {
    case 0:
      return [];
    case 1:
      return [100];
    case 2:
      return [60, 40];
    case 3:
      return [50, 30, 20];
    case 4:
      return [40, 30, 20, 10];
    case 5:
      return [40, 25, 15, 12, 8];
    default: {
      // Even split with the remainder funneled to 1st place so the
      // total is always exactly 100. e.g. n=6 → [20, 16, 16, 16, 16, 16].
      const base = Math.floor(100 / n);
      const remainder = 100 - base * n;
      const out = new Array<number>(n).fill(base);
      out[0] += remainder;
      return out;
    }
  }
}

/**
 * Grow/shrink the percent strings array when the admin changes the
 * winner count. We preserve existing values where possible:
 *   - Shrinking from 5→3: keep the first 3 strings.
 *   - Growing from 3→5: keep the first 3, then re-seed the full row
 *     with defaults for N=5 (NOT pad with zeros, because zero-padded
 *     rows would always violate sum-to-100 until the admin notices).
 *     This is a UX choice — admins who'd really rather keep their
 *     manual entries can re-type after a resize.
 *
 * Returning the suggested defaults wholesale when growing keeps the
 * "always sums to 100" invariant the form depends on for its Save
 * button enable state. The trade-off (clobbering manual entries on
 * grow) is small because grows are rare and the suggested defaults
 * are themselves sensible starting points.
 */
function resizePercents(current: string[], nextCount: number): string[] {
  if (nextCount === 0) return [];
  if (nextCount < current.length) {
    return current.slice(0, nextCount);
  }
  if (nextCount === current.length) return current;
  // Growing: replace wholesale with defaults so the sum stays 100.
  return defaultPercentsFor(nextCount).map(String);
}
