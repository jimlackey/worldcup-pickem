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

/**
 * Whitelist editor. Two add modes (single email or bulk paste), an
 * inline list of current entries with per-row remove, and clear error /
 * success messaging tied to each action.
 *
 * This component used to live under settings/. It was relocated to its
 * own tab without code changes — the import path "../actions" still
 * resolves to admin/actions.ts from either location.
 */
export function WhitelistManager({ pool, whitelist }: WhitelistManagerProps) {
  const [mode, setMode] = useState<AddMode>("single");
  const [filter, setFilter] = useState("");

  const [addState, addAction, addPending] = useActionState(
    addWhitelistAction,
    initial
  );
  const [bulkState, bulkAction, bulkPending] = useActionState(
    bulkAddWhitelistAction,
    initial
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeWhitelistAction,
    initial
  );

  // Real-time, case-insensitive substring filter over the email column.
  const query = filter.trim().toLowerCase();
  const filtered = query
    ? whitelist.filter((e) => e.email.toLowerCase().includes(query))
    : whitelist;

  // Export every whitelisted email as a downloadable .txt file, formatted
  // as a single comma-separated line ready to paste straight into an
  // email client's BCC field. We always export the FULL whitelist, not the
  // current filtered view, so a stray filter term can't silently truncate
  // the exported recipient list — the button label shows the full count to
  // make that explicit.
  //
  // Done entirely client-side: the component already has every email in
  // props, so there's no need for a server round-trip. We build a Blob,
  // hand it a temporary object URL, click a synthetic <a download>, then
  // revoke the URL so it isn't leaked. (Browser storage APIs aren't used
  // or needed here.)
  function handleExport() {
    if (whitelist.length === 0) return;

    // Comma-space is the most broadly accepted BCC separator across mail
    // clients (Gmail, Outlook, Apple Mail). Emails are already stored
    // normalized, so no extra de-duping is needed beyond what's on the list.
    const bccLine = whitelist.map((e) => e.email).join(", ");

    const blob = new Blob([bccLine], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Slug + date keeps multiple exports from different pools / days
    // distinguishable in the downloads folder.
    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    a.download = `${pool.slug}-whitelist-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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
          {addState.error && (
            <p className="text-xs text-red-600 mt-1">{addState.error}</p>
          )}
          {addState.success && (
            <p className="text-xs text-pitch-600 mt-1">{addState.message}</p>
          )}
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
            placeholder={
              "alice@example.com, bob@example.com\ncarol@example.com\ndan@example.com"
            }
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

      {/* Filter + email list */}
      {whitelist.length > 0 && (
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter emails..."
            aria-label="Filter whitelist emails"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />
          <div className="flex items-center justify-between gap-3 mt-1.5">
            <p className="text-xs text-[var(--color-text-muted)]">
              {query
                ? `Showing ${filtered.length} of ${whitelist.length}`
                : `${whitelist.length} email${whitelist.length !== 1 ? "s" : ""} on the whitelist`}
            </p>
            <button
              type="button"
              onClick={handleExport}
              title="Download all whitelisted emails as a comma-separated BCC list (.txt)"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)] transition-colors shrink-0"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
                />
              </svg>
              Export ({whitelist.length})
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--color-border)] max-h-80 overflow-y-auto">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between px-4 py-2.5"
          >
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
        {whitelist.length > 0 && filtered.length === 0 && (
          <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">
            No emails match &ldquo;{filter.trim()}&rdquo;.
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
