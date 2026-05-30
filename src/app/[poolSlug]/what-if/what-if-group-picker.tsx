"use client";

import { useMemo } from "react";
import type { Group, MatchResult, Pool, Team } from "@/types/database";
import { TeamFlag } from "@/components/flags/team-flag";
import type {
  MatchInfo,
  WhatIfOverrides,
} from "@/lib/what-if/scoring-engine";
import { cn } from "@/lib/utils/cn";

interface WhatIfGroupPickerProps {
  matches: MatchInfo[];
  groups: Group[];
  teams: Team[];
  overrides: WhatIfOverrides;
  onChange: (next: WhatIfOverrides) => void;
  /**
   * The pool itself. Read for the `show_fifa_rankings` flag, which gates
   * the "(15)"-style FIFA-rank suffix rendered next to each team name in
   * the wide (md+) view. Same flag-on-pool convention used by the
   * editable group picks form and the match drilldown — when the flag is
   * off, or a team has no recorded ranking, the suffix simply doesn't
   * render. The flag is irrelevant in the narrow (< md) view because
   * that view shows 3-letter short codes only, with no room for rank.
   */
  pool: Pool;
}

/**
 * Inline FIFA-ranking suffix: "(15)". Returns null (no DOM) when the
 * pool flag is off or the team has no recorded ranking, so partially-
 * populated tournaments degrade cleanly.
 *
 * Mirrors the RankSuffix helpers used by game-drilldown.tsx and the
 * editable group picks form, just sized one notch smaller (text-2xs vs
 * text-xs) because this picker's team label is itself text-xs — keeping
 * the rank a step below the name preserves visual hierarchy.
 */
function RankSuffix({ team, show }: { team: Team; show: boolean }) {
  if (!show) return null;
  if (team.fifa_ranking == null) return null;
  return (
    <span className="text-2xs text-[var(--color-text-muted)] font-normal ml-1 tabular-nums">
      ({team.fifa_ranking})
    </span>
  );
}

export function WhatIfGroupPicker({
  matches,
  groups,
  teams,
  overrides,
  onChange,
  pool,
}: WhatIfGroupPickerProps) {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  // We need group_id for each match. MatchInfo strips it — look it up via teams.
  // Simpler: bucket by the home team's group_id (both teams in a group match
  // share the same group).
  const teamGroupById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) {
      if (t.group_id) m.set(t.id, t.group_id);
    }
    return m;
  }, [teams]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.letter.localeCompare(b.letter)),
    [groups]
  );

  // Bucket group matches by group
  const matchesByGroup = useMemo(() => {
    const map = new Map<string, MatchInfo[]>();
    for (const m of matches) {
      if (m.phase !== "group") continue;
      const groupId = m.home_team_id
        ? teamGroupById.get(m.home_team_id)
        : undefined;
      if (!groupId) continue;
      const arr = map.get(groupId) ?? [];
      arr.push(m);
      map.set(groupId, arr);
    }
    // Sort matches within each group by match_number
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));
    }
    return map;
  }, [matches, teamGroupById]);

  const setPick = (matchId: string, value: MatchResult | null) => {
    const nextGroup = { ...overrides.groupResults };
    if (value === null) {
      delete nextGroup[matchId];
    } else {
      nextGroup[matchId] = value;
    }
    onChange({ ...overrides, groupResults: nextGroup });
  };

  const showRankings = Boolean(pool.show_fifa_rankings);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-display font-bold">Group Phase — What If</h2>

      {sortedGroups.map((group) => {
        const gMatches = matchesByGroup.get(group.id) ?? [];
        if (gMatches.length === 0) return null;

        // Only show the section if it has at least one undecided match
        const hasUndecided = gMatches.some(
          (m) => m.actual_status !== "completed"
        );
        if (!hasUndecided) return null;

        return (
          <div key={group.id}>
            <h3 className="text-2xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wide">
              {group.name}
            </h3>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
              {gMatches.map((m) => {
                const home = m.home_team_id ? teamMap.get(m.home_team_id) : null;
                const away = m.away_team_id ? teamMap.get(m.away_team_id) : null;
                const isDecided = m.actual_status === "completed";

                // Both teams must resolve for the row to render anything
                // meaningful. Without them the picker can't show a label or
                // attribute a result, so we fall back to a single "Teams
                // TBD" placeholder.
                if (!home || !away) {
                  return (
                    <div
                      key={m.id}
                      className="px-3 py-2 text-2xs text-[var(--color-text-muted)] italic text-center"
                    >
                      Teams TBD
                    </div>
                  );
                }

                if (isDecided) {
                  return (
                    <DecidedRow
                      key={m.id}
                      match={m}
                      home={home}
                      away={away}
                      showRankings={showRankings}
                    />
                  );
                }

                const override = overrides.groupResults[m.id] ?? null;
                return (
                  <UndecidedRow
                    key={m.id}
                    match={m}
                    home={home}
                    away={away}
                    pick={override}
                    onPick={(value) => setPick(m.id, value)}
                    showRankings={showRankings}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Undecided match — three equal-width pick buttons
// ---------------------------------------------------------------------------
//
// Layout: three same-width buttons across the full row width, with no
// separators between them — each button is its own bordered/rounded
// surface, and `gap-1.5` provides visual breathing room.
//
// The buttons all use `flex-1` and `min-w-0` so they split the row
// evenly and truncate their labels via the inner `truncate` span if a
// country name plus rank suffix exceeds the column at extreme widths.
//
// Selected state mirrors the green hypothetical-pick convention used
// everywhere else in this app (My Picks bracket, What-If bracket):
// pitch-100 fill + pitch-400 border + pitch-500/30 ring. Unselected
// gets a neutral border with a soft pitch-tinted hover hint.
//
// Clicking the currently-selected button DESELECTS it (returns the row
// to the "no override" state) so a user can take back a what-if pick
// without resetting the whole panel.
// ---------------------------------------------------------------------------

function UndecidedRow({
  match,
  home,
  away,
  pick,
  onPick,
  showRankings,
}: {
  match: MatchInfo;
  home: Team;
  away: Team;
  pick: MatchResult | null;
  onPick: (value: MatchResult | null) => void;
  showRankings: boolean;
}) {
  return (
    <div className="px-2 py-1.5 flex items-stretch gap-1.5">
      <PickButton
        selected={pick === "home"}
        onClick={() => onPick(pick === "home" ? null : "home")}
        ariaLabel={`Pick ${home.name}`}
      >
        <TeamFlag
          flagCode={home.flag_code}
          teamName={home.name}
          shortCode={home.short_code}
          size="16x12"
        />
        <TeamLabel team={home} showRankings={showRankings} />
      </PickButton>

      <PickButton
        selected={pick === "draw"}
        onClick={() => onPick(pick === "draw" ? null : "draw")}
        ariaLabel="Pick Draw"
      >
        <span className="text-xs font-medium">Draw</span>
      </PickButton>

      <PickButton
        selected={pick === "away"}
        onClick={() => onPick(pick === "away" ? null : "away")}
        ariaLabel={`Pick ${away.name}`}
      >
        <TeamFlag
          flagCode={away.flag_code}
          teamName={away.name}
          shortCode={away.short_code}
          size="16x12"
        />
        <TeamLabel team={away} showRankings={showRankings} />
      </PickButton>
    </div>
  );
}

/**
 * Single pick button used inside an UndecidedRow. Equal-width via flex-1,
 * children centred horizontally and vertically inside the rounded bordered
 * surface. The "selected" green treatment matches the My Picks form
 * convention so the visual signal is consistent across the app.
 */
function PickButton({
  selected,
  onClick,
  ariaLabel,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
      className={cn(
        // flex-1 + min-w-0 = equal split with inner truncate enabled
        "flex-1 min-w-0 rounded-md border px-2 py-1.5 transition-colors",
        // inner flex centres flag + label both axes
        "inline-flex items-center justify-center gap-1.5",
        selected
          ? "bg-pitch-100 border-pitch-400 ring-1 ring-pitch-500/30 text-pitch-700 cursor-pointer"
          : "bg-transparent border-[var(--color-border)] hover:border-pitch-300 hover:bg-pitch-50/30 cursor-pointer"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Responsive team label used inside a PickButton.
 *   md and up:  full team name + optional FIFA rank suffix.
 *   below md:   3-letter short code only (no rank — the button is too
 *               narrow for it at mobile widths).
 *
 * Same paired-<span> pattern used elsewhere in the app
 * (pick-set-bracket-view.tsx, game-drilldown.tsx). `truncate` on each
 * variant means a pathologically long name + rank still degrades to an
 * ellipsis rather than wrapping the button or pushing siblings around.
 */
function TeamLabel({
  team,
  showRankings,
}: {
  team: Team;
  showRankings: boolean;
}) {
  return (
    <>
      <span className="text-xs font-medium truncate md:hidden">
        {team.short_code}
      </span>
      <span className="text-xs font-medium truncate hidden md:inline">
        {team.name}
        <RankSuffix team={team} show={showRankings} />
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Completed match — three-panel result readout
// ---------------------------------------------------------------------------
//
// Mirrors the three-panel layout of UndecidedRow (Home | Draw | Away) so a
// completed match keeps visual continuity with the matches still open for a
// what-if pick. The difference is that these panels are inert:
//
//   - The WINNING panel (home / draw / away, per the match's actual result)
//     gets the same blue "decided" treatment used for actual winners in the
//     What-If knockout bracket: bg-blue-100 + text-blue-700 + bold. Blue
//     (not green) because green is reserved for HYPOTHETICAL picks in this
//     view — using it for a settled result would make the two readings
//     collide. Dark-mode overrides for these blue utilities live in
//     globals.css (added with the bracket's winner treatment).
//   - The other two panels are greyed and non-interactive — rendered as
//     <div>s, not buttons, with no hover and a muted fill so they read as
//     locked context rather than choices.
//
// Each team panel shows the team's own score next to its name (e.g.
// "🇲🇽 Mexico 2"). The Draw panel shows just "Draw" — on a draw it's the
// blue winning panel; otherwise it's a greyed middle panel. This matches
// the [Home] [Draw] [Away] geometry exactly, so completed and open rows
// line up column-for-column down a group.
// ---------------------------------------------------------------------------

function DecidedRow({
  match,
  home,
  away,
  showRankings,
}: {
  match: MatchInfo;
  home: Team;
  away: Team;
  showRankings: boolean;
}) {
  const result = match.actual_result;
  const homeWon = result === "home";
  const awayWon = result === "away";
  const isDraw = result === "draw";

  // Prefer the real numeric score; completed matches normally have both
  // scores filled (the admin form enforces it). Guard against a completed
  // row with missing scores so we never render "null".
  const hasScores = match.home_score !== null && match.away_score !== null;

  return (
    <div className="px-2 py-1.5 flex items-stretch gap-1.5">
      <ResultPanel won={homeWon}>
        <TeamFlag
          flagCode={home.flag_code}
          teamName={home.name}
          shortCode={home.short_code}
          size="16x12"
        />
        <TeamLabel team={home} showRankings={showRankings} />
        {hasScores && <ScoreBadge>{match.home_score}</ScoreBadge>}
      </ResultPanel>

      <ResultPanel won={isDraw}>
        <span className="text-xs font-medium">Draw</span>
      </ResultPanel>

      <ResultPanel won={awayWon}>
        <TeamFlag
          flagCode={away.flag_code}
          teamName={away.name}
          shortCode={away.short_code}
          size="16x12"
        />
        <TeamLabel team={away} showRankings={showRankings} />
        {hasScores && <ScoreBadge>{match.away_score}</ScoreBadge>}
      </ResultPanel>
    </div>
  );
}

/**
 * One inert panel in a DecidedRow. Same footprint as a PickButton (so
 * completed and open rows line up column-for-column), but rendered as a
 * non-interactive <div>:
 *
 *   - won  → blue "decided winner" treatment, identical to the What-If
 *            bracket's actual-winner slot (bg-blue-100 + text-blue-700 +
 *            bold). Dark-mode overrides live in globals.css.
 *   - else → greyed, muted text, no hover. Reads as locked context.
 */
function ResultPanel({
  won,
  children,
}: {
  won: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // Same box geometry as PickButton: equal split + inner truncate.
        "flex-1 min-w-0 rounded-md border px-2 py-1.5",
        "inline-flex items-center justify-center gap-1.5 cursor-default",
        won
          ? "bg-blue-100 border-blue-300/50 text-blue-700 font-semibold"
          : "bg-[var(--color-surface-raised)] border-[var(--color-border)] text-[var(--color-text-muted)]"
      )}
    >
      {children}
    </div>
  );
}

/**
 * Per-team score chip shown next to the country name inside a winning or
 * losing ResultPanel. tabular-nums so single- and double-digit scores
 * keep their alignment down a column of rows.
 */
function ScoreBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-bold tabular-nums shrink-0 ml-0.5">
      {children}
    </span>
  );
}
