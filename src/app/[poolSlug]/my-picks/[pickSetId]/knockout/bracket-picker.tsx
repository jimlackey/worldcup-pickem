"use client";

import { useActionState, useState, useCallback, useMemo } from "react";
import { submitKnockoutPicksAction } from "../../actions";
import type { PickActionResult } from "../../actions";
import type { MatchWithTeams, Team, Pool } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";
import {
  BRACKET_FEEDERS,
  CONSOLATION_FEEDERS,
  CONSOLATION_MATCH_NUMBER,
  knockoutTotalCount,
} from "@/lib/picks/bracket-wiring";

interface BracketPickerProps {
  matches: MatchWithTeams[];
  teams: Team[];
  existingPicks: Record<string, string>;
  pickSetId: string;
  pool: Pool;
  isLocked: boolean;
}

type BracketPicks = Record<string, string | null>; // matchId → teamId

const initial: PickActionResult = { success: false };

export function BracketPicker({
  matches,
  teams,
  existingPicks,
  pickSetId,
  pool,
  isLocked,
}: BracketPickerProps) {
  const [state, action, pending] = useActionState(submitKnockoutPicksAction, initial);

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const matchByNumber = useMemo(() => {
    const m = new Map<number, MatchWithTeams>();
    for (const match of matches) {
      if (match.match_number) m.set(match.match_number, match);
    }
    return m;
  }, [matches]);
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  // Initialize picks state from existing picks
  const [picks, setPicks] = useState<BracketPicks>(() => {
    const p: BracketPicks = {};
    for (const m of matches) {
      p[m.id] = existingPicks[m.id] ?? null;
    }
    return p;
  });

  // Whether the consolation match is part of this pool's bracket. Driven
  // entirely off the pool flag — the matches array is already pre-filtered
  // upstream, so this only affects layout (do we render the consolation
  // slot?) and progress totals.
  const consolationEnabled = pool.consolation_match_enabled;

  /**
   * Resolve the home/away teams for a non-consolation knockout slot.
   *
   * Priority per side:
   *   1. Admin-assigned (only ever set on R32 or after a feeder is decided)
   *   2. Picked winner of the feeder match (cascading)
   *
   * Consolation has its own resolver below — it's fed by feeder LOSERS,
   * not winners, so the polarity is flipped.
   */
  const getMatchTeams = useCallback(
    (matchNumber: number): { home: Team | null; away: Team | null } => {
      const match = matchByNumber.get(matchNumber);
      if (!match) return { home: null, away: null };

      const feeders = BRACKET_FEEDERS[matchNumber];
      if (!feeders) {
        // R32 match — teams come from admin assignment
        const home = match.home_team_id ? teamMap.get(match.home_team_id) ?? null : null;
        const away = match.away_team_id ? teamMap.get(match.away_team_id) ?? null : null;
        return { home, away };
      }

      // Later round — teams come from winners of feeder matches
      const [feederA, feederB] = feeders;
      const feederAMatch = matchByNumber.get(feederA);
      const feederBMatch = matchByNumber.get(feederB);

      let home: Team | null = null;
      let away: Team | null = null;

      // Check if admin has set the team (actual result), else use player's pick
      if (feederAMatch) {
        if (feederAMatch.status === "completed" && feederAMatch.result) {
          // Actual result — use the real winner
          const winnerId =
            feederAMatch.result === "home"
              ? feederAMatch.home_team_id
              : feederAMatch.away_team_id;
          home = winnerId ? teamMap.get(winnerId) ?? null : null;
        } else {
          // Use player's pick as the cascading winner
          const pickedId = picks[feederAMatch.id];
          home = pickedId ? teamMap.get(pickedId) ?? null : null;
        }
      }

      if (feederBMatch) {
        if (feederBMatch.status === "completed" && feederBMatch.result) {
          const winnerId =
            feederBMatch.result === "home"
              ? feederBMatch.home_team_id
              : feederBMatch.away_team_id;
          away = winnerId ? teamMap.get(winnerId) ?? null : null;
        } else {
          const pickedId = picks[feederBMatch.id];
          away = pickedId ? teamMap.get(pickedId) ?? null : null;
        }
      }

      return { home, away };
    },
    [matchByNumber, teamMap, picks]
  );

  /**
   * Resolve home/away for the consolation match. The consolation match
   * is contested between the LOSING semifinalists, so each side resolves
   * by inverting the feeder's outcome:
   *
   *   - If the feeder semifinal is completed: the loser of that match.
   *   - If undecided but the player has picked a winner for the feeder:
   *     the OTHER team in the feeder (the one they picked AGAINST).
   *   - If undecided AND unpicked OR the feeder doesn't yet have both
   *     teams resolved: TBD.
   *
   * Slot order matches CONSOLATION_FEEDERS — feederA (#101) → home,
   * feederB (#102) → away.
   */
  const getConsolationTeams = useCallback((): { home: Team | null; away: Team | null } => {
    const [feederA, feederB] = CONSOLATION_FEEDERS;

    const resolveLoser = (feederMatchNumber: number): Team | null => {
      const feederMatch = matchByNumber.get(feederMatchNumber);
      if (!feederMatch) return null;

      // Semifinal completed → the actual loser
      if (feederMatch.status === "completed" && feederMatch.result) {
        const loserId =
          feederMatch.result === "home"
            ? feederMatch.away_team_id
            : feederMatch.home_team_id;
        return loserId ? teamMap.get(loserId) ?? null : null;
      }

      // Otherwise: player has to have BOTH semifinal teams resolved AND
      // picked a winner for us to know who the loser is.
      const { home: sfHome, away: sfAway } = getMatchTeams(feederMatchNumber);
      if (!sfHome || !sfAway) return null;
      const winnerPick = picks[feederMatch.id];
      if (!winnerPick) return null;
      // Loser is whichever of the two SF teams isn't the picked winner.
      if (winnerPick === sfHome.id) return sfAway;
      if (winnerPick === sfAway.id) return sfHome;
      // Pick references a team that isn't actually in the SF (shouldn't
      // happen with cascade-clearing, but be defensive).
      return null;
    };

    return {
      home: resolveLoser(feederA),
      away: resolveLoser(feederB),
    };
  }, [matchByNumber, teamMap, picks, getMatchTeams]);

  // Pick a winner — cascade: clear downstream picks if the eliminated team was picked there
  const handlePick = useCallback(
    (matchId: string, teamId: string) => {
      if (isLocked) return;

      setPicks((prev) => {
        const next = { ...prev };
        const oldPick = next[matchId];
        next[matchId] = teamId;

        // If changing a pick, clear downstream picks that depended on the old winner
        if (oldPick && oldPick !== teamId) {
          clearDownstreamPicks(next, matchId, oldPick);
        }

        // Special-case: changing a semifinal pick also invalidates a
        // consolation pick that referenced either semifinalist. The
        // consolation match's teams are derived from the SF "losers", so
        // any change to who wins SF1 or SF2 changes who the consolation
        // contestants are. If the existing consolation pick references a
        // team that's no longer eligible (i.e. not the new loser of either
        // SF), we clear it.
        if (consolationEnabled) {
          maybeInvalidateConsolation(next, matchId);
        }

        return next;
      });
    },
    [isLocked, consolationEnabled]
  );

  /**
   * If the changed match was a semifinal AND the player has a consolation
   * pick that references a team no longer projected to be in the
   * consolation, clear that consolation pick. Reading from `picksState`
   * keeps the function pure-ish over the just-mutated map.
   */
  function maybeInvalidateConsolation(
    picksState: BracketPicks,
    changedMatchId: string
  ) {
    const changedMatch = matchById.get(changedMatchId);
    if (!changedMatch?.match_number) return;
    if (changedMatch.match_number !== 101 && changedMatch.match_number !== 102) {
      return;
    }

    const consolationMatch = matchByNumber.get(CONSOLATION_MATCH_NUMBER);
    if (!consolationMatch) return;
    const currentConsolationPick = picksState[consolationMatch.id];
    if (!currentConsolationPick) return;

    // Project who the consolation contestants would be given the just-mutated
    // picks state. We use a tiny inline projection rather than calling
    // getConsolationTeams() because that one closes over the *outer* picks
    // state, which is stale here.
    const projectedLoser = (sfMatchNumber: number): string | null => {
      const sfMatch = matchByNumber.get(sfMatchNumber);
      if (!sfMatch) return null;
      if (sfMatch.status === "completed" && sfMatch.result) {
        return sfMatch.result === "home" ? sfMatch.away_team_id : sfMatch.home_team_id;
      }
      // Use the freshly mutated picks map.
      const winnerPick = picksState[sfMatch.id];
      if (!winnerPick) return null;
      const { home, away } = getMatchTeams(sfMatchNumber);
      if (!home || !away) return null;
      if (winnerPick === home.id) return away.id;
      if (winnerPick === away.id) return home.id;
      return null;
    };

    const eligibleA = projectedLoser(101);
    const eligibleB = projectedLoser(102);
    if (
      currentConsolationPick !== eligibleA &&
      currentConsolationPick !== eligibleB
    ) {
      picksState[consolationMatch.id] = null;
    }
  }

  // Recursively clear picks in later rounds if they referenced an eliminated team
  function clearDownstreamPicks(
    picksState: BracketPicks,
    changedMatchId: string,
    eliminatedTeamId: string
  ) {
    const changedMatch = matchById.get(changedMatchId);
    if (!changedMatch?.match_number) return;

    // Find any match that is fed by this match
    for (const [laterNum, [feederA, feederB]] of Object.entries(BRACKET_FEEDERS)) {
      if (
        changedMatch.match_number === feederA ||
        changedMatch.match_number === feederB
      ) {
        const laterMatch = matchByNumber.get(parseInt(laterNum));
        if (!laterMatch) continue;

        // If the later match's pick was the eliminated team, clear it
        if (picksState[laterMatch.id] === eliminatedTeamId) {
          picksState[laterMatch.id] = null;
          // Recurse further downstream
          clearDownstreamPicks(picksState, laterMatch.id, eliminatedTeamId);
        }
      }
    }
  }

  // Count picks made
  const totalSlots = matches.filter((m) => {
    const mn = m.match_number;
    if (!mn) return false;
    if (mn >= 73 && mn <= 88) {
      // R32 — only count if admin has assigned teams
      return m.home_team_id && m.away_team_id;
    }
    return true;
  }).length;
  const filledPicks = Object.values(picks).filter(Boolean).length;

  // Bracket layout — split into left/right halves
  const leftR32 = [73, 74, 75, 76, 77, 78, 79, 80];
  const rightR32 = [81, 82, 83, 84, 85, 86, 87, 88];
  const leftR16 = [89, 90, 91, 92];
  const rightR16 = [93, 94, 95, 96];
  const leftQF = [97, 98];
  const rightQF = [99, 100];
  const leftSF = [101];
  const rightSF = [102];
  const finalMatch = [103];

  // Resolve the consolation slot once per render so the inputs and the
  // displayed contestants stay in lockstep with the latest picks state.
  const consolationMatch = consolationEnabled
    ? matchByNumber.get(CONSOLATION_MATCH_NUMBER) ?? null
    : null;
  const consolationTeams = consolationMatch ? getConsolationTeams() : null;
  const consolationPick = consolationMatch ? picks[consolationMatch.id] ?? null : null;

  // Pick handler for the consolation slot. Wraps handlePick but does NOT
  // need any of the cascade plumbing since nothing is downstream of #104.
  const handleConsolationPick = useCallback(
    (teamId: string) => {
      if (!consolationMatch || isLocked) return;
      setPicks((prev) => ({ ...prev, [consolationMatch.id]: teamId }));
    },
    [consolationMatch, isLocked]
  );

  return (
    <form action={action}>
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="pickSetId" value={pickSetId} />

      {/* Hidden inputs for form submission */}
      {Object.entries(picks).map(
        ([matchId, teamId]) =>
          teamId && (
            <input key={matchId} type="hidden" name={`knockout_${matchId}`} value={teamId} />
          )
      )}

      {/* Save bar */}
      <div className="sticky top-14 z-30 bg-[var(--color-bg)] border-b border-[var(--color-border)] -mx-4 px-4 py-3 mb-4 flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-secondary)]">
          {filledPicks}/{totalSlots} picks
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
              {pending ? "Saving..." : "Save Bracket"}
            </button>
          )}
        </div>
      </div>

      {/* Bracket layout */}
      <div className="overflow-x-auto -mx-4 px-4 pb-4">
        <div className="min-w-[900px] grid grid-cols-9 gap-x-1 items-center" style={{ minHeight: 720 }}>
          {/* Col 1: Left R32 (8 matches) */}
          <div className="flex flex-col justify-around h-full gap-1">
            {leftR32.map((mn) => (
              <BracketMatch
                key={mn}
                matchNumber={mn}
                matchByNumber={matchByNumber}
                getMatchTeams={getMatchTeams}
                picks={picks}
                onPick={handlePick}
                isLocked={isLocked}
                compact
              />
            ))}
          </div>

          {/* Col 2: Left R16 (4 matches) */}
          <div className="flex flex-col justify-around h-full gap-1">
            {leftR16.map((mn) => (
              <BracketMatch
                key={mn}
                matchNumber={mn}
                matchByNumber={matchByNumber}
                getMatchTeams={getMatchTeams}
                picks={picks}
                onPick={handlePick}
                isLocked={isLocked}
                compact
              />
            ))}
          </div>

          {/* Col 3: Left QF (2 matches) */}
          <div className="flex flex-col justify-around h-full gap-1">
            {leftQF.map((mn) => (
              <BracketMatch
                key={mn}
                matchNumber={mn}
                matchByNumber={matchByNumber}
                getMatchTeams={getMatchTeams}
                picks={picks}
                onPick={handlePick}
                isLocked={isLocked}
              />
            ))}
          </div>

          {/* Col 4: Left SF (1 match) */}
          <div className="flex flex-col justify-around h-full">
            {leftSF.map((mn) => (
              <BracketMatch
                key={mn}
                matchNumber={mn}
                matchByNumber={matchByNumber}
                getMatchTeams={getMatchTeams}
                picks={picks}
                onPick={handlePick}
                isLocked={isLocked}
              />
            ))}
          </div>

          {/* Col 5: Final + Consolation (center).
              Final sits up top labeled "FINAL". Consolation, when enabled,
              renders below it labeled "CONSOLATION" — same width as the
              Final card so they read as a stacked center column rather
              than two unrelated tiles. Consolation is purely a player
              pick; admins don't manually set its teams (they cascade from
              the semifinals server-side). */}
          <div className="flex flex-col justify-center items-stretch h-full gap-3">
            <div>
              <div className="text-center text-xs font-bold text-[var(--color-text-muted)] mb-2">
                FINAL
              </div>
              {finalMatch.map((mn) => (
                <BracketMatch
                  key={mn}
                  matchNumber={mn}
                  matchByNumber={matchByNumber}
                  getMatchTeams={getMatchTeams}
                  picks={picks}
                  onPick={handlePick}
                  isLocked={isLocked}
                  isFinal
                />
              ))}
            </div>

            {consolationMatch && consolationTeams && (
              <div>
                <div className="text-center text-xs font-bold text-[var(--color-text-muted)] mb-2">
                  CONSOLATION
                </div>
                <ConsolationSlot
                  homeTeam={consolationTeams.home}
                  awayTeam={consolationTeams.away}
                  currentPick={consolationPick}
                  onPick={handleConsolationPick}
                  isLocked={isLocked}
                />
              </div>
            )}
          </div>

          {/* Col 6: Right SF (1 match) */}
          <div className="flex flex-col justify-around h-full">
            {rightSF.map((mn) => (
              <BracketMatch
                key={mn}
                matchNumber={mn}
                matchByNumber={matchByNumber}
                getMatchTeams={getMatchTeams}
                picks={picks}
                onPick={handlePick}
                isLocked={isLocked}
              />
            ))}
          </div>

          {/* Col 7: Right QF (2 matches) */}
          <div className="flex flex-col justify-around h-full gap-1">
            {rightQF.map((mn) => (
              <BracketMatch
                key={mn}
                matchNumber={mn}
                matchByNumber={matchByNumber}
                getMatchTeams={getMatchTeams}
                picks={picks}
                onPick={handlePick}
                isLocked={isLocked}
              />
            ))}
          </div>

          {/* Col 8: Right R16 (4 matches) */}
          <div className="flex flex-col justify-around h-full gap-1">
            {rightR16.map((mn) => (
              <BracketMatch
                key={mn}
                matchNumber={mn}
                matchByNumber={matchByNumber}
                getMatchTeams={getMatchTeams}
                picks={picks}
                onPick={handlePick}
                isLocked={isLocked}
                compact
              />
            ))}
          </div>

          {/* Col 9: Right R32 (8 matches) */}
          <div className="flex flex-col justify-around h-full gap-1">
            {rightR32.map((mn) => (
              <BracketMatch
                key={mn}
                matchNumber={mn}
                matchByNumber={matchByNumber}
                getMatchTeams={getMatchTeams}
                picks={picks}
                onPick={handlePick}
                isLocked={isLocked}
                compact
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile-friendly bottom save */}
      {!isLocked && (
        <div className="pt-4">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-pitch-600 px-4 py-3 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors tap-target"
          >
            {pending ? "Saving..." : "Save Bracket"}
          </button>
        </div>
      )}

      {/* Hint at the dynamic total — tells the user whether the consolation
          counts towards their bracket completeness without forcing them to
          go to the settings page to find out. Knockoutotal mirrors the
          calculation used in the dashboard progress bar. */}
      <p className="text-2xs text-center text-[var(--color-text-muted)] pt-2">
        Bracket has {knockoutTotalCount(pool)} picks
        {pool.consolation_match_enabled ? " (including consolation)" : ""}.
      </p>
    </form>
  );
}

// ---- Individual bracket match component ----

function BracketMatch({
  matchNumber,
  matchByNumber,
  getMatchTeams,
  picks,
  onPick,
  isLocked,
  compact,
  isFinal,
}: {
  matchNumber: number;
  matchByNumber: Map<number, MatchWithTeams>;
  getMatchTeams: (mn: number) => { home: Team | null; away: Team | null };
  picks: BracketPicks;
  onPick: (matchId: string, teamId: string) => void;
  isLocked: boolean;
  compact?: boolean;
  isFinal?: boolean;
}) {
  const match = matchByNumber.get(matchNumber);
  if (!match) return <div className="h-16" />;

  const { home, away } = getMatchTeams(matchNumber);
  const currentPick = picks[match.id];

  // Check if match has an actual completed result
  const isDecided = match.status === "completed" && !!match.result;
  const actualWinner = isDecided
    ? match.result === "home"
      ? match.home_team_id
      : match.away_team_id
    : null;

  return (
    <div
      className={cn(
        "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden w-full",
        isFinal && "ring-1 ring-gold-300"
      )}
    >
      {[
        { team: home, slot: "home" as const },
        { team: away, slot: "away" as const },
      ].map(({ team, slot }, i) => {
        const isPicked = team?.id && currentPick === team.id;
        const isWinner = team?.id && actualWinner === team.id;
        return (
          <button
            key={slot}
            type="button"
            disabled={isLocked || isDecided || !team}
            onClick={() => team && onPick(match.id, team.id)}
            className={cn(
              "w-full flex items-center gap-1 text-left transition-colors px-1",
              compact ? "py-0.5" : "py-1",
              i === 0 && "border-b border-[var(--color-border)]",
              !team && "opacity-40 cursor-default",
              isDecided
                ? isWinner
                  ? "bg-pitch-50 ring-1 ring-inset ring-pitch-200 font-semibold"
                  : "opacity-60"
                : isPicked
                  ? "bg-pitch-100 ring-2 ring-inset ring-pitch-500 font-semibold"
                  : !isLocked && team
                    ? "hover:bg-[var(--color-surface-raised)] cursor-pointer"
                    : ""
            )}
          >
            {team ? (
              <>
                <TeamFlag
                  flagCode={team.flag_code}
                  teamName={team.name}
                  shortCode={team.short_code}
                  size="16x12"
                />
                <span className="text-2xs truncate flex-1">
                  {compact ? team.short_code : team.name}
                </span>
                {isPicked && !isDecided && (
                  <span className="text-2xs text-pitch-600 shrink-0">✓</span>
                )}
              </>
            ) : (
              <span className="text-2xs italic text-[var(--color-text-muted)]">
                TBD
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---- Consolation slot ----
//
// The consolation slot is structurally similar to BracketMatch but takes
// pre-resolved home/away teams (the loser projection happens in the parent
// because it depends on semifinal picks) rather than a match number. Kept
// as a separate component so its different prop shape doesn't bleed into
// the standard bracket-match callers.
function ConsolationSlot({
  homeTeam,
  awayTeam,
  currentPick,
  onPick,
  isLocked,
}: {
  homeTeam: Team | null;
  awayTeam: Team | null;
  currentPick: string | null;
  onPick: (teamId: string) => void;
  isLocked: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden w-full"
      )}
    >
      {[
        { team: homeTeam, slot: "home" as const },
        { team: awayTeam, slot: "away" as const },
      ].map(({ team, slot }, i) => {
        const isPicked = team?.id && currentPick === team.id;
        return (
          <button
            key={slot}
            type="button"
            disabled={isLocked || !team}
            onClick={() => team && onPick(team.id)}
            className={cn(
              "w-full flex items-center gap-1 text-left transition-colors px-1 py-1",
              i === 0 && "border-b border-[var(--color-border)]",
              !team && "opacity-40 cursor-default",
              isPicked
                ? "bg-pitch-100 ring-2 ring-inset ring-pitch-500 font-semibold"
                : !isLocked && team
                  ? "hover:bg-[var(--color-surface-raised)] cursor-pointer"
                  : ""
            )}
          >
            {team ? (
              <>
                <TeamFlag
                  flagCode={team.flag_code}
                  teamName={team.name}
                  shortCode={team.short_code}
                  size="16x12"
                />
                <span className="text-2xs truncate flex-1">{team.name}</span>
                {isPicked && (
                  <span className="text-2xs text-pitch-600 shrink-0">✓</span>
                )}
              </>
            ) : (
              <span className="text-2xs italic text-[var(--color-text-muted)]">
                TBD
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
