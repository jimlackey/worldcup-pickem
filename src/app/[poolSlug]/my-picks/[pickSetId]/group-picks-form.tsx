"use client";

import { useActionState } from "react";
import { submitGroupPicksAction } from "../actions";
import type { PickActionResult } from "../actions";
import type { MatchWithTeams, Group, Pool } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

interface GroupPicksFormProps {
  matches: MatchWithTeams[];
  groups: Group[];
  existingPicks: Record<string, string>;
  pickSetId: string;
  pool: Pool;
  isLocked: boolean;
}

const initial: PickActionResult = { success: false };

export function GroupPicksForm({
  matches,
  groups,
  existingPicks,
  pickSetId,
  pool,
  isLocked,
}: GroupPicksFormProps) {
  const [state, action, pending] = useActionState(submitGroupPicksAction, initial);

  // Group matches by group
  const matchesByGroup = new Map<string, MatchWithTeams[]>();
  for (const match of matches) {
    if (!match.group_id) continue;
    const existing = matchesByGroup.get(match.group_id) ?? [];
    existing.push(match);
    matchesByGroup.set(match.group_id, existing);
  }

  // Sort groups by letter
  const sortedGroups = [...groups].sort((a, b) => a.letter.localeCompare(b.letter));

  const totalPicks = Object.keys(existingPicks).length;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="pickSetId" value={pickSetId} />

      {/* Progress + save bar */}
      <div className="sticky top-14 z-30 bg-[var(--color-bg)] border-b border-[var(--color-border)] -mx-4 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-secondary)]">
          {totalPicks}/72 picks made
        </span>

        <div className="flex items-center gap-2">
          {state.error && (
            <span className="text-xs text-red-600">{state.error}</span>
          )}
          {state.success && (
            <span className="text-xs text-pitch-600">{state.message}</span>
          )}

          {!isLocked && (
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Saving..." : "Save All Picks"}
            </button>
          )}
        </div>
      </div>

      {/* Groups */}
      {sortedGroups.map((group) => {
        const groupMatches = matchesByGroup.get(group.id) ?? [];
        if (groupMatches.length === 0) return null;

        return (
          <section key={group.id}>
            <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
              {group.name}
            </h2>
            <div className="space-y-2">
              {groupMatches
                .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))
                .map((match) => (
                  <MatchPickCard
                    key={match.id}
                    match={match}
                    currentPick={existingPicks[match.id] ?? null}
                    isLocked={isLocked}
                  />
                ))}
            </div>
          </section>
        );
      })}

      {/* Bottom save button */}
      {!isLocked && (
        <div className="pt-4">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-pitch-600 px-4 py-3 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors tap-target"
          >
            {pending ? "Saving..." : "Save All Picks"}
          </button>
        </div>
      )}
    </form>
  );
}

function MatchPickCard({
  match,
  currentPick,
  isLocked,
}: {
  match: MatchWithTeams;
  currentPick: string | null;
  isLocked: boolean;
}) {
  if (!match.home_team || !match.away_team) return null;

  const options = [
    { value: "home", label: match.home_team.short_code },
    { value: "draw", label: "Draw" },
    { value: "away", label: match.away_team.short_code },
  ];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xs text-[var(--color-text-muted)] w-6">
          #{match.match_number}
        </span>
        <div className="flex items-center gap-1.5">
          <TeamFlag
            flagCode={match.home_team.flag_code}
            teamName={match.home_team.name}
            shortCode={match.home_team.short_code}
            size="24x18"
          />
          <span className="text-sm font-medium">{match.home_team.short_code}</span>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">vs</span>
        <div className="flex items-center gap-1.5">
          <TeamFlag
            flagCode={match.away_team.flag_code}
            teamName={match.away_team.name}
            shortCode={match.away_team.short_code}
            size="24x18"
          />
          <span className="text-sm font-medium">{match.away_team.short_code}</span>
        </div>

        {/* Show result if completed */}
        {match.status === "completed" && match.result && (
          <span className="ml-auto text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--color-surface-raised)]">
            {match.home_score}–{match.away_score}
          </span>
        )}
      </div>

      {/* Pick selector */}
      <div className="grid grid-cols-3 gap-1.5">
        {options.map((opt) => {
          const isSelected = currentPick === opt.value;
          const isCorrect =
            match.status === "completed" && match.result === opt.value;
          const isWrong =
            match.status === "completed" &&
            isSelected &&
            match.result !== opt.value;

          return (
            <label
              key={opt.value}
              className={cn(
                "flex items-center justify-center rounded-md border py-2 text-xs font-medium cursor-pointer transition-all tap-target",
                isLocked && "cursor-default",
                isSelected && !isCorrect && !isWrong
                  ? "border-pitch-500 bg-pitch-50 text-pitch-700"
                  : "",
                isCorrect
                  ? "border-correct bg-correct/10 text-correct"
                  : "",
                isWrong
                  ? "border-incorrect bg-incorrect/10 text-incorrect"
                  : "",
                !isSelected && !isCorrect
                  ? "border-[var(--color-border)] hover:border-pitch-300 hover:bg-pitch-50/50"
                  : ""
              )}
            >
              <input
                type="radio"
                name={`pick_${match.id}`}
                value={opt.value}
                defaultChecked={isSelected}
                disabled={isLocked}
                className="sr-only"
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
