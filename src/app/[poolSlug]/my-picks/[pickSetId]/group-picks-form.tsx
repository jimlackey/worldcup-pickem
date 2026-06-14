"use client";

import { useActionState, useMemo, useState } from "react";
import { submitGroupPicksAction } from "../actions";
import type { PickActionResult } from "../actions";
import type { MatchWithTeams, Group, Pool, Team } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import { formatMoneyLine } from "@/lib/lines/format";
import {
  pacificDayKey,
  formatPacificDayHeading,
  formatPacificTime,
  compareDayKeysRelevanceFirst,
} from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

interface GroupPicksFormProps {
  matches: MatchWithTeams[];
  groups: Group[];
  existingPicks: Record<string, string>;
  pickSetId: string;
  pool: Pool;
  isLocked: boolean;
  /**
   * Optional server action override. When the admin pick-edit route
   * mounts this form, it passes the admin-side action so the same
   * form posts to /admin/...'s audit-logged server action instead of
   * the player-side one. Default is the player action — existing
   * /my-picks flows keep working with zero behaviour change.
   *
   * The action's shape (prev state + FormData → PickActionResult)
   * matches between the player and admin variants so useActionState
   * can swap freely without any further plumbing.
   */
  overrideAction?: typeof submitGroupPicksAction;
}

const initial: PickActionResult = { success: false };

export function GroupPicksForm({
  matches,
  groups,
  existingPicks,
  pickSetId,
  pool,
  isLocked,
  overrideAction,
}: GroupPicksFormProps) {
  const [state, action, pending] = useActionState(
    overrideAction ?? submitGroupPicksAction,
    initial
  );
  const [picks, setPicks] = useState<Record<string, string>>(existingPicks);

  function handlePick(matchId: string, value: string) {
    if (isLocked) return;
    setPicks((prev) => ({ ...prev, [matchId]: value }));
  }

  // View-only (locked) state gets a "By Group | By Date" toggle, mirroring
  // the Matches and What-If pages. It only appears once picking has closed
  // — while a player is still making picks the by-group layout (one section
  // per group, in letter order) is the right mental model for filling out
  // all 72. Once results start coming in, "By Date" lets them follow the
  // tournament chronologically, like the schedule. Defaults to "date" to
  // match the What-If page's default. The toggle is never shown when the
  // form is editable, so `groupMode` is simply ignored in that case.
  const [groupMode, setGroupMode] = useState<"group" | "date">("date");

  // Group matches by group (letter order). Used for the by-group layout
  // and as the only layout while the form is editable.
  const matchesByGroup = useMemo(() => {
    const map = new Map<string, MatchWithTeams[]>();
    for (const match of matches) {
      if (!match.group_id) continue;
      const existing = map.get(match.group_id) ?? [];
      existing.push(match);
      map.set(match.group_id, existing);
    }
    return map;
  }, [matches]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.letter.localeCompare(b.letter)),
    [groups]
  );

  // Date buckets over the same group matches, chronological. Mirrors the
  // What-If by-date view: unscheduled matches collapse into a trailing
  // "Date TBD" bucket so none are dropped. Built unconditionally (cheap)
  // so the toggle can switch instantly without recompute on first click.
  const dateBuckets = useMemo(() => {
    const map = new Map<
      string,
      { heading: string; sortKey: string; items: MatchWithTeams[] }
    >();
    const TBD_KEY = "~tbd";
    for (const m of matches) {
      const key = pacificDayKey(m.scheduled_at);
      if (key) {
        const bucket = map.get(key) ?? {
          heading: formatPacificDayHeading(m.scheduled_at) ?? key,
          sortKey: key,
          items: [],
        };
        bucket.items.push(m);
        map.set(key, bucket);
      } else {
        const bucket = map.get(TBD_KEY) ?? {
          heading: "Date TBD",
          sortKey: TBD_KEY,
          items: [],
        };
        bucket.items.push(m);
        map.set(TBD_KEY, bucket);
      }
    }
    const days = [...map.values()].sort((a, b) =>
      compareDayKeysRelevanceFirst(a.sortKey, b.sortKey)
    );
    for (const day of days) {
      day.items.sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.match_number ?? 0) - (b.match_number ?? 0);
      });
    }
    return days;
  }, [matches]);

  const totalPicked = Object.keys(picks).length;

  // Shared per-match card renderer — used by both layouts so the two paths
  // can never drift. `showKickoff` adds the kickoff time on the date view
  // (where the day is the section header but the time still helps).
  const renderMatchCard = (match: MatchWithTeams, showKickoff: boolean) => (
    <MatchPickCard
      key={match.id}
      match={match}
      currentPick={picks[match.id] ?? null}
      onPick={(value) => handlePick(match.id, value)}
      isLocked={isLocked}
      showRankings={pool.show_fifa_rankings}
      showLines={pool.show_match_lines}
      kickoffLabel={showKickoff ? formatPacificTime(match.scheduled_at) : null}
    />
  );

  // Toggle is only meaningful in the locked / view-only state.
  const modeToggle = isLocked ? (
    <div
      role="tablist"
      aria-label="Group matches by"
      className="inline-flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
    >
      {([
        { value: "group", label: "By Group" },
        { value: "date", label: "By Date" },
      ] as const).map((g) => (
        <button
          key={g.value}
          type="button"
          role="tab"
          aria-selected={groupMode === g.value}
          onClick={() => setGroupMode(g.value)}
          className={cn(
            "px-2.5 py-1 text-2xs font-medium rounded-md transition-colors",
            groupMode === g.value
              ? "bg-pitch-600 text-white"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]"
          )}
        >
          {g.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />
      <input type="hidden" name="pickSetId" value={pickSetId} />

      {/* Hidden inputs for all current picks — these are what the form actually submits */}
      {Object.entries(picks).map(([matchId, pick]) => (
        <input key={matchId} type="hidden" name={`pick_${matchId}`} value={pick} />
      ))}

      {/* Progress + save bar */}
      <div className="sticky top-14 z-30 bg-[var(--color-bg)] border-b border-[var(--color-border)] -mx-4 px-4 py-3 flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--color-text-secondary)] shrink-0">
          {totalPicked}/72 picks made
        </span>

        <div className="flex items-center gap-2">
          {state.error && (
            <span className="text-xs text-red-600">{state.error}</span>
          )}
          {state.success && (
            <span className="text-xs text-pitch-600">{state.message}</span>
          )}

          {/* View-only: By Group | By Date toggle sits where the Save
              button would be when the form is editable. */}
          {modeToggle}

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

      {/* Match layout. When locked + "By Date", group matches into
          chronological day sections (kickoff time shown on each card);
          otherwise the default one-section-per-group layout. */}
      {isLocked && groupMode === "date"
        ? dateBuckets.map((day) => (
            <section key={day.sortKey}>
              <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
                {day.heading}
              </h2>
              <div className="space-y-2">
                {day.items.map((match) => renderMatchCard(match, true))}
              </div>
            </section>
          ))
        : sortedGroups.map((group) => {
            const groupMatches = matchesByGroup.get(group.id) ?? [];
            if (groupMatches.length === 0) return null;

            return (
              <section key={group.id}>
                <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
                  {group.name}
                </h2>
                <div className="space-y-2">
                  {groupMatches
                    .sort(
                      (a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)
                    )
                    .map((match) => renderMatchCard(match, false))}
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

// ---------------------------------------------------------------------------
// Inline ranking badge
// ---------------------------------------------------------------------------

/**
 * Renders "(15)" inline beside a team name when the pool has rankings
 * enabled AND the team has a recorded ranking. Anything else returns null
 * and React skips the node, so the team name renders unchanged.
 *
 * The badge intentionally uses text-muted to recede from the team name —
 * we want the ranking to add context, not to compete visually with the
 * matchup itself.
 */
function RankingBadge({
  team,
  show,
}: {
  team: Pick<Team, "fifa_ranking">;
  show: boolean;
}) {
  if (!show) return null;
  if (team.fifa_ranking == null) return null;
  return (
    <span className="ml-1 text-2xs font-normal text-[var(--color-text-muted)] tabular-nums">
      ({team.fifa_ranking})
    </span>
  );
}

// ---------------------------------------------------------------------------
// Match pick card
// ---------------------------------------------------------------------------

function MatchPickCard({
  match,
  currentPick,
  onPick,
  isLocked,
  showRankings,
  showLines,
  kickoffLabel,
}: {
  match: MatchWithTeams;
  currentPick: string | null;
  onPick: (value: string) => void;
  isLocked: boolean;
  showRankings: boolean;
  showLines: boolean;
  /**
   * Kickoff time label (e.g. "1:00 PM PT") shown in the card header on the
   * by-date layout, where the day is the section heading but the time still
   * helps orient within the day. Null on the by-group layout (and whenever
   * the match has no scheduled time), in which case nothing renders.
   */
  kickoffLabel?: string | null;
}) {
  if (!match.home_team || !match.away_team) return null;

  // Money lines for the three options. formatMoneyLine() returns null
  // when there's nothing to render so each option independently shows or
  // hides its sub-label.
  const homeLine = showLines ? formatMoneyLine(match.home_money_line) : null;
  const drawLine = showLines ? formatMoneyLine(match.draw_money_line) : null;
  const awayLine = showLines ? formatMoneyLine(match.away_money_line) : null;

  const options: Array<{
    value: "home" | "draw" | "away";
    label: string;
    line: string | null;
  }> = [
    { value: "home", label: match.home_team.name, line: homeLine },
    { value: "draw", label: "Draw", line: drawLine },
    { value: "away", label: match.away_team.name, line: awayLine },
  ];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <TeamFlag
            flagCode={match.home_team.flag_code}
            teamName={match.home_team.name}
            shortCode={match.home_team.short_code}
            size="24x18"
          />
          <span className="text-sm font-medium">
            {match.home_team.name}
            <RankingBadge team={match.home_team} show={showRankings} />
          </span>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">vs</span>
        <div className="flex items-center gap-1.5">
          <TeamFlag
            flagCode={match.away_team.flag_code}
            teamName={match.away_team.name}
            shortCode={match.away_team.short_code}
            size="24x18"
          />
          <span className="text-sm font-medium">
            {match.away_team.name}
            <RankingBadge team={match.away_team} show={showRankings} />
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {kickoffLabel && (
            <span className="text-2xs text-[var(--color-text-muted)] tabular-nums">
              {kickoffLabel}
            </span>
          )}
          {match.status === "completed" && match.result && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--color-surface-raised)]">
              {match.home_score}–{match.away_score}
            </span>
          )}
        </div>
      </div>

      {/* Pick selector — controlled buttons.
          When `showLines` is true and the match has money lines on file,
          each button renders its team label on the first line and the
          (-190)/(+330)/(+600) line below it. The flex-col + leading-tight
          combo keeps the button height comparable to the line-less variant
          since the line label is text-2xs vs the team label's text-xs. */}
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
            <button
              key={opt.value}
              type="button"
              disabled={isLocked}
              onClick={() => onPick(opt.value)}
              className={cn(
                "flex flex-col items-center justify-center rounded-md border py-2 px-1 text-xs font-medium transition-all tap-target leading-tight",
                isLocked
                  ? "cursor-default opacity-60"
                  : "cursor-pointer active:scale-95",
                isSelected && !isCorrect && !isWrong
                  ? "border-pitch-500 bg-pitch-50 text-pitch-700 ring-1 ring-pitch-500/30"
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
              <span className="truncate max-w-full">{opt.label}</span>
              {opt.line && (
                <span
                  className={cn(
                    "text-2xs font-normal tabular-nums mt-0.5",
                    // The line label inherits the button's foreground color
                    // when the button is in a coloured state (selected /
                    // correct / wrong) so it stays readable; in the neutral
                    // state we mute it so the team label leads the eye.
                    !isSelected && !isCorrect && !isWrong
                      ? "text-[var(--color-text-muted)]"
                      : ""
                  )}
                >
                  {opt.line}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
