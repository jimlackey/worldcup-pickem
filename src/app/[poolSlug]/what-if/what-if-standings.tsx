"use client";

import type { ScoredRow } from "@/lib/what-if/scoring-engine";
import { cn } from "@/lib/utils/cn";

interface WhatIfStandingsProps {
  rows: ScoredRow[];
  poolSlug: string;
}

export function WhatIfStandings({ rows }: WhatIfStandingsProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          No players yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-display font-bold">Standings</h2>
        <span className="text-2xs text-[var(--color-text-muted)]">
          ↑↓ vs actual
        </span>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden divide-y divide-[var(--color-border)]">
        {rows.map((row) => (
          <div
            key={row.pick_set_id}
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--color-surface-raised)] transition-colors"
          >
            <span className="text-xs tabular-nums text-[var(--color-text-muted)] w-6 shrink-0 text-right">
              {row.rank}
            </span>
            <span className="text-sm font-medium truncate flex-1 min-w-0">
              {row.pick_set_name}
            </span>
            <RankDelta delta={row.rank_delta} />
            <span className="text-sm font-bold tabular-nums shrink-0 w-8 text-right">
              {row.total_points}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankDelta({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;

  const isUp = delta > 0;
  const magnitude = Math.abs(delta);

  return (
    <span
      className={cn(
        "inline-flex items-center text-2xs font-semibold tabular-nums shrink-0 px-1 py-0.5 rounded leading-none",
        isUp ? "bg-pitch-100 text-pitch-700" : "bg-red-100 text-red-700"
      )}
      title={
        isUp
          ? `Moved up ${magnitude} place${magnitude === 1 ? "" : "s"}`
          : `Moved down ${magnitude} place${magnitude === 1 ? "" : "s"}`
      }
    >
      {isUp ? "↑" : "↓"}
      {magnitude}
    </span>
  );
}
