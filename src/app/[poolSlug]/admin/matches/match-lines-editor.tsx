"use client";

import { useActionState } from "react";
import { updateMatchLinesAction } from "../actions-lines";
import type { AdminActionResult } from "../actions";
import type { MatchWithTeams } from "@/types/database";

interface MatchLinesEditorProps {
  match: MatchWithTeams;
  poolId: string;
  poolSlug: string;
}

const initial: AdminActionResult = { success: false };

/**
 * Inline editor for the three money-line columns on a match. Slotted
 * underneath the score-entry form on the expanded match card so admins
 * can enter results and lines in the same flow.
 *
 * Empty inputs clear the corresponding column (write NULL). The server
 * action validates the integer range and sign convention.
 */
export function MatchLinesEditor({
  match,
  poolId,
  poolSlug,
}: MatchLinesEditorProps) {
  const [state, action, pending] = useActionState(
    updateMatchLinesAction,
    initial
  );

  // Defensive: hide the form if the match has no teams. The picks form
  // only renders lines on cards where both teams are assigned, so an
  // unassigned slot wouldn't display lines anyway. Match-result-form
  // already gates its expansion on hasTeams, so this is just a guard.
  if (!match.home_team || !match.away_team) return null;

  return (
    <form
      action={action}
      className="pt-3 border-t border-[var(--color-border)] space-y-3"
    >
      <input type="hidden" name="matchId" value={match.id} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-[var(--color-text-secondary)]">
          Money lines (optional)
        </p>
        <p className="text-2xs text-[var(--color-text-muted)]">
          American odds. Leave blank to clear.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label
            htmlFor={`homeLine-${match.id}`}
            className="block text-2xs font-medium mb-1 truncate"
            title={match.home_team.name}
          >
            <span className="sm:hidden">{match.home_team.short_code}</span>
            <span className="hidden sm:inline">{match.home_team.name}</span>
          </label>
          <input
            id={`homeLine-${match.id}`}
            name="homeMoneyLine"
            type="text"
            inputMode="numeric"
            placeholder="-190"
            defaultValue={match.home_money_line ?? ""}
            // The pattern is a hint to mobile keyboards; the real
            // validation happens server-side in updateMatchLinesAction.
            pattern="^[+-]?[0-9]+$"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />
        </div>
        <div>
          <label
            htmlFor={`drawLine-${match.id}`}
            className="block text-2xs font-medium mb-1"
          >
            Draw
          </label>
          <input
            id={`drawLine-${match.id}`}
            name="drawMoneyLine"
            type="text"
            inputMode="numeric"
            placeholder="+330"
            defaultValue={match.draw_money_line ?? ""}
            pattern="^[+-]?[0-9]+$"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />
        </div>
        <div>
          <label
            htmlFor={`awayLine-${match.id}`}
            className="block text-2xs font-medium mb-1 truncate"
            title={match.away_team.name}
          >
            <span className="sm:hidden">{match.away_team.short_code}</span>
            <span className="hidden sm:inline">{match.away_team.name}</span>
          </label>
          <input
            id={`awayLine-${match.id}`}
            name="awayMoneyLine"
            type="text"
            inputMode="numeric"
            placeholder="+600"
            defaultValue={match.away_money_line ?? ""}
            pattern="^[+-]?[0-9]+$"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs min-h-[1rem]">
          {state.error && <span className="text-red-600">{state.error}</span>}
          {state.success && state.message && (
            <span className="text-pitch-600">{state.message}</span>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving..." : "Save lines"}
        </button>
      </div>
    </form>
  );
}
