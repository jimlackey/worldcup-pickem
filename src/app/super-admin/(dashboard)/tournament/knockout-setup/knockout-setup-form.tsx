"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignGlobalKnockoutTeamsAction,
  type GlobalMatchActionResult,
} from "../actions";
import type { MatchWithTeams, Team } from "@/types/database";

interface KnockoutSetupFormProps {
  matches: MatchWithTeams[];
  teams: Team[];
}

// ---------------------------------------------------------------------------
// Bracket wiring — mirrors the pool-admin version of this form so the
// super-admin view feels identical to whatever a pool admin would see on
// a demo pool. Only R32 slots are editable; deeper rounds appear as narrow
// read-only placeholders so the bracket shape is visible.
// ---------------------------------------------------------------------------

const LEFT_R32 = [73, 74, 75, 76, 77, 78, 79, 80];
const RIGHT_R32 = [81, 82, 83, 84, 85, 86, 87, 88];
const LEFT_R16 = [89, 90, 91, 92];
const RIGHT_R16 = [93, 94, 95, 96];
const LEFT_QF = [97, 98];
const RIGHT_QF = [99, 100];
const LEFT_SF = [101];
const RIGHT_SF = [102];
const FINAL = [103];

export function KnockoutSetupForm({ matches, teams }: KnockoutSetupFormProps) {
  const matchByNumber = new Map<number, MatchWithTeams>();
  for (const m of matches) {
    if (m.match_number != null) matchByNumber.set(m.match_number, m);
  }

  const standardNumbers = new Set<number>([
    ...LEFT_R32,
    ...RIGHT_R32,
    ...LEFT_R16,
    ...RIGHT_R16,
    ...LEFT_QF,
    ...RIGHT_QF,
    ...LEFT_SF,
    ...RIGHT_SF,
    ...FINAL,
  ]);
  const otherMatches = matches.filter(
    (m) => m.match_number == null || !standardNumbers.has(m.match_number)
  );

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns:
              "minmax(160px,1fr) 70px 70px 70px 90px 70px 70px 70px minmax(160px,1fr)",
            minWidth: 720,
          }}
        >
          <ColumnHeading>R32</ColumnHeading>
          <ColumnHeading>R16</ColumnHeading>
          <ColumnHeading>QF</ColumnHeading>
          <ColumnHeading>SF</ColumnHeading>
          <ColumnHeading>Final</ColumnHeading>
          <ColumnHeading>SF</ColumnHeading>
          <ColumnHeading>QF</ColumnHeading>
          <ColumnHeading>R16</ColumnHeading>
          <ColumnHeading>R32</ColumnHeading>

          <EditableColumn
            matchNumbers={LEFT_R32}
            matchByNumber={matchByNumber}
            teams={teams}
          />
          <PlaceholderColumn matchNumbers={LEFT_R16} />
          <PlaceholderColumn matchNumbers={LEFT_QF} />
          <PlaceholderColumn matchNumbers={LEFT_SF} center />
          <PlaceholderColumn matchNumbers={FINAL} center isFinal />
          <PlaceholderColumn matchNumbers={RIGHT_SF} center />
          <PlaceholderColumn matchNumbers={RIGHT_QF} />
          <PlaceholderColumn matchNumbers={RIGHT_R16} />
          <EditableColumn
            matchNumbers={RIGHT_R32}
            matchByNumber={matchByNumber}
            teams={teams}
          />
        </div>
      </div>

      {otherMatches.length > 0 && (
        <section className="pt-4">
          <h3 className="text-sm font-semibold mb-2 text-[var(--color-text-secondary)]">
            Other Matches
          </h3>
          <div className="space-y-2">
            {otherMatches.map((match) => (
              <KnockoutMatchCard key={match.id} match={match} teams={teams} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wide text-center pb-1">
      {children}
    </div>
  );
}

function EditableColumn({
  matchNumbers,
  matchByNumber,
  teams,
}: {
  matchNumbers: number[];
  matchByNumber: Map<number, MatchWithTeams>;
  teams: Team[];
}) {
  return (
    <div className="flex flex-col justify-around gap-2">
      {matchNumbers.map((mn) => {
        const match = matchByNumber.get(mn);
        if (!match) {
          return (
            <div
              key={mn}
              className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-2xs text-[var(--color-text-muted)] text-center"
            >
              #{mn} missing
            </div>
          );
        }
        return <KnockoutMatchCard key={match.id} match={match} teams={teams} />;
      })}
    </div>
  );
}

function PlaceholderColumn({
  matchNumbers,
  center,
  isFinal,
}: {
  matchNumbers: number[];
  center?: boolean;
  isFinal?: boolean;
}) {
  const justify = center ? "justify-center" : "justify-around";
  return (
    <div className={`flex flex-col ${justify} gap-2`}>
      {matchNumbers.map((mn) => (
        <div
          key={mn}
          className={`rounded border p-1.5 text-2xs text-center bg-[var(--color-surface)] ${
            isFinal
              ? "border-gold-300 text-gold-700"
              : "border-[var(--color-border)] text-[var(--color-text-muted)]"
          }`}
        >
          #{mn}
        </div>
      ))}
    </div>
  );
}

const initial: GlobalMatchActionResult = { success: false };

function KnockoutMatchCard({
  match,
  teams,
}: {
  match: MatchWithTeams;
  teams: Team[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    assignGlobalKnockoutTeamsAction,
    initial
  );
  const [homeTeamId, setHomeTeamId] = useState(match.home_team_id ?? "");
  const [awayTeamId, setAwayTeamId] = useState(match.away_team_id ?? "");

  useEffect(() => {
    setHomeTeamId(match.home_team_id ?? "");
  }, [match.home_team_id]);
  useEffect(() => {
    setAwayTeamId(match.away_team_id ?? "");
  }, [match.away_team_id]);

  // After a save, force a refresh so the page picks up any cascading
  // changes (downstream slot population if any later-round result was
  // entered, etc.).
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  const hasTeams = match.home_team_id && match.away_team_id;

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
    >
      <input type="hidden" name="matchId" value={match.id} />

      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-2xs font-medium text-[var(--color-text-muted)]">
          #{match.match_number}
        </span>
        <span className="text-2xs text-[var(--color-text-muted)] truncate text-right min-w-0 flex-1">
          {match.label}
        </span>
      </div>

      <div className="space-y-1.5">
        <select
          name="homeTeamId"
          value={homeTeamId}
          onChange={(e) => setHomeTeamId(e.target.value)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-2xs focus:ring-2 focus:ring-pitch-500/40 outline-none"
        >
          <option value="">Home...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_code} — {t.name}
            </option>
          ))}
        </select>

        <select
          name="awayTeamId"
          value={awayTeamId}
          onChange={(e) => setAwayTeamId(e.target.value)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-2xs focus:ring-2 focus:ring-pitch-500/40 outline-none"
        >
          <option value="">Away...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_code} — {t.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-pitch-600 px-2 py-1 text-2xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "..." : hasTeams ? "Update" : "Assign"}
        </button>

        {state.error && (
          <p className="text-2xs text-red-600">{state.error}</p>
        )}
      </div>
    </form>
  );
}
