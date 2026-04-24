"use client";

import Link from "next/link";
import type { ScoredRow } from "@/lib/what-if/scoring-engine";
import { cn } from "@/lib/utils/cn";

interface WhatIfStandingsProps {
  rows: ScoredRow[];
  poolSlug: string;
}

export function WhatIfStandings({ rows, poolSlug }: WhatIfStandingsProps) {
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
        <h2 className="text-lg font-display font-bold">What-If Standings</h2>
        <span className="text-2xs text-[var(--color-text-muted)]">
          ↑↓ vs actual
        </span>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden divide-y divide-[var(--color-border)]">
        {rows.map((row) => (
          // Rank + name pinned left, delta + points pinned right.
          // justify-between is what produces the collapsible gap between
          // them — as the column narrows, the gap shrinks first. Previously
          // the name had `flex-1 min-w-0` which stretched it to fill the
          // row, causing the visible whitespace between the name and the
          // points column to never actually compress.
          <div
            key={row.pick_set_id}
            className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-[var(--color-surface-raised)] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs tabular-nums text-[var(--color-text-muted)] w-6 shrink-0 text-right">
                {row.rank}
              </span>
              {/*
                Name is the hyperlink. We deliberately keep it neutral-coloured
                (inherits default text) rather than pitch-green, because green
                in this app already signals correct picks / hypothetical
                winners / selected options — layering it on plain navigation
                links made the standings feel noisy. The affordance comes
                from hover:underline alone, which is the web's near-universal
                link convention. Matches the /standings page treatment.

                Keeping the interactive area tight to the name itself means
                the row's background hover and the points column stay neutral.
              */}
              <Link
                href={`/${poolSlug}/picks/${row.pick_set_id}`}
                className="text-sm font-medium hover:underline underline-offset-2 truncate transition-colors"
              >
                {row.pick_set_name}
              </Link>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <RankDelta delta={row.rank_delta} />
              <span className="text-sm font-bold tabular-nums w-8 text-right">
                {row.total_points}
              </span>
            </div>
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
