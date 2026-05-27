"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  togglePickSetPaidAction,
  togglePickSetThirdPlacePaidAction,
  updatePickSetPaymentNotesAction,
  logPaymentsCsvExportAction,
} from "./actions";
import type { PaymentRow } from "@/lib/payments/queries";
import { cn } from "@/lib/utils/cn";

interface PaymentsViewProps {
  poolId: string;
  poolSlug: string;
  rows: PaymentRow[];
}

type SortKey = "email" | "pickSetName" | "isPaid";
type SortDir = "asc" | "desc";
type PaidFilter = "all" | "paid" | "unpaid";
type NotesFilter = "all" | "nonEmpty";

/**
 * Client-side Payments table.
 *
 * Server is the source of truth for paid/notes — every change goes
 * through a server action which revalidates the page and re-fetches
 * the rows. We keep a *local copy* of each row so the UI can update
 * optimistically: a paid-toggle click flips the toggle immediately
 * and the notes textbox is editable without round-tripping each
 * keystroke. The notes save fires on blur (not on every change),
 * which matches normal admin behaviour and keeps the audit log
 * legible.
 *
 * Sort: header-click cycles through asc → desc → (back to asc next
 * click of the same column, or jumping to another column starts at
 * asc). The default sort is by email ascending, which gives admins
 * a familiar alphabetical landing.
 *
 * CSV export: a button assembles a CSV string from the CURRENTLY
 * SORTED rows (so the export matches what the admin is seeing) and
 * triggers a download via a Blob URL. The export action is fired in
 * parallel to record the audit-log entry; the download itself does
 * not wait on the audit-log write.
 */
export function PaymentsView({ poolId, poolSlug, rows }: PaymentsViewProps) {
  // Local mirror of server rows. Two changes are tracked:
  //   - paid toggle (flips immediately, server reconciles on revalidate)
  //   - notes (edited locally, persisted on blur)
  const [localRows, setLocalRows] = useState<PaymentRow[]>(rows);

  // Resync local state when the server-supplied prop changes
  // (revalidatePath after a successful action re-renders the parent
  // with a fresh rows array). We compare a few key fields with
  // haveDifferentShape so we don't thrash setState on unrelated re-
  // renders.
  useEffect(() => {
    if (haveDifferentShape(localRows, rows)) {
      setLocalRows(rows);
    }
    // We intentionally exclude `localRows` from the dep array — we
    // only want to resync when the SERVER-supplied rows change. If
    // localRows is in the deps, the check would fire after every
    // optimistic update and immediately overwrite our optimistic
    // state with stale server data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const [sortKey, setSortKey] = useState<SortKey>("email");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Filters. Both default to "all" (no narrowing). Filters AND together:
  // a row must pass both to be visible. Applied BEFORE the sort so the
  // visible order reflects the visible set's natural ordering — sorting
  // a filtered list never re-arranges rows that have been hidden.
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [notesFilter, setNotesFilter] = useState<NotesFilter>("all");

  const filteredRows = useMemo(() => {
    if (paidFilter === "all" && notesFilter === "all") return localRows;
    return localRows.filter((r) => {
      if (paidFilter === "paid" && !r.isPaid) return false;
      if (paidFilter === "unpaid" && r.isPaid) return false;
      // "Non-empty" matches the trimmed string — pure whitespace
      // shouldn't count as a real note. Cheap to compute, avoids
      // surfacing rows with accidentally-typed spaces as "has notes".
      if (notesFilter === "nonEmpty" && r.notes.trim() === "") return false;
      return true;
    });
  }, [localRows, paidFilter, notesFilter]);

  const sortedRows = useMemo(() => {
    return sortRows(filteredRows, sortKey, sortDir);
  }, [filteredRows, sortKey, sortDir]);

  // "X of N marked paid" reflects the FULL pool, not the filtered view —
  // filters are about narrowing what you see, not what's been paid.
  // Using filteredRows here would make the count change as the admin
  // toggles filters, which would be confusing.
  const totalPaid = useMemo(
    () => localRows.filter((r) => r.isPaid).length,
    [localRows]
  );

  const isFiltering = paidFilter !== "all" || notesFilter !== "all";

  // Migration 024: column visibility is driven by whether ANY row in
  // the pool has a saved 3rd-place pick. The toggle and the team
  // display are wrapped in a "this pool has 3rd-place picks" gate so
  // pools that never enabled preseason_pick mode see no extra UI.
  //
  // We deliberately compute this from localRows (not from a separate
  // pool flag prop) so that a player saving their first 3rd-place
  // pick is reflected on the admin page the next render. A pool that
  // had the mode enabled, picks made, and then switched away still
  // shows the columns until the picks are cleared — which matches
  // the per-pick-set granularity admins expect.
  const hasAnyThirdPlace = useMemo(
    () => localRows.some((r) => r.thirdPlaceTeamName !== null),
    [localRows]
  );

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // ----- Paid toggle -----
  const handleTogglePaid = (row: PaymentRow) => {
    const desired = !row.isPaid;
    // Optimistic
    setLocalRows((prev) =>
      prev.map((r) =>
        r.pickSetId === row.pickSetId ? { ...r, isPaid: desired } : r
      )
    );

    const fd = new FormData();
    fd.set("poolId", poolId);
    fd.set("poolSlug", poolSlug);
    fd.set("pickSetId", row.pickSetId);
    fd.set("isPaid", desired ? "true" : "false");

    void togglePickSetPaidAction({ success: false }, fd).then((result) => {
      if (!result.success) {
        // Revert
        setLocalRows((prev) =>
          prev.map((r) =>
            r.pickSetId === row.pickSetId ? { ...r, isPaid: !desired } : r
          )
        );
      }
    });
  };

  // ----- 3rd-Place Paid toggle (migration 024) -----
  //
  // Same optimistic pattern as handleTogglePaid, against the independent
  // is_third_place_paid column. The UI only invokes this for rows that
  // have a saved 3rd-place pick (thirdPlaceTeamName !== null); the
  // server action accepts the write regardless but the surface enforces
  // the rule.
  const handleToggleThirdPlacePaid = (row: PaymentRow) => {
    const desired = !row.isThirdPlacePaid;
    setLocalRows((prev) =>
      prev.map((r) =>
        r.pickSetId === row.pickSetId
          ? { ...r, isThirdPlacePaid: desired }
          : r
      )
    );

    const fd = new FormData();
    fd.set("poolId", poolId);
    fd.set("poolSlug", poolSlug);
    fd.set("pickSetId", row.pickSetId);
    fd.set("isThirdPlacePaid", desired ? "true" : "false");

    void togglePickSetThirdPlacePaidAction({ success: false }, fd).then(
      (result) => {
        if (!result.success) {
          setLocalRows((prev) =>
            prev.map((r) =>
              r.pickSetId === row.pickSetId
                ? { ...r, isThirdPlacePaid: !desired }
                : r
            )
          );
        }
      }
    );
  };

  // ----- Notes edit (local) -----
  const handleNotesChange = (pickSetId: string, value: string) => {
    setLocalRows((prev) =>
      prev.map((r) =>
        r.pickSetId === pickSetId ? { ...r, notes: value } : r
      )
    );
  };

  // ----- Notes save (blur) -----
  // The "savedNotes" map tracks the most-recent server-known value per
  // row so a blur after no-op editing doesn't fire a redundant action
  // call. We seed it from the initial rows and update it on every
  // successful save.
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.pickSetId, r.notes]))
  );

  const handleNotesBlur = (row: PaymentRow) => {
    const current = row.notes;
    if ((savedNotes[row.pickSetId] ?? "") === current) return;

    const fd = new FormData();
    fd.set("poolId", poolId);
    fd.set("poolSlug", poolSlug);
    fd.set("pickSetId", row.pickSetId);
    fd.set("notes", current);

    void updatePickSetPaymentNotesAction({ success: false }, fd).then(
      (result) => {
        if (result.success) {
          setSavedNotes((prev) => ({ ...prev, [row.pickSetId]: current }));
        }
      }
    );
  };

  // ----- CSV export -----
  const [exportPending, startExport] = useTransition();
  const handleExport = () => {
    const csv = buildCsv(sortedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    // Trigger the download via a transient anchor — broadest browser
    // support for "save this string as a file". A standalone link in
    // the DOM that we click() would also work, but transient avoids
    // leaving the element around after the click.
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${poolSlug}-${todayStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // Log the export for the audit trail. Best-effort; if the audit
    // write fails we still gave the admin their file, which is the
    // primary intent of clicking the button.
    startExport(() => {
      const fd = new FormData();
      fd.set("poolId", poolId);
      fd.set("poolSlug", poolSlug);
      fd.set("rowCount", String(sortedRows.length));
      void logPaymentsCsvExportAction({ success: false }, fd);
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          No active pick sets yet. Payment tracking will appear here once
          players create pick sets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter toolbar — two independent dropdowns that AND together.
          Sits above the paid-count / Export toolbar so admins narrowing
          a long list see filters first; the export button stays close
          to where the result will appear.

          Each filter is a stock <select> rather than a fancy combobox
          — there are only 2-3 options apiece and the native control
          gives us correct keyboard a11y for free. */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          Paid
          <select
            value={paidFilter}
            onChange={(e) => setPaidFilter(e.target.value as PaidFilter)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
          >
            <option value="all">Show all</option>
            <option value="paid">Show paid only</option>
            <option value="unpaid">Show unpaid only</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          Notes
          <select
            value={notesFilter}
            onChange={(e) => setNotesFilter(e.target.value as NotesFilter)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
          >
            <option value="all">Show all</option>
            <option value="nonEmpty">Show non-empty notes</option>
          </select>
        </label>
        {isFiltering && (
          // Quick reset — easier than re-finding both dropdowns to set
          // them back. Hidden when both filters are at default to keep
          // the toolbar minimal in the common case.
          <button
            type="button"
            onClick={() => {
              setPaidFilter("all");
              setNotesFilter("all");
            }}
            className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-2 py-1 rounded hover:bg-[var(--color-surface-raised)] transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Status toolbar — paid count + export button. The count
          reflects the FULL pool (see comment on `totalPaid`); when a
          filter is active we also show the visible-row count so the
          admin can see how much the filter has narrowed things. */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-[var(--color-text-muted)]">
          <span className="tabular-nums font-medium text-[var(--color-text-secondary)]">
            {totalPaid}
          </span>{" "}
          of{" "}
          <span className="tabular-nums font-medium text-[var(--color-text-secondary)]">
            {localRows.length}
          </span>{" "}
          marked paid
          {isFiltering && (
            <>
              {" "}
              <span className="text-[var(--color-text-muted)]">
                ·{" "}
                <span className="tabular-nums">{filteredRows.length}</span>{" "}
                shown
              </span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exportPending}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Empty state for filter exclusion. Distinct from the "no
          active pick sets" empty state at the very top of the
          component, which only fires when the pool itself has zero
          pick sets. This one fires when filters have narrowed the list
          to nothing; the recovery is to relax the filters, hence the
          inline "clear filters" affordance. */}
      {sortedRows.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            No pick sets match the current filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setPaidFilter("all");
              setNotesFilter("all");
            }}
            className="mt-3 inline-block text-xs font-medium text-pitch-600 hover:text-pitch-700 transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}

      {sortedRows.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border border-[var(--color-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-raised)] text-left">
            <tr>
              <SortHeader
                label="Email"
                active={sortKey === "email"}
                dir={sortDir}
                onClick={() => handleSort("email")}
              />
              <SortHeader
                label="Player"
                active={sortKey === "pickSetName"}
                dir={sortDir}
                onClick={() => handleSort("pickSetName")}
              />
              <th className="px-3 py-2.5 font-semibold text-[var(--color-text-secondary)]">
                Winner Pick
              </th>
              <SortHeader
                label="Paid"
                active={sortKey === "isPaid"}
                dir={sortDir}
                onClick={() => handleSort("isPaid")}
              />
              {/* Migration 024: 3rd-place pick + paid toggle. Only
                  rendered when at least one pick set in the pool has
                  a saved 3rd-place pick. Two separate columns rather
                  than one combined cell so the toggle stays
                  vertically aligned with the main Paid column above. */}
              {hasAnyThirdPlace && (
                <>
                  <th className="px-3 py-2.5 font-semibold text-[var(--color-text-secondary)]">
                    3rd Place Pick
                  </th>
                  <th className="px-3 py-2.5 font-semibold text-[var(--color-text-secondary)]">
                    3rd Place Paid
                  </th>
                </>
              )}
              <th className="px-3 py-2.5 font-semibold text-[var(--color-text-secondary)]">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {sortedRows.map((row) => (
              <tr
                key={row.pickSetId}
                className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                <td className="px-3 py-2 truncate max-w-[14rem]">
                  {row.email}
                </td>
                <td className="px-3 py-2 truncate max-w-[12rem]">
                  {row.pickSetName}
                </td>
                <td className="px-3 py-2">
                  {row.winnerTeamName ? (
                    <span title={row.winnerTeamName}>
                      {row.winnerTeamCode}
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <PaidToggle
                    isPaid={row.isPaid}
                    onClick={() => handleTogglePaid(row)}
                  />
                </td>
                {/* Migration 024: 3rd-place pick cell and toggle. Per
                    spec — the toggle is only shown for pick sets that
                    have a saved 3rd-place pick; otherwise the cell
                    renders blank (the column itself stays so rows
                    line up horizontally). */}
                {hasAnyThirdPlace && (
                  <>
                    <td className="px-3 py-2">
                      {row.thirdPlaceTeamCode ? (
                        <span title={row.thirdPlaceTeamName ?? undefined}>
                          {row.thirdPlaceTeamCode}
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.thirdPlaceTeamName ? (
                        <PaidToggle
                          isPaid={row.isThirdPlacePaid}
                          onClick={() => handleToggleThirdPlacePaid(row)}
                        />
                      ) : (
                        // No pick → no toggle. Empty cell keeps the
                        // column alignment without prompting the
                        // admin to track a payment that doesn't apply.
                        <span className="text-[var(--color-text-muted)]" />
                      )}
                    </td>
                  </>
                )}
                <td className="px-3 py-2">
                  <NotesInput
                    value={row.notes}
                    onChange={(v) => handleNotesChange(row.pickSetId, v)}
                    onBlur={() => handleNotesBlur(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list. The table doesn't fit on phones and forcing
          horizontal scroll on a primary admin tool is hostile. Each card
          stacks the fields vertically with the paid toggle and notes
          textbox sitting at the bottom for thumb reach. */}
      <div className="md:hidden space-y-2">
        {/* Mobile sort affordance: a small select since there are only
            a few options and the desktop header-row controls don't
            translate. */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-text-muted)]">
            Sort by
          </label>
          <select
            value={`${sortKey}-${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split("-") as [SortKey, SortDir];
              setSortKey(k);
              setSortDir(d);
            }}
            className="text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1"
          >
            <option value="email-asc">Email (A→Z)</option>
            <option value="email-desc">Email (Z→A)</option>
            <option value="pickSetName-asc">Player (A→Z)</option>
            <option value="pickSetName-desc">Player (Z→A)</option>
            <option value="isPaid-desc">Paid first</option>
            <option value="isPaid-asc">Unpaid first</option>
          </select>
        </div>
        {sortedRows.map((row) => (
          <div
            key={row.pickSetId}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {row.pickSetName}
                </p>
                <p className="text-xs text-[var(--color-text-muted)] truncate">
                  {row.email}
                </p>
                {row.winnerTeamCode && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    <span title={row.winnerTeamName ?? undefined}>
                      Winner: {row.winnerTeamCode}
                    </span>
                  </p>
                )}
                {/* Migration 024: read-only 3rd-place pick under
                    Winner. Only renders when the player has made the
                    pick. The 3rd-place paid toggle sits below the
                    main Paid toggle (see further down) so admins
                    don't have to hunt through nested labels to find
                    each switch. */}
                {row.thirdPlaceTeamCode && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    <span title={row.thirdPlaceTeamName ?? undefined}>
                      3rd: {row.thirdPlaceTeamCode}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <PaidToggle
                  isPaid={row.isPaid}
                  onClick={() => handleTogglePaid(row)}
                />
                {/* Migration 024: 3rd-place paid toggle. Per spec — only
                    rendered when the pick exists. A small label above
                    keeps the two toggles unambiguous in a compact
                    mobile column. */}
                {row.thirdPlaceTeamName && (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-2xs text-[var(--color-text-muted)] uppercase tracking-wide">
                      3rd Place
                    </span>
                    <PaidToggle
                      isPaid={row.isThirdPlacePaid}
                      onClick={() => handleToggleThirdPlacePaid(row)}
                    />
                  </div>
                )}
              </div>
            </div>
            <NotesInput
              value={row.notes}
              onChange={(v) => handleNotesChange(row.pickSetId, v)}
              onBlur={() => handleNotesBlur(row)}
            />
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort header — clickable column heading with an asc/desc indicator
// ---------------------------------------------------------------------------

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2.5 font-semibold text-[var(--color-text-secondary)]">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition-colors",
          active
            ? "text-[var(--color-text)]"
            : "hover:text-[var(--color-text)]"
        )}
      >
        {label}
        <span
          aria-hidden="true"
          className={cn(
            "text-2xs leading-none",
            active
              ? "text-[var(--color-text-secondary)]"
              : "text-[var(--color-text-muted)] opacity-60"
          )}
        >
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Paid toggle — pill-style switch
// ---------------------------------------------------------------------------

function PaidToggle({
  isPaid,
  onClick,
}: {
  isPaid: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isPaid}
      className={cn(
        "inline-flex items-center justify-center min-w-[5rem] rounded-full px-2.5 py-1 text-xs font-medium border transition-colors shrink-0",
        isPaid
          ? "bg-pitch-100 text-pitch-700 border-pitch-200 hover:bg-pitch-200"
          : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-raised)]"
      )}
    >
      {isPaid ? "Paid" : "Unpaid"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Notes input — single-line textarea-like input that saves on blur
// ---------------------------------------------------------------------------

function NotesInput({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder="Add a note…"
      maxLength={1000}
      className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 transition-colors"
    />
  );
}

// ---------------------------------------------------------------------------
// Sort logic
// ---------------------------------------------------------------------------

function sortRows(
  rows: PaymentRow[],
  key: SortKey,
  dir: SortDir
): PaymentRow[] {
  // Stable secondary sort: pick set name. Keeps "Heather Collins 1/2/3"
  // grouped together within a sort by name, and gives deterministic
  // order when sorting by paid status (where many rows tie).
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary = comparePrimary(a, b, key) * sign;
    if (primary !== 0) return primary;
    // Secondary: pick set name ascending always (sign not applied — we
    // want consistent intra-group order regardless of primary direction).
    return a.pickSetName.localeCompare(b.pickSetName);
  });
}

function comparePrimary(
  a: PaymentRow,
  b: PaymentRow,
  key: SortKey
): number {
  switch (key) {
    case "email":
      return a.email.localeCompare(b.email);
    case "pickSetName":
      return a.pickSetName.localeCompare(b.pickSetName);
    case "isPaid":
      // Paid (true) sorts AFTER unpaid (false) in ascending order, so
      // "asc" puts unpaid on top. Inverting this with the desc sign
      // flips it.
      return Number(a.isPaid) - Number(b.isPaid);
  }
}

// ---------------------------------------------------------------------------
// CSV builder
// ---------------------------------------------------------------------------

/**
 * RFC 4180-flavoured CSV: comma delimiter, CRLF line endings, double-
 * quote any field that contains a comma, quote, or newline; escape
 * embedded double quotes by doubling them.
 *
 * We emit a BOM so Excel on Windows opens UTF-8 names correctly.
 */
function buildCsv(rows: PaymentRow[]): string {
  // Migration 024: add 3rd Place Pick / 3rd Place Paid columns. They
  // sit immediately after the existing Paid column so the CSV reads
  // naturally as "entry fee block, then 3rd-place block, then notes".
  // Empty strings for rows without a 3rd-place pick keep the
  // export rectangular and easy to import into Excel/Google Sheets.
  const header = [
    "Email",
    "Player",
    "Winner Pick",
    "Winner Code",
    "Paid",
    "3rd Place Pick",
    "3rd Place Code",
    "3rd Place Paid",
    "Notes",
  ];
  const lines: string[] = [header.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.email,
        r.pickSetName,
        r.winnerTeamName ?? "",
        r.winnerTeamCode ?? "",
        r.isPaid ? "Yes" : "No",
        r.thirdPlaceTeamName ?? "",
        r.thirdPlaceTeamCode ?? "",
        // For rows without a 3rd-place pick we emit an empty string
        // rather than "No" — the spec says the toggle is hidden in
        // that case, and the CSV should mirror the UI state to avoid
        // implying a tracked-but-unpaid status that doesn't exist.
        r.thirdPlaceTeamName ? (r.isThirdPlacePaid ? "Yes" : "No") : "",
        r.notes,
      ]
        .map(csvField)
        .join(",")
    );
  }
  // BOM + CRLF for maximum spreadsheet compatibility.
  return "\uFEFF" + lines.join("\r\n");
}

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Prop-resync helper — quick shape check so we don't thrash setState on
// renders where the parent re-rendered for an unrelated reason. We only
// resync when something we care about actually changed in the
// server-supplied array.
// ---------------------------------------------------------------------------

function haveDifferentShape(a: PaymentRow[], b: PaymentRow[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].pickSetId !== b[i].pickSetId) return true;
  }
  // Also resync if any server-supplied paid/notes diverges from local
  // — this happens after a successful action. We compare on a small
  // subset of fields rather than deep-equal everything.
  //
  // Migration 024: include the new is_third_place_paid flag and the
  // 3rd-place team data so a server-side change to either (or to a
  // player clearing their pick, which removes the team fields) is
  // reflected in the table the next render.
  for (let i = 0; i < a.length; i++) {
    if (a[i].isPaid !== b[i].isPaid) return true;
    if (a[i].notes !== b[i].notes) return true;
    if (a[i].isThirdPlacePaid !== b[i].isThirdPlacePaid) return true;
    if (a[i].thirdPlaceTeamCode !== b[i].thirdPlaceTeamCode) return true;
  }
  return false;
}
