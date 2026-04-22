"use client";

import { useActionState, useState } from "react";
import {
  addWhitelistAction,
  bulkAddWhitelistAction,
  removeWhitelistAction,
} from "../actions";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";
import { cn } from "@/lib/utils/cn";

interface WhitelistManagerProps {
  pool: Pool;
  whitelist: { id: string; email: string; added_at: string }[];
}

const initial: AdminActionResult = { success: false };

type AddMode = "single" | "bulk";

export function WhitelistManager({ pool, whitelist }: WhitelistManagerProps) {
  const [mode, setMode] = useState<AddMode>("single");

  const [addState, addAction, addPending] = useActionState(addWhitelistAction, initial);
  const [bulkState, bulkAction, bulkPending] = useActionState(
    bulkAddWhitelistAction,
    initial
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeWhitelistAction,
    initial
  );

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Mode toggle */}
      <div className="flex gap-1 px-4 pt-3 border-b border-[var(--color-border)]">
        <ModeTab
          active={mode === "single"}
          onClick={() => setMode("single")}
          label="Add one"
        />
        <ModeTab
          active={mode === "bulk"}
          onClick={() => setMode("bulk")}
          label="Add many"
        />
      </div>

      {/* Single-email form */}
      {mode === "single" && (
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
      )}

      {/* Bulk-add form */}
      {mode === "bulk" && (
        <form action={bulkAction} className="p-4 border-b border-[var(--color-border)]">
          <input type="hidden" name="poolId" value={pool.id} />
          <input type="hidden" name="poolSlug" value={pool.slug} />

          <label
            htmlFor="bulk-emails"
            className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5"
          >
            Paste emails below — separated by commas, newlines, or spaces.
          </label>

          <textarea
            id="bulk-emails"
            name="emails"
            required
            rows={5}
            placeholder={"alice@example.com, bob@example.com\ncarol@example.com\ndan@example.com"}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-mono placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none resize-y"
          />

          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-[var(--color-text-muted)]">
              Duplicates and invalid entries are automatically skipped.
            </p>
            <button
              type="submit"
              disabled={bulkPending}
              className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {bulkPending ? "Adding..." : "Add all"}
            </button>
          </div>

          {bulkState.error && (
            <p className="text-xs text-red-600 mt-2">{bulkState.error}</p>
          )}
          {bulkState.success && (
            <p className="text-xs text-pitch-600 mt-2">{bulkState.message}</p>
          )}
        </form>
      )}

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

      {removeState.error && (
        <p className="px-4 py-2 text-xs text-red-600 border-t border-[var(--color-border)]">
          {removeState.error}
        </p>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors -mb-px border border-transparent",
        active
          ? "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] border-b-[var(--color-surface)]"
          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
      )}
    >
      {label}
    </button>
  );
}
