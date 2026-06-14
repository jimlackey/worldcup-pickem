"use client";

import { useMemo, useState } from "react";
import type { Group, Pool, Team } from "@/types/database";
import {
  computeStandingsWithOverrides,
  type WhatIfOverrides,
} from "@/lib/what-if/scoring-engine";
import type { WhatIfData } from "@/lib/what-if/queries";
import { WhatIfGroupPicker } from "./what-if-group-picker";
import { WhatIfBracketPicker } from "./what-if-bracket-picker";
import { WhatIfStandings } from "./what-if-standings";

interface WhatIfShellProps {
  data: WhatIfData;
  groups: Group[];
  teams: Team[];
  poolSlug: string;
  /**
   * Pool UUID — threaded through so the favorites star button on the
   * what-if standings rows can identify the pool when toggling.
   */
  poolId: string;
  /**
   * Which phase's matches to expose in the picker column.
   *   "group"    — Phase 2 (Group games underway): show Group Phase picker only.
   *   "knockout" — Phase 4 (Knockout games underway): show Knockout Bracket only.
   *
   * The standings panel always reflects the full tournament regardless of
   * which picker is visible.
   */
  restrictTo: "group" | "knockout";
  /**
   * The pool itself. Required by the page that mounts this shell — the
   * page already has the pool object on hand (it uses it to derive the
   * tournament phase) and passes it through.
   *
   * Currently READ for the Group picker (`pool.show_fifa_rankings` gates
   * the inline FIFA-rank suffix on team labels). Also threaded ahead for
   * future consolation support in the Knockout picker, the same way
   * pick-set-bracket-view.tsx reads pool.consolation_match_enabled.
   */
  pool: Pool;
  /**
   * Pick set IDs the current logged-in user has favorited in this pool.
   * Drives the Favorites sub-tab on the standings panel. Keyed on pick
   * set, not participant.
   */
  favoritePickSetIds: string[];
  /**
   * Whether the visitor is logged in. Controls whether the favorite
   * stars render and whether the Favorites sub-tab is interactable.
   */
  isLoggedIn: boolean;
  /**
   * Participant ID of the logged-in visitor, or null for guests. Used to
   * pick the DEFAULT pick set in the group-phase "simulate a pick set"
   * dropdown: when the visitor owns one or more pick sets, the dropdown
   * defaults to their OLDEST one (earliest created_at). Guests get the
   * first pick set in the pool as a neutral default.
   */
  currentParticipantId: string | null;
}

const EMPTY: WhatIfOverrides = { groupResults: {}, knockoutWinners: {} };

export function WhatIfShell({
  data,
  groups,
  teams,
  poolSlug,
  poolId,
  restrictTo,
  pool,
  favoritePickSetIds,
  isLoggedIn,
  currentParticipantId,
}: WhatIfShellProps) {
  const [overrides, setOverrides] = useState<WhatIfOverrides>(EMPTY);

  const scored = useMemo(
    () =>
      computeStandingsWithOverrides({
        matches: data.matches,
        pickSets: data.pickSets,
        groupPicks: data.groupPicks,
        knockoutPicks: data.knockoutPicks,
        scoring: data.scoring,
        overrides,
      }),
    [data, overrides]
  );

  // Phase-driven: the page tells us which picker to show. We only render a
  // picker if there are undecided matches of that phase left to simulate.
  const undecidedInPhase = data.matches.filter((m) =>
    restrictTo === "group"
      ? m.phase === "group" && m.actual_status !== "completed"
      : m.phase !== "group" && m.actual_status !== "completed"
  );
  const showPicker = undecidedInPhase.length > 0;

  const overrideCount =
    Object.keys(overrides.groupResults).length +
    Object.keys(overrides.knockoutWinners).length;

  // -------------------------------------------------------------------
  // "Simulate a pick set" control (group phase only).
  //
  // Lets a player pre-fill every UN-PLAYED group match with the picks
  // from a chosen pick set, then see where the standings would land if
  // those picks all came true — i.e. "how would things look if every
  // remaining result went exactly the way THIS pick set called it".
  //
  // Options: every pick set in the pool, labelled by its standings name
  // (same label the standings list uses), sorted alphabetically so the
  // dropdown is scannable. Default selection:
  //   - logged-in player who owns pick sets → their OLDEST one
  //     (earliest created_at = "the one they created first");
  //   - otherwise → the first pick set in the sorted list.
  // -------------------------------------------------------------------

  // Group matches still open for simulation, by id. A pick only gets
  // applied if its match is in this set (completed matches keep their
  // real result and are never overridden).
  const unplayedGroupMatchIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of data.matches) {
      if (m.phase === "group" && m.actual_status !== "completed") {
        s.add(m.id);
      }
    }
    return s;
  }, [data.matches]);

  // Dropdown options: alphabetical by display label.
  const pickSetOptions = useMemo(() => {
    return [...data.pickSets]
      .map((ps) => ({ id: ps.id, label: ps.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data.pickSets]);

  // Default selected pick set id.
  const defaultPickSetId = useMemo(() => {
    if (currentParticipantId) {
      const mine = data.pickSets
        .filter((ps) => ps.participant_id === currentParticipantId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (mine.length > 0) return mine[0].id;
    }
    return pickSetOptions[0]?.id ?? "";
  }, [currentParticipantId, data.pickSets, pickSetOptions]);

  const [selectedPickSetId, setSelectedPickSetId] =
    useState<string>(defaultPickSetId);

  // Group picks bucketed by pick set, so Simulate is an O(picks-in-set)
  // lookup rather than a full scan of every pick in the pool.
  const groupPicksByPickSet = useMemo(() => {
    const map = new Map<string, { match_id: string; pick: WhatIfOverrides["groupResults"][string] }[]>();
    for (const gp of data.groupPicks) {
      const arr = map.get(gp.pick_set_id) ?? [];
      arr.push({ match_id: gp.match_id, pick: gp.pick });
      map.set(gp.pick_set_id, arr);
    }
    return map;
  }, [data.groupPicks]);

  const handleSimulate = () => {
    if (!selectedPickSetId) return;
    const picks = groupPicksByPickSet.get(selectedPickSetId) ?? [];
    // Start from the EXISTING group overrides so any manual what-if picks
    // the player already made are preserved, then layer the pick set's
    // calls for every still-open group match on top.
    const nextGroup = { ...overrides.groupResults };
    for (const { match_id, pick } of picks) {
      if (unplayedGroupMatchIds.has(match_id)) {
        nextGroup[match_id] = pick;
      }
    }
    setOverrides({ ...overrides, groupResults: nextGroup });
  };

  // Simulate panel — group phase only (knockout uses the bracket picker).
  // Sits above the picker so a player can fill the whole board in one tap
  // and then tweak individual rows underneath if they like.
  const simulatePanel = restrictTo === "group" && pickSetOptions.length > 0 && (
    <div className="flex items-center gap-2 flex-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <label
        htmlFor="whatif-simulate-pickset"
        className="text-xs font-medium text-[var(--color-text-secondary)] shrink-0"
      >
        Fill from
      </label>
      <select
        id="whatif-simulate-pickset"
        value={selectedPickSetId}
        onChange={(e) => setSelectedPickSetId(e.target.value)}
        aria-label="Pick set to simulate"
        className="min-w-0 flex-1 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[var(--color-text)] focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
      >
        {pickSetOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleSimulate}
        disabled={!selectedPickSetId}
        className="shrink-0 text-xs font-medium rounded-md bg-pitch-600 text-white px-3 py-1.5 hover:bg-pitch-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Simulate
      </button>
    </div>
  );

  // Action bar — same regardless of which picker is showing.
  const actionBar = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-[var(--color-text-muted)]">
        {overrideCount === 0
          ? "No hypothetical picks set. Standings below reflect actual results."
          : `${overrideCount} hypothetical pick${overrideCount === 1 ? "" : "s"} applied.`}
      </p>
      {overrideCount > 0 && (
        <button
          type="button"
          onClick={() => setOverrides(EMPTY)}
          className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-2 py-1 rounded hover:bg-[var(--color-surface-raised)] transition-colors"
        >
          Reset all
        </button>
      )}
    </div>
  );

  // Standings panel — same regardless of which picker is showing.
  const standingsPanel = (
    <div className="sm:sticky sm:top-20">
      <WhatIfStandings
        rows={scored}
        poolSlug={poolSlug}
        poolId={poolId}
        favoritePickSetIds={favoritePickSetIds}
        isLoggedIn={isLoggedIn}
      />
    </div>
  );

  // ---------------------------------------------------------------------
  // Knockout phase layout: bracket on the left, standings filling the rest
  // of the row on the right.
  //
  // Implemented as flex (not grid + arbitrary template columns) because
  // arbitrary Tailwind values like `grid-cols-[auto_1fr]` were fragile
  // when constructed inside ternary className expressions — the Tailwind
  // JIT scanner is reliable for static class strings but missed that
  // particular dynamically-assembled one. Pure flex with stock utilities
  // is guaranteed to be picked up.
  //
  // - sm:shrink-0 on the picker column locks it at its intrinsic content
  //   width on sm+ viewports. The bracket itself (see what-if-bracket-
  //   picker.tsx) is now a one-sided narrow layout — same shape and
  //   spacing as the My Picks bracket-picker mobile view, with 3-letter
  //   country codes instead of truncated full names. Same view at every
  //   viewport size; only the placement of the standings panel changes.
  // - sm:max-w-[460px] caps the picker just above the bracket's
  //   ONE_SIDED_MIN_W (440) plus a small slack for the section heading.
  //   The 440 floor matches the My Picks mobile bracket exactly, so the
  //   two views render at the same scale. At this cap the standings
  //   table absorbs the rest of the row and gets ~520px of horizontal
  //   room on a typical desktop viewport — plenty for ranks, names, and
  //   points without feeling sparse. The bracket's own `overflow-x-auto`
  //   wrapper handles the case where the picker column ever falls below
  //   440 (which only happens on sub-460 viewports, i.e. small phones).
  // - flex-1 on standings makes it claim every other pixel of the row.
  // - Below sm the layout falls back to a stacked column (flex-col) so
  //   the standings appears underneath the bracket (per user spec).
  // ---------------------------------------------------------------------
  if (restrictTo === "knockout") {
    return (
      <div className="space-y-4">
        {actionBar}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="sm:shrink-0 sm:max-w-[460px] min-w-0 space-y-6">
            {showPicker ? (
              <WhatIfBracketPicker
                matches={data.matches}
                teams={teams}
                overrides={overrides}
                onChange={setOverrides}
              />
            ) : (
              <NothingToSimulate />
            )}
          </div>
          <div className="flex-1 min-w-0">{standingsPanel}</div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Group phase layout.
  //
  // sm and up: 60/40 picker/standings split via a 5-col grid. The picker
  //   has matchup rows with home / "Draw" / away clusters plus three
  //   H/D/A buttons showing short codes (sm–md) or full names (md+), so
  //   it benefits from the wider 3/5 share.
  //
  // below sm (compact mobile): the two panes sit SIDE BY SIDE rather than
  //   stacking, so a player can see their what-if selections and the
  //   resulting standings together without scrolling a long way down. To
  //   fit a narrow phone the picker tiles collapse to flag-only (the Draw
  //   tile shows "D"), all three tiles staying equal width. The picker
  //   column is locked to an intrinsic width (shrink-0) just wide enough
  //   for three flag tiles; the standings column (flex-1, min-w-0) absorbs
  //   the rest and truncates long player names to an ellipsis.
  //
  // Implemented as flex below sm and grid at sm+ via a single wrapper that
  // swaps display utilities at the breakpoint. Using stock utilities only
  // (flex / sm:grid / sm:grid-cols-5) keeps the Tailwind JIT scanner
  // reliable — no dynamically-assembled arbitrary class strings.
  // ---------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {actionBar}
      {simulatePanel}
      <div className="flex sm:grid sm:grid-cols-5 gap-2 sm:gap-3">
        <div className="w-[150px] shrink-0 sm:w-auto sm:shrink sm:col-span-3 space-y-6 min-w-0">
          {showPicker ? (
            <WhatIfGroupPicker
              matches={data.matches}
              groups={groups}
              teams={teams}
              overrides={overrides}
              onChange={setOverrides}
              pool={pool}
            />
          ) : (
            <NothingToSimulate />
          )}
        </div>
        <div className="flex-1 sm:flex-none sm:col-span-2 min-w-0">
          {standingsPanel}
        </div>
      </div>
    </div>
  );
}

function NothingToSimulate() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
      <p className="text-[var(--color-text-secondary)]">
        All matches are already decided — nothing left to simulate.
      </p>
    </div>
  );
}
