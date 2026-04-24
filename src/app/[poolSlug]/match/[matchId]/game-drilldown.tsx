"use client";

import Link from "next/link";
import type { MatchWithTeams } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { PHASE_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

interface GroupPickEntry {
  pick: string;
  is_correct: boolean | null;
  pick_set: {
    id: string;
    name: string;
    participant: { display_name: string | null; email: string };
  };
}

interface KnockoutPickEntry {
  picked_team_id: string;
  is_correct: boolean | null;
  pick_set: {
    id: string;
    name: string;
    participant: { display_name: string | null; email: string };
  };
}

interface GameDrilldownProps {
  match: MatchWithTeams;
  groupPicks: GroupPickEntry[];
  knockoutPicks: KnockoutPickEntry[];
  rankByPickSet: Record<string, number>;
  poolSlug: string;
  /** True when group picks are still open — hide distribution + list */
  groupPicksHidden?: boolean;
  /** True when knockout picks are still open — hide list for knockout matches */
  knockoutPicksHidden?: boolean;
}

/**
 * Truncate a team name to a maximum of 13 characters. Names 13 chars or
 * shorter pass through unchanged; longer names are cut to their first 10
 * characters plus "..." (so the maximum rendered length is always 13).
 *
 * Mirrors the same helper used in pick-set-detail.tsx and
 * pick-set-bracket-view.tsx — keeping badge labels visually bounded so the
 * fixed-width badge column stays stable row-to-row. Defined locally rather
 * than shared since it's three lines and the call sites don't otherwise
 * need to import from each other.
 */
function truncateTeamName(name: string): string {
  if (name.length <= 13) return name;
  return name.slice(0, 10) + "...";
}

export function GameDrilldown({
  match,
  groupPicks,
  knockoutPicks,
  rankByPickSet,
  poolSlug,
  groupPicksHidden,
  knockoutPicksHidden,
}: GameDrilldownProps) {
  const isGroup = match.phase === "group";
  const isCompleted = match.status === "completed";

  // Sort picks by standings rank (first place at top)
  const sortedGroupPicks = [...groupPicks].sort((a, b) => {
    const rankA = rankByPickSet[a.pick_set.id] ?? 9999;
    const rankB = rankByPickSet[b.pick_set.id] ?? 9999;
    return rankA - rankB;
  });

  const sortedKnockoutPicks = [...knockoutPicks].sort((a, b) => {
    const rankA = rankByPickSet[a.pick_set.id] ?? 9999;
    const rankB = rankByPickSet[b.pick_set.id] ?? 9999;
    return rankA - rankB;
  });

  // Calculate vote distribution for group picks
  const voteCounts = { home: 0, draw: 0, away: 0 };
  for (const p of groupPicks) {
    if (p.pick in voteCounts) {
      voteCounts[p.pick as keyof typeof voteCounts]++;
    }
  }
  const totalVotes = groupPicks.length;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/${poolSlug}/matches`}
        className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
      >
        ← Back to Matches
      </Link>

      {/* Match header */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-3">
          {PHASE_LABELS[match.phase]} · Match #{match.match_number}
        </p>

        <div className="flex items-center justify-center gap-6">
          {match.home_team ? (
            <div className="flex flex-col items-center gap-1.5">
              <TeamFlag
                flagCode={match.home_team.flag_code}
                teamName={match.home_team.name}
                shortCode={match.home_team.short_code}
                size="64x48"
              />
              <span className="font-display font-bold text-lg">
                {match.home_team.name}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {match.home_team.short_code}
              </span>
            </div>
          ) : (
            <span className="text-[var(--color-text-muted)]">TBD</span>
          )}

          <div className="text-center">
            {isCompleted ? (
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  {match.home_score} – {match.away_score}
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Full Time
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xl font-bold text-[var(--color-text-muted)]">
                  vs
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {match.status === "in_progress" ? "Live" : "Scheduled"}
                </p>
              </div>
            )}
          </div>

          {match.away_team ? (
            <div className="flex flex-col items-center gap-1.5">
              <TeamFlag
                flagCode={match.away_team.flag_code}
                teamName={match.away_team.name}
                shortCode={match.away_team.short_code}
                size="64x48"
              />
              <span className="font-display font-bold text-lg">
                {match.away_team.name}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {match.away_team.short_code}
              </span>
            </div>
          ) : (
            <span className="text-[var(--color-text-muted)]">TBD</span>
          )}
        </div>
      </div>

      {/* Group picks hidden message — shown for group matches pre-lock */}
      {isGroup && groupPicksHidden && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Picks are hidden until group phase picks lock and games begin.
          </p>
        </div>
      )}

      {/* Vote distribution (group matches, only when picks are visible) */}
      {isGroup && !groupPicksHidden && totalVotes > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">
            Pick Distribution
            <span className="font-normal text-[var(--color-text-muted)] ml-2">
              {totalVotes} player{totalVotes !== 1 ? "s" : ""}
            </span>
          </h2>

          <div className="space-y-2">
            {[
              { key: "home", label: match.home_team?.name ?? "Home" },
              { key: "draw", label: "Draw" },
              { key: "away", label: match.away_team?.name ?? "Away" },
            ].map(({ key, label }) => {
              const count = voteCounts[key as keyof typeof voteCounts];
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isCorrectOption = isCompleted && match.result === key;

              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-20 shrink-0 truncate">
                    {label}
                  </span>
                  <div className="flex-1 h-6 bg-[var(--color-surface-raised)] rounded-md overflow-hidden relative">
                    <div
                      className={cn(
                        "h-full flex items-center justify-end pr-2 transition-all",
                        isCorrectOption ? "bg-correct/20" : "bg-pitch-100"
                      )}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    >
                      {pct > 10 && (
                        <span className="text-2xs font-bold">{pct}%</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)] w-8 tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Individual picks list — sorted by standings rank */}
      {isGroup && !groupPicksHidden && sortedGroupPicks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">All Players</h2>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
            {sortedGroupPicks.map((p) => {
              const rank = rankByPickSet[p.pick_set.id];
              // Team name (or "Draw") to show in the badge, pre-truncated.
              const badgeLabel =
                p.pick === "home"
                  ? truncateTeamName(match.home_team?.name ?? "Home")
                  : p.pick === "away"
                    ? truncateTeamName(match.away_team?.name ?? "Away")
                    : "Draw";
              return (
                <div
                  key={p.pick_set.id}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <RankBadge rank={rank} />
                    {/*
                      Player name as a neutral link to the pick set detail —
                      matches the /standings treatment (Option 3): inherits
                      the default text colour, underlines on hover. Green is
                      reserved elsewhere in this app for correct picks /
                      hypothetical winners / selected options, so link-colour
                      stays neutral to avoid overloading the signal.
                    */}
                    <Link
                      href={`/${poolSlug}/picks/${p.pick_set.id}`}
                      className="text-sm font-medium hover:underline underline-offset-2 truncate transition-colors"
                    >
                      {p.pick_set.name}
                    </Link>
                  </div>
                  <span
                    className={cn(
                      // Fixed w-28 gives every badge the same horizontal
                      // footprint so the right edge lines up down the list.
                      // text-center sits shorter labels (like "Draw" or a
                      // short country name) in the middle of the badge
                      // instead of hugging the left edge. The truncation
                      // helper keeps country names at ≤13 chars so they
                      // never overflow the fixed width.
                      "text-xs font-bold px-2 py-1 rounded shrink-0 ml-2 w-28 text-center",
                      p.is_correct === true && "bg-correct/15 text-correct",
                      p.is_correct === false && "bg-incorrect/15 text-incorrect",
                      p.is_correct === null && "bg-gray-100 text-gray-500"
                    )}
                  >
                    {badgeLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Knockout picks hidden message */}
      {!isGroup && knockoutPicksHidden && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Knockout bracket picks will be visible once the knockout phase begins and picks are locked.
          </p>
        </div>
      )}

      {/* Knockout picks — sorted by standings rank */}
      {!isGroup && !knockoutPicksHidden && sortedKnockoutPicks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">All Players</h2>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
            {sortedKnockoutPicks.map((p) => {
              const rank = rankByPickSet[p.pick_set.id];
              const pickedTeam =
                p.picked_team_id === match.home_team_id
                  ? match.home_team
                  : match.away_team;
              const badgeLabel = truncateTeamName(pickedTeam?.name ?? "");
              return (
                <div
                  key={p.pick_set.id}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <RankBadge rank={rank} />
                    {/*
                      Player name as a neutral link — same Option 3 treatment
                      as the group-pick rows above and the /standings page.
                    */}
                    <Link
                      href={`/${poolSlug}/picks/${p.pick_set.id}`}
                      className="text-sm font-medium hover:underline underline-offset-2 truncate transition-colors"
                    >
                      {p.pick_set.name}
                    </Link>
                  </div>
                  <span
                    className={cn(
                      // Fixed w-28 (same as the group row above) keeps both
                      // badge columns vertically aligned across group and
                      // knockout lists. text-center sits the truncated team
                      // name in the middle of the badge.
                      "text-xs font-bold px-2 py-1 rounded shrink-0 ml-2 w-28 text-center",
                      p.is_correct === true && "bg-correct/15 text-correct",
                      p.is_correct === false && "bg-incorrect/15 text-incorrect",
                      p.is_correct === null && "bg-gray-100 text-gray-500"
                    )}
                  >
                    {badgeLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state — only when picks are visible but none have been submitted */}
      {!groupPicksHidden &&
        !knockoutPicksHidden &&
        groupPicks.length === 0 &&
        knockoutPicks.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
            <p className="text-[var(--color-text-secondary)]">
              No picks submitted for this match yet.
            </p>
          </div>
        )}
    </div>
  );
}

function RankBadge({ rank }: { rank?: number }) {
  if (!rank) return <span className="w-6" />;

  // Rank styles — gold/silver/bronze all use the -100 / -700 / -200 pattern
  // for consistent contrast. Previously rank 3 used -50 / -600 / -200 which
  // rendered too washed out next to the other two badges.
  const styles =
    rank === 1
      ? "bg-gold-100 text-gold-700 border-gold-200"
      : rank === 2
        ? "bg-gray-100 text-gray-600 border-gray-200"
        : rank === 3
          ? "bg-orange-100 text-orange-700 border-orange-200"
          : "bg-transparent text-[var(--color-text-muted)] border-transparent";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border shrink-0",
        styles
      )}
    >
      {rank}
    </span>
  );
}
