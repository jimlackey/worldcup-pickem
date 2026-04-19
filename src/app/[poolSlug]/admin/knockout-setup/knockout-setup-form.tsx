"use client";

import { useActionState } from "react";
import { assignKnockoutTeamsAction } from "../actions";
import type { AdminActionResult } from "../actions";
import type { MatchWithTeams, Team, MatchPhase } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";

interface KnockoutSetupFormProps {
  matches: MatchWithTeams[];
  teams: Team[];
  poolId: string;
  poolSlug: string;
}

const phaseOrder: MatchPhase[] = ["r32", "r16", "qf", "sf", "final"];

export function KnockoutSetupForm({
  matches,
  teams,
  poolId,
  poolSlug,
}: KnockoutSetupFormProps) {
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

  return (
    <div className="space-y-6">
      {phaseOrder.map((phase) => {
        const phaseMatches = grouped.get(phase);
        if (!phaseMatches) return null;

        return (
          <section key={phase}>
            <h3 className="text-sm font-semibold mb-2">{PHASE_LABELS[phase]}</h3>
            <div className="space-y-2">
              {phaseMatches.map((match) => (
                <KnockoutMatchRow
                  key={match.id}
                  match={match}
                  teams={teams}
                  poolId={poolId}
                  poolSlug={poolSlug}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KnockoutMatchRow({
  match,
  teams,
  poolId,
  poolSlug,
}: {
  match: MatchWithTeams;
  teams: Team[];
  poolId: string;
  poolSlug: string;
}) {
  const initial: AdminActionResult = { success: false };
  const [state, action, pending] = useActionState(assignKnockoutTeamsAction, initial);

  const hasTeams = match.home_team_id && match.away_team_id;

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
    >
      <input type="hidden" name="matchId" value={match.id} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-[var(--color-text-muted)] w-8 shrink-0">
          #{match.match_number}
        </span>

        <span className="text-xs text-[var(--color-text-muted)] w-24 shrink-0 truncate">
          {match.label}
        </span>

        <select
          name="homeTeamId"
          defaultValue={match.home_team_id ?? ""}
          className="flex-1 min-w-[140px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm focus:ring-2 focus:ring-pitch-500/40 outline-none"
        >
          <option value="">Home team...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_code} — {t.name}
            </option>
          ))}
        </select>

        <span className="text-xs text-[var(--color-text-muted)]">vs</span>

        <select
          name="awayTeamId"
          defaultValue={match.away_team_id ?? ""}
          className="flex-1 min-w-[140px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm focus:ring-2 focus:ring-pitch-500/40 outline-none"
        >
          <option value="">Away team...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_code} — {t.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-pitch-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "..." : hasTeams ? "Update" : "Set"}
        </button>
      </div>

      {state.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
      {state.success && <p className="text-xs text-pitch-600 mt-1">{state.message}</p>}
    </form>
  );
}
