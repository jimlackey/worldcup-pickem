"use client";

import { useActionState, useState } from "react";
import { updateMatchLinesAction, type LinesActionResult } from "./actions";
import type { MatchWithTeams } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { formatMoneyLine } from "@/lib/lines/format";
import { cn } from "@/lib/utils/cn";

interface MatchLineRowProps {
  match: MatchWithTeams;
}

const initial: LinesActionResult = { success: false };

/**
 * A single match row with collapsible inline line editor. Closed state
 * shows just the matchup + current lines as muted text; clicking expands
 * to the 3-field edit form.
 *
 * Knockout matches with unassigned teams render in a disabled state with
 * a "Teams TBD" placeholder — you can't set lines until the teams are
 * known.
 */
export function MatchLineRow({ match }: MatchLineRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [state, action, pending] = useActionState(
    updateMatchLinesAction,
    initial
  );

  const hasTeams = match.home_team && match.away_team;

  // Current line preview for the closed-row summary.
  const homeLine = formatMoneyLine(match.home_money_line);
  const drawLine = formatMoneyLine(match.draw_money_line);
  const awayLine = formatMoneyLine(match.away_money_line);
  const anyLine = homeLine || drawLine || awayLine;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header — clickable when teams are assigned. */}
      <button
        type="button"
        onClick={() => hasTeams && setExpanded((v) => !v)}
        disabled={!hasTeams}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-surface-raised)] transition-colors disabled:opacity-50 disabled:cursor-default"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-xs text-[var(--color-text-muted)] w-8 shrink-0 tabular-nums">
            #{match.match_number}
          </span>

          {hasTeams ? (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <TeamFlag
                  flagCode={match.home_team!.flag_code}
                  teamName={match.home_team!.name}
                  shortCode={match.home_team!.short_code}
                  size="24x18"
                />
                <span className="text-sm font-medium truncate sm:hidden">
                  {match.home_team!.short_code}
                </span>
                <span className="text-sm font-medium truncate hidden sm:inline">
                  {match.home_team!.name}
                </span>
              </div>
              <span className="text-xs text-[var(--color-text-muted)] px-1">
                vs
              </span>
              <div className="flex items-center gap-1.5 min-w-0">
                <TeamFlag
                  flagCode={match.away_team!.flag_code}
                  teamName={match.away_team!.name}
                  shortCode={match.away_team!.short_code}
                  size="24x18"
                />
                <span className="text-sm font-medium truncate sm:hidden">
                  {match.away_team!.short_code}
                </span>
                <span className="text-sm font-medium truncate hidden sm:inline">
                  {match.away_team!.name}
                </span>
              </div>
            </>
          ) : (
            <span className="text-sm text-[var(--color-text-muted)] italic">
              {match.label || "Teams TBD"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-2">
          {/* Inline lines preview when collapsed. Renders as muted text
              so it doesn't compete with the team names for attention. */}
          {!expanded && anyLine && (
            <span className="text-2xs text-[var(--color-text-muted)] font-mono tabular-nums whitespace-nowrap">
              {homeLine ?? "—"} / {drawLine ?? "—"} / {awayLine ?? "—"}
            </span>
          )}
          {hasTeams && (
            <svg
              className={cn(
                "h-4 w-4 text-[var(--color-text-muted)] transition-transform",
                expanded && "rotate-180"
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
          )}
        </div>
      </button>

      {/* Expanded edit form. Same shape as the old pool-admin editor —
          three inputs, save button, optional clear via empty inputs. */}
      {expanded && hasTeams && (
        <form
          action={action}
          className="border-t border-[var(--color-border)] px-4 py-4 space-y-3"
        >
          <input type="hidden" name="matchId" value={match.id} />

          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">
              Money lines
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
                title={match.home_team!.name}
              >
                <span className="sm:hidden">{match.home_team!.short_code}</span>
                <span className="hidden sm:inline">{match.home_team!.name}</span>
              </label>
              <input
                id={`homeLine-${match.id}`}
                name="homeMoneyLine"
                type="text"
                inputMode="numeric"
                placeholder="-190"
                defaultValue={match.home_money_line ?? ""}
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
                title={match.away_team!.name}
              >
                <span className="sm:hidden">{match.away_team!.short_code}</span>
                <span className="hidden sm:inline">{match.away_team!.name}</span>
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
              {state.error && (
                <span className="text-red-600">{state.error}</span>
              )}
              {state.success && state.message && (
                <span className="text-pitch-600">{state.message}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-md px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-pitch-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
              >
                {pending ? "Saving..." : "Save lines"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
