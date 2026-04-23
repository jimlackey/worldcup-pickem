"use client";

import { useActionState, useState } from "react";
import {
  updateGlobalTeamAction,
  type GlobalCountryActionResult,
} from "./actions";
import type { Group, Team } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

interface CountryManagerProps {
  groups: Group[];
  teamsByGroup: Map<string, Team[]>;
  ungrouped: Team[];
}

export function CountryManager({
  groups,
  teamsByGroup,
  ungrouped,
}: CountryManagerProps) {
  const sortedGroups = [...groups].sort((a, b) =>
    a.letter.localeCompare(b.letter)
  );

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(
    sortedGroups[0]?.id ?? null
  );

  return (
    <div className="space-y-3">
      {sortedGroups.map((group) => {
        const teams = teamsByGroup.get(group.id) ?? [];
        const isExpanded = expandedGroupId === group.id;

        return (
          <div
            key={group.id}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
          >
            <button
              type="button"
              onClick={() =>
                setExpandedGroupId(isExpanded ? null : group.id)
              }
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-surface-raised)] transition-colors"
              aria-expanded={isExpanded}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{group.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {teams.length} countr{teams.length === 1 ? "y" : "ies"}
                </p>
              </div>
              <svg
                className={cn(
                  "h-4 w-4 text-[var(--color-text-muted)] shrink-0 transition-transform",
                  isExpanded && "rotate-180"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isExpanded && (
              <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {teams.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">
                    No countries assigned to this group yet.
                  </p>
                ) : (
                  teams.map((team) => <CountryRow key={team.id} team={team} />)
                )}
              </div>
            )}
          </div>
        );
      })}

      {ungrouped.length > 0 && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <p className="text-sm font-semibold">Unassigned</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Countries with no group. Still editable.
            </p>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {ungrouped.map((team) => (
              <CountryRow key={team.id} team={team} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const initial: GlobalCountryActionResult = { success: false };

/**
 * One row per global country. Click row to expand edit form.
 * Identical shape to the per-pool CountryRow, but wired to the super-admin
 * action and omits the poolId/poolSlug hidden fields (super-admin action is
 * session-scoped).
 */
function CountryRow({ team }: { team: Team }) {
  const [expanded, setExpanded] = useState(false);
  const [state, action, pending] = useActionState(
    updateGlobalTeamAction,
    initial
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-surface-raised)] transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <TeamFlag
            flagCode={team.flag_code}
            teamName={team.name}
            shortCode={team.short_code}
            size="24x18"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{team.name}</p>
            <p className="text-xs text-[var(--color-text-muted)] font-mono">
              {team.short_code} · {team.flag_code}
            </p>
          </div>
        </div>
        <span className="text-xs text-[var(--color-text-muted)] shrink-0 ml-2">
          {expanded ? "Close" : "Edit"}
        </span>
      </button>

      {expanded && (
        <form
          action={action}
          className="px-4 pb-4 pt-1 space-y-3 bg-[var(--color-surface-raised)]/40"
        >
          <input type="hidden" name="teamId" value={team.id} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label
                htmlFor={`gname-${team.id}`}
                className="block text-xs font-medium mb-1"
              >
                Country name
              </label>
              <input
                id={`gname-${team.id}`}
                name="name"
                type="text"
                required
                maxLength={60}
                defaultValue={team.name}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
              />
            </div>

            <div>
              <label
                htmlFor={`gshort-${team.id}`}
                className="block text-xs font-medium mb-1"
              >
                Short code
              </label>
              <input
                id={`gshort-${team.id}`}
                name="shortCode"
                type="text"
                required
                maxLength={3}
                minLength={3}
                pattern="[A-Za-z]{3}"
                defaultValue={team.short_code}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-mono uppercase focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
              />
              <p className="text-2xs text-[var(--color-text-muted)] mt-1">
                3 letters. E.g. <span className="font-mono">USA</span>
              </p>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor={`gflag-${team.id}`}
                className="block text-xs font-medium mb-1"
              >
                Flag code
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`gflag-${team.id}`}
                  name="flagCode"
                  type="text"
                  required
                  maxLength={6}
                  minLength={2}
                  pattern="[a-z]{2}(-[a-z]{2,3})?"
                  defaultValue={team.flag_code}
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-mono lowercase focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
                />
                <TeamFlag
                  flagCode={team.flag_code}
                  teamName={team.name}
                  shortCode={team.short_code}
                  size="24x18"
                />
              </div>
              <p className="text-2xs text-[var(--color-text-muted)] mt-1">
                ISO alpha-2 or subdivision. E.g.{" "}
                <span className="font-mono">us</span>,{" "}
                <span className="font-mono">gb-eng</span>.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-h-[1rem] text-xs">
              {state.error && (
                <span className="text-red-600">{state.error}</span>
              )}
              {state.success && state.message && (
                <span className="text-pitch-600">{state.message}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-3 py-2 rounded-md hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-pitch-600 px-4 py-2 text-xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
              >
                {pending ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
