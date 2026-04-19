"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import type { AuditLogEntry } from "@/types/database";
import { cn } from "@/lib/utils/cn";

interface AuditLogTableProps {
  entries: AuditLogEntry[];
  uniqueActions: string[];
  currentPage: number;
  totalPages: number;
  totalEntries: number;
  poolSlug: string;
  currentFilters: { page?: string; action?: string; actor?: string };
}

export function AuditLogTable({
  entries,
  uniqueActions,
  currentPage,
  totalPages,
  totalEntries,
  poolSlug,
  currentFilters,
}: AuditLogTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function applyFilters(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { ...currentFilters, ...updates };
    for (const [key, val] of Object.entries(merged)) {
      if (val && key !== "page") params.set(key, val);
    }
    if (updates.page && updates.page !== "1") params.set("page", updates.page);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={currentFilters.action ?? ""}
          onChange={(e) =>
            applyFilters({ action: e.target.value || undefined, page: "1" })
          }
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm focus:ring-2 focus:ring-pitch-500/40 outline-none"
        >
          <option value="">All actions</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filter by actor email..."
          defaultValue={currentFilters.actor ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              applyFilters({
                actor: (e.target as HTMLInputElement).value || undefined,
                page: "1",
              });
            }
          }}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm focus:ring-2 focus:ring-pitch-500/40 outline-none"
        />

        <span className="text-xs text-[var(--color-text-muted)] self-center ml-auto">
          {totalEntries} entries
        </span>
      </div>

      {/* Entries */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)] overflow-hidden">
        {entries.map((entry) => {
          const isExpanded = expandedId === entry.id;

          return (
            <div key={entry.id}>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                <span className="text-xs text-[var(--color-text-muted)] shrink-0 w-36 pt-0.5">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm">
                    <span className="font-medium">{entry.actor_email}</span>
                    <span className="text-[var(--color-text-muted)]">
                      {" "}({entry.actor_role})
                    </span>
                  </span>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {entry.action.replace(/_/g, " ")}
                    {entry.entity_type && (
                      <span className="text-[var(--color-text-muted)]">
                        {" "}on {entry.entity_type}
                      </span>
                    )}
                  </p>
                </div>
                <svg
                  className={cn(
                    "h-4 w-4 text-[var(--color-text-muted)] shrink-0 mt-1 transition-transform",
                    isExpanded && "rotate-180"
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  {entry.entity_id && (
                    <Detail label="Entity ID" value={entry.entity_id} />
                  )}
                  {entry.ip_address && (
                    <Detail label="IP" value={entry.ip_address} />
                  )}
                  {entry.old_value && (
                    <div>
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                        Old Value
                      </p>
                      <pre className="text-xs bg-[var(--color-surface-raised)] rounded p-2 overflow-x-auto">
                        {JSON.stringify(entry.old_value, null, 2)}
                      </pre>
                    </div>
                  )}
                  {entry.new_value && (
                    <div>
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                        New Value
                      </p>
                      <pre className="text-xs bg-[var(--color-surface-raised)] rounded p-2 overflow-x-auto">
                        {JSON.stringify(entry.new_value, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {entries.length === 0 && (
          <p className="px-4 py-8 text-sm text-[var(--color-text-muted)] text-center">
            No audit log entries yet.
          </p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => applyFilters({ page: String(currentPage - 1) })}
            className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] disabled:opacity-40 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-[var(--color-text-muted)]">
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => applyFilters({ page: String(currentPage + 1) })}
            className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] disabled:opacity-40 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs">
      <span className="text-[var(--color-text-muted)]">{label}: </span>
      <span className="font-mono">{value}</span>
    </p>
  );
}
