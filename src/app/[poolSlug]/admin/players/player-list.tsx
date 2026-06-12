"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  deactivateParticipantAction,
  deactivatePickSetAction,
  promoteToAdminAction,
  demoteToPlayerAction,
  adminRenamePickSetAction,
  adminEditParticipantNameAction,
} from "../actions";
import type { AdminActionResult } from "../actions";
import type { PoolMembership, Participant, PickSet } from "@/types/database";
import { cn } from "@/lib/utils/cn";

interface PlayerListProps {
  members: (PoolMembership & { participant: Participant })[];
  pickSetsByParticipant: Record<string, PickSet[]>;
  poolId: string;
  poolSlug: string;
  /** The current session's participant id — used to hide the self-demote button. */
  currentParticipantId: string;
  /**
   * Whether group-phase picks are still editable. Drives whether the
   * "Edit group picks" link on each pick set row is clickable
   * (rendered active) or muted (still navigable for read-only view,
   * but visually deemphasized).
   */
  groupPhaseOpen: boolean;
  /**
   * Same flag for the knockout phase.
   */
  knockoutPhaseOpen: boolean;
  /**
   * Per-pick-set group-phase pick counts, keyed by pick_set_id. Drives
   * the "X of 72" display on each pick set row and the "has an empty
   * pick set" filter. Pick sets absent from the map have made zero
   * group picks (the helper omits zero-count rows).
   */
  groupPickCounts: Record<string, number>;
  /**
   * Per-pick-set MAIN payment status, keyed by pick_set_id. Drives the
   * Paid/Unpaid indicator on each pick set row and the "has an unpaid
   * pick set" filter. The separate 3rd-place payment is NOT reflected
   * here. Pick sets absent from the map are treated as unpaid.
   */
  paidByPickSet: Record<string, boolean>;
}

const initial: AdminActionResult = { success: false };

/** Total group-stage matches (#1–#72). Matches the standings page. */
const GROUP_MATCH_TOTAL = 72;

export function PlayerList({
  members,
  pickSetsByParticipant,
  poolId,
  poolSlug,
  currentParticipantId,
  groupPhaseOpen,
  knockoutPhaseOpen,
  groupPickCounts,
  paidByPickSet,
}: PlayerListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Expand All toggle. ON = every player row renders expanded so the
  // admin can scan all pick set info without clicking through rows;
  // OFF = the original accordion (one row open at a time, click to
  // toggle). The two states are independent: flipping Expand All off
  // returns to whatever single row (if any) was manually open before.
  const [expandAll, setExpandAll] = useState(false);

  // ---- Sort + filter toolbar state ----
  //
  // Sort: "added" preserves the incoming server order (= date added,
  // the page's original rendering); "email" re-sorts client-side,
  // case-insensitively. Sorting never mutates the prop array.
  //
  // Filter: case-insensitive substring match against the member's
  // email OR any of their pick set names. Pick set names are matched
  // from pickSetsByParticipant directly, so a name hit surfaces the
  // player even while the row (and Expand All) is collapsed.
  const [sortBy, setSortBy] = useState<"added" | "email">("added");
  const [filter, setFilter] = useState("");

  // Two boolean filters, applied on top of the text filter (AND). Both
  // operate at the player level but key off pick-set facts:
  //   - onlyEmpty:  keep players with AT LEAST ONE empty pick set
  //                 (0 group picks made — "0 of 72").
  //   - onlyUnpaid: keep players with AT LEAST ONE pick set whose MAIN
  //                 buy-in is unpaid (3rd-place payment is ignored).
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  const needle = filter.trim().toLowerCase();

  // Per-player predicates for the two boolean filters. Both ask "does
  // ANY of this player's pick sets satisfy the condition". A player
  // with no pick sets has no empty/unpaid pick set, so they're excluded
  // when either toggle is on (there's nothing to act on).
  const hasEmptyPickSet = (participantId: string) => {
    const pickSets = pickSetsByParticipant[participantId] ?? [];
    return pickSets.some((ps) => (groupPickCounts[ps.id] ?? 0) === 0);
  };
  const hasUnpaidPickSet = (participantId: string) => {
    const pickSets = pickSetsByParticipant[participantId] ?? [];
    return pickSets.some((ps) => !(paidByPickSet[ps.id] ?? false));
  };

  const visibleMembers = members
    .filter((member) => {
      // Text filter (email OR any pick set name).
      if (needle) {
        const emailHit = member.participant.email
          .toLowerCase()
          .includes(needle);
        const pickSets =
          pickSetsByParticipant[member.participant_id] ?? [];
        const nameHit = pickSets.some((ps) =>
          ps.name.toLowerCase().includes(needle)
        );
        if (!emailHit && !nameHit) return false;
      }
      // Boolean toggles (AND with each other and with the text filter).
      if (onlyEmpty && !hasEmptyPickSet(member.participant_id)) {
        return false;
      }
      if (onlyUnpaid && !hasUnpaidPickSet(member.participant_id)) {
        return false;
      }
      return true;
    })
    .sort((a, b) =>
      sortBy === "email"
        ? a.participant.email
            .toLowerCase()
            .localeCompare(b.participant.email.toLowerCase())
        : 0 // "added": keep server order. Array.prototype.sort is stable.
    );

  const anyFilterActive =
    needle.length > 0 || onlyEmpty || onlyUnpaid;

  return (
    <div className="space-y-3">
      {/* Toolbar: sort + freeform filter on the left, Expand All pill
          (same switch treatment as the Standings Show Details toggle)
          on the right. Wraps on narrow screens with the filter box
          taking the slack. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "added" | "email")}
          aria-label="Sort players"
          title="Sort players"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
        >
          <option value="added">Sort: Date Added</option>
          <option value="email">Sort: Email</option>
        </select>

        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by email or pick set name…"
          aria-label="Filter players by email or pick set name"
          className="flex-1 min-w-[180px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
        />

        {/* Boolean filter chips. Toggle-style, AND-combined with the
            text filter and each other. "Has empty pick set" surfaces
            players with at least one 0-of-72 pick set; "Has unpaid pick
            set" surfaces players with at least one main buy-in unpaid
            (3rd-place payment is not considered). */}
        <FilterChip
          active={onlyEmpty}
          onClick={() => setOnlyEmpty((v) => !v)}
          label="Has empty pick set"
          title="Show only players with at least one pick set that has no group picks (0 of 72)"
        />
        <FilterChip
          active={onlyUnpaid}
          onClick={() => setOnlyUnpaid((v) => !v)}
          label="Has unpaid pick set"
          title="Show only players with at least one pick set whose main payment is unpaid"
        />

        <button
          type="button"
          onClick={() => setExpandAll((v) => !v)}
          aria-pressed={expandAll}
          aria-label={
            expandAll
              ? "Collapse all players"
              : "Expand all players to show every pick set"
          }
          title={
            expandAll
              ? "Return to one-player-at-a-time view"
              : "Show pick set info for every player at once"
          }
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)] transition-colors"
        >
          <span className="font-medium">Expand All</span>
          <span
            aria-hidden="true"
            className={cn(
              "relative inline-block w-9 h-5 rounded-full transition-colors",
              expandAll
                ? "bg-pitch-600"
                : "bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                expandAll && "translate-x-4"
              )}
            />
          </span>
        </button>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
      {visibleMembers.map((member) => {
        const pickSets = pickSetsByParticipant[member.participant_id] ?? [];
        const isExpanded = expandAll || expandedId === member.participant_id;
        const isSelf = member.participant_id === currentParticipantId;

        return (
          <div key={member.id}>
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => {
                // While Expand All is on, the toggle is the single
                // source of truth — individual header clicks are
                // no-ops so a row can't silently disagree with the
                // switch state.
                if (expandAll) return;
                setExpandedId(isExpanded ? null : member.participant_id);
              }}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-surface-raised)] transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {member.participant.display_name || member.participant.email}
                  {isSelf && (
                    <span className="ml-1.5 text-2xs text-[var(--color-text-muted)]">
                      (you)
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {member.participant.email}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span
                  className={cn(
                    "text-2xs font-medium px-1.5 py-0.5 rounded-full",
                    member.role === "admin"
                      ? "bg-gold-100 text-gold-700"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  {member.role}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {pickSets.length} pick set{pickSets.length !== 1 ? "s" : ""}
                </span>
                <svg
                  className={cn(
                    "h-4 w-4 text-[var(--color-text-muted)] transition-transform",
                    isExpanded && "rotate-180"
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3">
                {/* Display name management. The header above shows
                    display_name || email; this row lets the admin set
                    or correct the name itself. NOTE: participants are
                    global rows — this name renders in every pool the
                    player belongs to, not just this one. */}
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    Name
                  </p>
                  <div className="flex-1 min-w-0">
                    <ParticipantNameEditor
                      poolId={poolId}
                      poolSlug={poolSlug}
                      participantId={member.participant_id}
                      currentName={member.participant.display_name}
                    />
                  </div>
                </div>

                {/* Role management */}
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    Role
                  </p>
                  {member.role === "player" ? (
                    <PromoteButton
                      participantId={member.participant_id}
                      poolId={poolId}
                      poolSlug={poolSlug}
                      disabled={!member.is_active}
                    />
                  ) : (
                    !isSelf && (
                      <DemoteButton
                        participantId={member.participant_id}
                        poolId={poolId}
                        poolSlug={poolSlug}
                      />
                    )
                  )}
                  {isSelf && member.role === "admin" && (
                    <span className="text-xs text-[var(--color-text-muted)] italic">
                      You can&apos;t demote yourself.
                    </span>
                  )}
                </div>

                {/* Pick sets */}
                {pickSets.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                      Pick Sets
                    </p>
                    {pickSets.map((ps) => (
                      <PickSetRow
                        key={ps.id}
                        pickSet={ps}
                        poolId={poolId}
                        poolSlug={poolSlug}
                        groupPhaseOpen={groupPhaseOpen}
                        knockoutPhaseOpen={knockoutPhaseOpen}
                        groupCount={groupPickCounts[ps.id] ?? 0}
                        isPaid={paidByPickSet[ps.id] ?? false}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    No pick sets created yet.
                  </p>
                )}

                {/* Deactivate participant — admins and non-admins alike, but not self */}
                {!isSelf && (
                  <DeactivateButton
                    type="participant"
                    id={member.participant_id}
                    poolId={poolId}
                    poolSlug={poolSlug}
                    label="Remove from pool"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {members.length === 0 && (
        <p className="px-4 py-8 text-sm text-[var(--color-text-muted)] text-center">
          No members yet.
        </p>
      )}

      {members.length > 0 && visibleMembers.length === 0 && (
        <p className="px-4 py-8 text-sm text-[var(--color-text-muted)] text-center">
          {anyFilterActive
            ? "No players match the current filters."
            : "No members yet."}
        </p>
      )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-pitch-500 bg-pitch-100 text-pitch-700"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)]"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-[3px] border transition-colors",
          active
            ? "border-pitch-600 bg-pitch-600"
            : "border-[var(--color-border)] bg-transparent"
        )}
      >
        {active && (
          <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-white">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.5 6.5l2.5 2.5 4.5-5"
            />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

function PromoteButton({
  participantId,
  poolId,
  poolSlug,
  disabled,
}: {
  participantId: string;
  poolId: string;
  poolSlug: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(promoteToAdminAction, initial);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />
      <button
        type="submit"
        disabled={pending || disabled}
        className="text-xs font-medium text-pitch-600 hover:text-pitch-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "Promoting..." : "Make admin"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function DemoteButton({
  participantId,
  poolId,
  poolSlug,
}: {
  participantId: string;
  poolId: string;
  poolSlug: string;
}) {
  const [state, action, pending] = useActionState(demoteToPlayerAction, initial);

  return (
    <form
      action={action}
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        if (!confirm("Demote this admin to a regular player?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] disabled:opacity-50 transition-colors"
      >
        {pending ? "Demoting..." : "Demote to player"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function PickSetRow({
  pickSet,
  poolId,
  poolSlug,
  groupPhaseOpen,
  knockoutPhaseOpen,
  groupCount,
  isPaid,
}: {
  pickSet: PickSet;
  poolId: string;
  poolSlug: string;
  groupPhaseOpen: boolean;
  knockoutPhaseOpen: boolean;
  groupCount: number;
  isPaid: boolean;
}) {
  const [state, action, pending] = useActionState(deactivatePickSetAction, initial);

  const isEmpty = groupCount === 0;
  const isComplete = groupCount >= GROUP_MATCH_TOTAL;

  return (
    <div className="rounded-md bg-[var(--color-surface-raised)] px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        {/* Name + inline rename affordance on the left. Editor handles
            its own view/edit toggle and dispatches to
            adminRenamePickSetAction. min-w-0 + flex-1 give the input
            room to grow without overflowing the row. */}
        <div className="flex-1 min-w-0">
          <PickSetNameEditor
            poolId={poolId}
            poolSlug={poolSlug}
            pickSetId={pickSet.id}
            currentName={pickSet.name}
          />
        </div>
        <form action={action} className="shrink-0">
          <input type="hidden" name="pickSetId" value={pickSet.id} />
          <input type="hidden" name="poolId" value={poolId} />
          <input type="hidden" name="poolSlug" value={poolSlug} />
          <button
            type="submit"
            disabled={pending}
            className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
          >
            {pending ? "..." : "Deactivate"}
          </button>
        </form>
      </div>

      {/* Per-pick-set status row: group-pick progress ("X of 72") and
          the MAIN payment indicator. The progress uses the same
          three-state colour coding as the standings page (green when
          complete, red at 0, amber in between); Paid is a simple
          green/amber pill. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "text-xs tabular-nums font-medium",
            isComplete
              ? "text-pitch-600"
              : isEmpty
                ? "text-red-600"
                : "text-amber-600"
          )}
          title={
            isEmpty
              ? "This pick set has no group picks"
              : `${groupCount} of ${GROUP_MATCH_TOTAL} group picks made`
          }
        >
          {groupCount} of {GROUP_MATCH_TOTAL}
          {isComplete && " ✓"}
        </span>
        <span
          className={cn(
            "text-2xs font-medium px-1.5 py-0.5 rounded-full",
            isPaid
              ? "bg-pitch-100 text-pitch-700"
              : "bg-amber-100 text-amber-700"
          )}
          title={
            isPaid
              ? "Main payment received"
              : "Main payment not yet received"
          }
        >
          {isPaid ? "Paid" : "Unpaid"}
        </span>
      </div>

      {/* Admin pick-edit affordances. Two links per pick set — one
          for each phase. Both pages are reachable regardless of
          phase-open state (the form renders read-only when locked,
          which is still useful for an admin to view picks), but the
          link styling is muted when the phase is locked so the
          admin's expectation matches reality. */}
      <div className="flex items-center gap-3 text-xs">
        <Link
          href={`/${poolSlug}/admin/players/edit-picks/${pickSet.id}`}
          className={cn(
            "transition-colors hover:underline",
            groupPhaseOpen
              ? "text-pitch-600 hover:text-pitch-700"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          )}
          title={
            groupPhaseOpen
              ? "Edit group-phase picks for this pick set"
              : "Group phase is locked — opens in read-only view"
          }
        >
          {groupPhaseOpen ? "Edit group picks" : "View group picks"}
        </Link>
        <Link
          href={`/${poolSlug}/admin/players/edit-picks/${pickSet.id}/knockout`}
          className={cn(
            "transition-colors hover:underline",
            knockoutPhaseOpen
              ? "text-pitch-600 hover:text-pitch-700"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          )}
          title={
            knockoutPhaseOpen
              ? "Edit knockout-bracket picks for this pick set"
              : "Knockout phase is locked or not yet open — opens in read-only view"
          }
        >
          {knockoutPhaseOpen ? "Edit knockout picks" : "View knockout picks"}
        </Link>
      </div>

      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </div>
  );
}

function DeactivateButton({
  type,
  id,
  poolId,
  poolSlug,
  label,
}: {
  type: "participant";
  id: string;
  poolId: string;
  poolSlug: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(deactivateParticipantAction, initial);

  return (
    <form action={action}>
      <input type="hidden" name="participantId" value={id} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
      >
        {pending ? "..." : label}
      </button>
      {state.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
    </form>
  );
}

// ----------------------------------------------------------------------------
// Inline participant display-name editor (admin-on-behalf)
// ----------------------------------------------------------------------------

/**
 * Same pencil-into-textbox UX as PickSetNameEditor below, but for the
 * player's display name ("User Name"). Dispatches
 * adminEditParticipantNameAction, which logs under
 * EDIT_PARTICIPANT_NAME with the old/new diff.
 *
 * currentName is nullable — players who joined via whitelist email and
 * never set a name have display_name = null (their row header falls
 * back to the email). View mode shows a muted "(no display name)"
 * placeholder in that case; saving always requires 1–50 chars, so this
 * editor can set or change a name but not clear one back to null.
 */
function ParticipantNameEditor({
  poolId,
  poolSlug,
  participantId,
  currentName,
}: {
  poolId: string;
  poolSlug: string;
  participantId: string;
  currentName: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentName ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, action, pending] = useActionState<
    AdminActionResult,
    FormData
  >(adminEditParticipantNameAction, initial);

  // Exit edit mode on success; resync draft from server truth after
  // revalidatePath refreshes the prop. Same pattern as the pick set
  // name editor.
  useEffect(() => {
    if (state.success) {
      setEditing(false);
    }
  }, [state.success]);

  useEffect(() => {
    setDraft(currentName ?? "");
  }, [currentName]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setDraft(currentName ?? "");
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(currentName ?? "");
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        {currentName ? (
          <span className="text-sm truncate">{currentName}</span>
        ) : (
          <span className="text-sm italic text-[var(--color-text-muted)]">
            (no display name)
          </span>
        )}
        <button
          type="button"
          onClick={startEdit}
          aria-label="Edit player display name"
          title="Edit name"
          className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />
      <input type="hidden" name="participantId" value={participantId} />
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          ref={inputRef}
          name="name"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          maxLength={50}
          minLength={1}
          required
          disabled={pending}
          placeholder="Display name"
          aria-label="Player display name"
          className="flex-1 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none disabled:opacity-50"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="rounded-md bg-pitch-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={pending}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}

// ----------------------------------------------------------------------------
// Inline pick set name editor (admin-on-behalf)
// ----------------------------------------------------------------------------

/**
 * Admin-side counterpart to the my-picks PickSetNameEditor. Same UX —
 * pencil icon flips into a textbox with Save/Cancel, Enter saves,
 * Escape cancels — but it dispatches adminRenamePickSetAction (which
 * skips the player-side ownership check and logs under
 * EDIT_PICK_SET_NAME instead of RENAME_PICK_SET so the audit log can
 * tell the two surfaces apart).
 *
 * Sized down vs the my-picks version because the row sits inside the
 * expanded-player section of the admin player list, which is denser
 * than the dashboard card. The icon is one shade muted by default and
 * lifts on hover; the input renders at text-sm to match the
 * surrounding row text instead of the larger display heading.
 */
function PickSetNameEditor({
  poolId,
  poolSlug,
  pickSetId,
  currentName,
}: {
  poolId: string;
  poolSlug: string;
  pickSetId: string;
  currentName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, action, pending] = useActionState<
    AdminActionResult,
    FormData
  >(adminRenamePickSetAction, initial);

  // Exit edit mode on success. revalidatePath in the action refreshes
  // currentName from the server; the prop-resync effect below picks
  // that up so the editor reopens from the new value.
  useEffect(() => {
    if (state.success) {
      setEditing(false);
    }
  }, [state.success]);

  // Keep the local draft in sync with the server-truth name. Standard
  // useActionState + useEffect resync pattern.
  useEffect(() => {
    setDraft(currentName);
  }, [currentName]);

  // Focus + select-all on enter edit mode so the admin can either
  // retype entirely or jump straight into the middle of the name.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setDraft(currentName);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(currentName);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm truncate">{currentName}</span>
        <button
          type="button"
          onClick={startEdit}
          aria-label="Edit pick set name"
          title="Edit name"
          className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
        >
          {/* Inline pencil SVG — matches the my-picks editor and the
              favorite-star pattern (no icon library). */}
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      </div>
    );
  }

  // Edit mode: form posts to adminRenamePickSetAction. <form action=...>
  // binding handles the transition internally so we don't need a
  // manual startTransition wrapper. Enter on the input submits.
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />
      <input type="hidden" name="pickSetId" value={pickSetId} />
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          ref={inputRef}
          name="name"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          maxLength={50}
          minLength={1}
          required
          disabled={pending}
          aria-label="Pick set name"
          className="flex-1 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none disabled:opacity-50"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="rounded-md bg-pitch-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={pending}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
