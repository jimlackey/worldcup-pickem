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
}

const EMPTY: WhatIfOverrides = { groupResults: {}, knockoutWinners: {} };

export function WhatIfShell({
  data,
  groups,
  teams,
  poolSlug,
}: WhatIfShellProps) {
  const [overrides, setOverrides] = useState<WhatIfOverrides>(EMPTY);

  // Run the engine on every state change. Memoized — skipped when inputs are stable.
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

  // How many undecided matches exist in each phase?
  const undecidedGroup = data.matches.filter(
    (m) => m.phase === "group" && m.actual_status !== "completed"
  );
  const undecidedKnockout = data.matches.filter(
    (m) => m.phase !== "group" && m.actual_status !== "completed"
  );
  const showGroupPicker = undecidedGroup.length > 0;
  const showBracketPicker = undecidedKnockout.length > 0;

  const overrideCount =
    Object.keys(overrides.groupResults).length +
    Object.keys(overrides.knockoutWinners).length;

  return (
    <div className="space-y-6">
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

      {/* Two-column on desktop: picker(s) on the left, standings on the right.
          Mobile: stacked. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6 min-w-0">
          {showGroupPicker && (
            <WhatIfGroupPicker
              matches={data.matches}
              groups={groups}
              teams={teams}
              overrides={overrides}
              onChange={setOverrides}
            />
          )}

          {showBracketPicker && (
            <WhatIfBracketPicker
              matches={data.matches}
              teams={teams}
              overrides={overrides}
              onChange={setOverrides}
            />
          )}

          {!showGroupPicker && !showBracketPicker && (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
              <p className="text-[var(--color-text-secondary)]">
                All matches are already decided — nothing left to simulate.
              </p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 min-w-0">
          <div className="lg:sticky lg:top-20">
            <WhatIfStandings rows={scored} poolSlug={poolSlug} />
          </div>
        </div>
      </div>
    </div>
  );
}
