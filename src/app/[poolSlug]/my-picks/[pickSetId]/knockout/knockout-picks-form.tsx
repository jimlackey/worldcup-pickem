"use client";

import { useActionState } from "react";
import { submitKnockoutPicksAction } from "../../actions";
import type { PickActionResult } from "../../actions";
import type { MatchWithTeams, Team, Pool, MatchPhase } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

interface KnockoutPicksFormProps {
  matches: MatchWithTeams[];
  teams: Team[];
  existingPicks: Record<string, string>;
  pickSetId: string;
  pool: Pool;
  isLocked: boolean;
}

const initial: PickActionResult = { success: false };
const phaseOrder: MatchPhase[] = ["r32", "r16", "qf", "sf", "final"];

export function KnockoutPicksForm({
  matches,
  teams,
  existingPicks,
  pickSetId,
  pool,
  isLocked,
}: KnockoutPicksFormProps) {
  const [state, action, pending] = useActionState(submitKnockoutPicksAction, initial);

  // Group by phase
  const grouped = new Map<MatchPhase, MatchWithTeams[]>();
  for (const phase of phaseOrder) {
    const phaseMatches = matches
      .filter((m) => m.phase === phase)
      .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));
    if (phaseMatches.length > 0) {
      grouped.set(phase, phaseMatches);
    }
  }

  // Build team lookup
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const totalSlots = matches.length;
  const filledSlots = Object.keys(existingPicks).length;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="pickSetId" value={pickSetId} />

      {/* Progress + save bar */}
      <div className="sticky top-14 z-30 bg-[var(--color-bg)] border-b border-[var(--color-border)] -mx-4 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-secondary)]">
          {filledSlots}/{totalSlots} picks made
        </span>

        <div className="flex items-center gap-2">
          {state.error && <span className="text-xs text-red-600">{state.error}</span>}
          {state.success && <span className="text-xs text-pitch-600">{state.message}</span>}

          {!isLocked && (
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Saving..." : "Save Knockout Picks"}
            </button>
          )}
        </div>
      </div>

      {/* Rounds */}
      {phaseOrder.map((phase) => {
        const phaseMatches = grouped.get(phase);
        if (!phaseMatches) return null;

        return (
          <section key={phase}>
            <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
              {PHASE_LABELS[phase]}
            </h2>
            <div className="space-y-2">
              {phaseMatches.map((match) => (
                <KnockoutMatchPick
                  key={match.id}
                  match={match}
                  teamMap={teamMap}
                  currentPick={existingPicks[match.id] ?? null}
                  isLocked={isLocked}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Bottom save */}
      {!isLocked && (
        <div className="pt-4">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-pitch-600 px-4 py-3 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors tap-target"
          >
            {pending ? "Saving..." : "Save Knockout Picks"}
          </button>
        </div>
      )}
    </form>
  );
}

function KnockoutMatchPick({
  match,
  teamMap,
  currentPick,
  isLocked,
}: {
  match: MatchWithTeams;
  teamMap: Map<string, Team>;
  currentPick: string | null;
  isLocked: boolean;
}) {
  const homeTeam = match.home_team_id ? teamMap.get(match.home_team_id) : null;
  const awayTeam = match.away_team_id ? teamMap.get(match.away_team_id) : null;

  // If teams aren't assigned yet, show placeholder
  if (!homeTeam || !awayTeam) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="flex items-center gap-2">
          <span className="text-2xs text-[var(--color-text-muted)] w-6">
            #{match.match_number}
          </span>
          <span className="text-sm text-[var(--color-text-muted)] italic">
            {match.label || "Teams TBD"}
          </span>
        </div>
      </div>
    );
  }

  const teams = [homeTeam, awayTeam];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xs text-[var(--color-text-muted)] w-6">
          #{match.match_number}
        </span>
        <div className="flex items-center gap-1.5">
          <TeamFlag flagCode={homeTeam.flag_code} teamName={homeTeam.name} shortCode={homeTeam.short_code} size="24x18" />
          <span className="text-sm font-medium">{homeTeam.short_code}</span>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">vs</span>
        <div className="flex items-center gap-1.5">
          <TeamFlag flagCode={awayTeam.flag_code} teamName={awayTeam.name} shortCode={awayTeam.short_code} size="24x18" />
          <span className="text-sm font-medium">{awayTeam.short_code}</span>
        </div>

        {match.status === "completed" && match.result && (
          <span className="ml-auto text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--color-surface-raised)]">
            {match.home_score}–{match.away_score}
          </span>
        )}
      </div>

      {/* Pick who wins */}
      <div className="grid grid-cols-2 gap-1.5">
        {teams.map((team) => {
          const isSelected = currentPick === team.id;
          const isCorrect =
            match.status === "completed" &&
            isSelected &&
            ((match.result === "home" && team.id === homeTeam.id) ||
              (match.result === "away" && team.id === awayTeam.id));
          const isWrong =
            match.status === "completed" && isSelected && !isCorrect;

          return (
            <label
              key={team.id}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md border py-2.5 text-xs font-medium cursor-pointer transition-all tap-target",
                isLocked && "cursor-default",
                isSelected && !isCorrect && !isWrong
                  ? "border-pitch-500 bg-pitch-50 text-pitch-700"
                  : "",
                isCorrect ? "border-correct bg-correct/10 text-correct" : "",
                isWrong ? "border-incorrect bg-incorrect/10 text-incorrect" : "",
                !isSelected && !isCorrect
                  ? "border-[var(--color-border)] hover:border-pitch-300 hover:bg-pitch-50/50"
                  : ""
              )}
            >
              <input
                type="radio"
                name={`knockout_${match.id}`}
                value={team.id}
                defaultChecked={isSelected}
                disabled={isLocked}
                className="sr-only"
              />
              <TeamFlag flagCode={team.flag_code} teamName={team.name} shortCode={team.short_code} size="16x12" />
              {team.short_code}
            </label>
          );
        })}
      </div>
    </div>
  );
}
