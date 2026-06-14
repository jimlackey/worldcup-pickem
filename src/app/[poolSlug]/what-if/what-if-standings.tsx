"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ScoredRow } from "@/lib/what-if/scoring-engine";
import { cn } from "@/lib/utils/cn";
import {
  FavoritesTabs,
  type FavoritesTabKey,
} from "@/components/favorites/favorites-tabs";
import { FavoriteStar } from "@/components/favorites/favorite-star";

interface WhatIfStandingsProps {
  rows: ScoredRow[];
  poolSlug: string;
  /**
   * Pool UUID — required by the favorite-star button on each row.
   */
  poolId: string;
  /**
   * Pick set IDs the logged-in user has favorited in this pool. Drives
   * the Favorites sub-tab and the filled/empty state of each row's
   * star. Keyed on pick set, not participant — so a player with three
   * pick sets can have any subset of them starred.
   */
  favoritePickSetIds: string[];
  /**
   * Whether the visitor is logged in. Controls whether the star icons
   * render at all, and whether the Favorites sub-tab is interactable.
   */
  isLoggedIn: boolean;
}

export function WhatIfStandings({
  rows,
  poolSlug,
  poolId,
  favoritePickSetIds,
  isLoggedIn,
}: WhatIfStandingsProps) {
  const favoriteIds = useMemo(
    () => new Set(favoritePickSetIds),
    [favoritePickSetIds]
  );

  // Sub-tab state. Matches the /standings page treatment: not URL-
  // persisted, defaults to "all". Independent from the /standings page's
  // local tab state — switching tabs here doesn't affect the other page.
  const [tab, setTab] = useState<FavoritesTabKey>("all");

  // Filter the visible rows by tab. Ranks (and rank deltas) on each row
  // are computed against the full standings inside the scoring engine,
  // so filtering here does not re-rank — a player in 5th still shows
  // as #5 even when they're the only favorited row visible.
  const filteredRows = useMemo(() => {
    if (tab === "favorites") {
      return rows.filter((row) => favoriteIds.has(row.pick_set_id));
    }
    return rows;
  }, [tab, rows, favoriteIds]);

  const favoritesCount = favoritePickSetIds.length;
  const showFavoritesEmptyState =
    tab === "favorites" && favoritesCount === 0;

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
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-display font-bold">What-If Standings</h2>
        <span className="text-2xs text-[var(--color-text-muted)]">
          ↑↓ vs actual
        </span>
      </div>

      {/* Sub-tab strip. Sits between the heading and the standings list
          (no separate filter input here, unlike /standings — what-if
          panels are compact and a search box would be overkill). */}
      <div>
        <FavoritesTabs
          active={tab}
          onChange={setTab}
          favoritesCount={isLoggedIn ? favoritesCount : undefined}
          disabled={!isLoggedIn}
          context="what-if"
        />
      </div>

      {showFavoritesEmptyState && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center">
          <p className="text-xs text-[var(--color-text-secondary)]">
            No favorites yet.
          </p>
          <p className="text-2xs text-[var(--color-text-muted)] mt-1">
            Tap the star next to a pick set on the Standings tab.
          </p>
        </div>
      )}

      {!showFavoritesEmptyState && filteredRows.length === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center">
          <p className="text-xs text-[var(--color-text-secondary)]">
            No players to show.
          </p>
        </div>
      )}

      {!showFavoritesEmptyState && filteredRows.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden divide-y divide-[var(--color-border)]">
          {filteredRows.map((row) => (
            // Rank + name pinned left, delta + points pinned right.
            // justify-between is what produces the collapsible gap between
            // them — as the column narrows, the gap shrinks first. Previously
            // the name had `flex-1 min-w-0` which stretched it to fill the
            // row, causing the visible whitespace between the name and the
            // points column to never actually compress.
            //
            // Row text size is text-xs to match the What-If bracket on the
            // left (see what-if-bracket-picker.tsx). Earlier the bracket was
            // text-2xs and the standings was text-sm — two sizes apart, with
            // the page reading visually unbalanced. Pulling them both to
            // text-xs lets the eye treat the bracket and the standings as
            // peer halves of the same view, which pairs with the wider
            // bracket and tighter sm:max-w-[530px] cap on the picker column.
            <div
              key={row.pick_set_id}
              className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-[var(--color-surface-raised)] transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs tabular-nums text-[var(--color-text-muted)] w-6 shrink-0 text-right">
                  {row.rank}
                </span>
                {/* Compact star. Only rendered when logged in. We use the
                    compact size variant because each row is text-xs / py-1.5
                    — the default 28×28 hit area would dominate the row.
                    The compact 20×20 stays clear of the name and points but
                    is still big enough to tap on touch devices. */}
                {isLoggedIn && (
                  <FavoriteStar
                    poolId={poolId}
                    poolSlug={poolSlug}
                    targetPickSetId={row.pick_set_id}
                    isFavorite={favoriteIds.has(row.pick_set_id)}
                    size="compact"
                  />
                )}
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
                  className="text-xs font-medium hover:underline underline-offset-2 truncate transition-colors max-w-[92px] sm:max-w-none"
                >
                  {row.pick_set_name}
                </Link>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <RankDelta delta={row.rank_delta} />
                <span className="text-xs font-bold tabular-nums w-8 text-right">
                  {row.total_points}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
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
