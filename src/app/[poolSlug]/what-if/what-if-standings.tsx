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
    <div className="space-y-2">
      <h2 className="text-lg font-display font-bold">Standings</h2>
      <p className="text-xs text-[var(--color-text-muted)]">
        Live preview. Arrow shows movement from actual standings.
      </p>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-surface-raised)] text-left">
              <th className="px-3 py-2 font-semibold text-[var(--color-text-secondary)] w-10">
                #
              </th>
              <th className="px-3 py-2 font-semibold text-[var(--color-text-secondary)]">
                Player
              </th>
              <th className="px-3 py-2 font-semibold text-[var(--color-text-secondary)] text-right">
                Pts
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((row) => (
              <tr
                key={row.pick_set_id}
                className="hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                <td className="px-3 py-2 tabular-nums text-[var(--color-text-secondary)]">
                  {row.rank}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">
                      {row.pick_set_name}
                    </span>
                    <RankDelta delta={row.rank_delta} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">
                  {row.total_points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankDelta({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;

  // Positive delta = moved UP (better rank number went down)
  const isUp = delta > 0;
  const magnitude = Math.abs(delta);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-2xs font-semibold tabular-nums shrink-0 px-1 py-0.5 rounded",
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
