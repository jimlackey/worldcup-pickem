"use client";

import { useMemo, useState } from "react";
import type { Group, Team } from "@/types/database";
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
   * Which phase's matches to expose in the picker column.
   *   "group"    — Phase 2 (Group games underway): show Group Phase picker only.
   *   "knockout" — Phase 4 (Knockout games underway): show Knockout Bracket only.
   *
   * The standings panel always reflects the full tournament regardless of
   * which picker is visible.
   */
  restrictTo: "group" | "knockout";
}

const EMPTY: WhatIfOverrides = { groupResults: {}, knockoutWinners: {} };

export function WhatIfShell({
  data,
  groups,
  teams,
  poolSlug,
  restrictTo,
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
      <WhatIfStandings rows={scored} poolSlug={poolSlug} />
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
  //   picker.tsx) now uses a fixed-width-per-column layout (5 × COLUMN_W
  //   ≈ 410px), so the picker column lands at the bracket's full width
  //   minus a few pixels of padding.
  // - sm:max-w-[430px] caps the picker so the standings table on the
  //   right always has a workable amount of horizontal space. The cap
  //   is set just above the bracket's natural ~410px so the bracket
  //   itself doesn't trigger horizontal scroll. If the bracket ever
  //   does need more than the cap (e.g. COLUMN_W bumps), its own
  //   `overflow-x-auto` wrapper takes over and scrolls inside the
  //   picker column — without ever pushing the standings off-screen.
  // - flex-1 on standings makes it claim every other pixel of the row.
  // - Below sm the layout falls back to a stacked column (flex-col) — at
  //   that width, side-by-side becomes unreadable.
  // ---------------------------------------------------------------------
  if (restrictTo === "knockout") {
    return (
      <div className="space-y-4">
        {actionBar}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="sm:shrink-0 sm:max-w-[430px] min-w-0 space-y-6">
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
  // Group phase layout: 60/40 picker/standings split.
  //
  // The group picker has matchup rows with home / "vs" / away clusters
  // plus three H/D/A buttons, so it benefits from the wider 3/5 share.
  // Below sm it stacks. Unchanged from the original layout — only the
  // knockout branch above has been adjusted.
  // ---------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {actionBar}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <div className="sm:col-span-3 space-y-6 min-w-0">
          {showPicker ? (
            <WhatIfGroupPicker
              matches={data.matches}
              groups={groups}
              teams={teams}
              overrides={overrides}
              onChange={setOverrides}
            />
          ) : (
            <NothingToSimulate />
          )}
        </div>
        <div className="sm:col-span-2 min-w-0">{standingsPanel}</div>
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
