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

  return (
    <div className="space-y-4">
      {/* Action bar */}
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

      {/*
        Two-column starting at sm (640px). Pickers left, standings right.
        We dropped the breakpoint all the way to sm — possible because both
        inner components (group picker and bracket picker) have been
        rewritten to let their row whitespace collapse naturally instead of
        stretching labels to fill the column. At the narrowest sm widths
        inside our max-w-5xl container this produces roughly a 370px picker
        column and 245px standings column, which is enough for both grids
        once their internal flex-1 stretch was removed.

        Only when the viewport is narrower than sm (< 640px) do the two
        tables stack — at that point the content genuinely can't share a
        row without hurting readability.

        gap-3 (was gap-4) claws back a bit more horizontal room in 2-col.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <div className="sm:col-span-3 space-y-6 min-w-0">
          {showPicker && restrictTo === "group" && (
            <WhatIfGroupPicker
              matches={data.matches}
              groups={groups}
              teams={teams}
              overrides={overrides}
              onChange={setOverrides}
            />
          )}

          {showPicker && restrictTo === "knockout" && (
            <WhatIfBracketPicker
              matches={data.matches}
              teams={teams}
              overrides={overrides}
              onChange={setOverrides}
            />
          )}

          {!showPicker && (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
              <p className="text-[var(--color-text-secondary)]">
                All matches are already decided — nothing left to simulate.
              </p>
            </div>
          )}
        </div>

        <div className="sm:col-span-2 min-w-0">
          <div className="sm:sticky sm:top-20">
            <WhatIfStandings rows={scored} poolSlug={poolSlug} />
          </div>
        </div>
      </div>
    </div>
  );
}
