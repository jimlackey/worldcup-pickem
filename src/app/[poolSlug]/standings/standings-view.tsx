"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StandingsRow } from "@/types/database";
import { cn } from "@/lib/utils/cn";
import {
  FavoritesTabs,
  type FavoritesTabKey,
} from "@/components/favorites/favorites-tabs";
import { FavoriteStar } from "@/components/favorites/favorite-star";

interface StandingsViewProps {
  standings: StandingsRow[];
  poolSlug: string;
  poolId: string;
  groupPicksOpen: boolean;
  knockoutPicksOpen: boolean;
  groupPickCounts: Record<string, number>;
  knockoutPickCounts: Record<string, number>;
  /**
   * Pick set IDs the current logged-in user has favorited in this
   * pool. Empty array if not logged in or no favorites set yet.
   * Passed as an array (not a Set) so the prop is serializable across
   * the server → client boundary.
   *
   * Note: keyed on pick set, not participant. A player with three pick
   * sets has three independent stars and can be partially favorited
   * (e.g. set 1 starred, sets 2 and 3 not).
   */
  favoritePickSetIds: string[];
  /**
   * Whether the visitor is logged in. Controls whether the star icons
   * render and whether the Favorites sub-tab is interactable.
   */
  isLoggedIn: boolean;
}

export function StandingsView({
  standings,
  poolSlug,
  poolId,
  groupPicksOpen,
  knockoutPicksOpen,
  groupPickCounts,
  knockoutPickCounts,
  favoritePickSetIds,
  isLoggedIn,
}: StandingsViewProps) {
  // Convert to a Set once for O(1) membership checks in render.
  const favoriteIds = useMemo(
    () => new Set(favoritePickSetIds),
    [favoritePickSetIds]
  );

  // Sub-tab state. We deliberately do NOT persist this to the URL —
  // both tabs render the same standings shape, so a URL hash would add
  // noise without giving the user anything they couldn't get from a
  // single click after landing. Default tab is always "all".
  const [tab, setTab] = useState<FavoritesTabKey>("all");

  // Filter state — live "contains" search against the player/pick set name.
  // Held in this client component so filtering is instant; the server-rendered
  // `standings` array is the canonical source of truth (and the source of
  // ranks, which we preserve through the filter).
  const [filter, setFilter] = useState("");

  // Two-stage filter:
  //   1. Tab filter — Favorites tab keeps only rows whose pick_set_id
  //      is in the favoriteIds set. The All tab is a no-op pass-through.
  //   2. Text filter — same case-insensitive substring match as before.
  //
  // Ranks come from the server-side `row.rank` field, which reflects the
  // FULL standings. Filtering the visible array never re-ranks; a player
  // sitting in 5th place still shows as #5 when they're the only
  // favorited row.
  const tabFiltered = useMemo(() => {
    if (tab === "favorites") {
      return standings.filter((row) => favoriteIds.has(row.pick_set_id));
    }
    return standings;
  }, [tab, standings, favoriteIds]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return tabFiltered;
    return tabFiltered.filter((row) =>
      row.pick_set_name.toLowerCase().includes(needle)
    );
  }, [filter, tabFiltered]);

  if (standings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">
          No players yet. Standings will appear once players join the pool.
        </p>
      </div>
    );
  }

  // Group picks open = pre-lock: hide points, hide links, show group pick progress
  // Group locked + knockout open = show group points + links, show KO pick progress
  // Both locked = full standings with points and links
  const groupPreLock = groupPicksOpen;
  const showPoints = !groupPreLock;
  const showLinks = !groupPreLock; // Can link to pick details once group is locked

  const isFiltering = filter.trim().length > 0;
  const hasMatches = filtered.length > 0;

  // Distinct counts:
  //   - favoritesCount drives the badge on the tab. Since favorites are
  //     keyed on pick set, this is the literal number of visible rows
  //     on the Favorites tab (no participant→multiple-rows expansion).
  //   - On the Favorites tab with NO favorites yet, we render a
  //     dedicated empty state instead of the "no matches" filter state.
  const favoritesCount = favoritePickSetIds.length;
  const showFavoritesEmptyState =
    tab === "favorites" && favoritesCount === 0;

  return (
    <div>
      {/* Sub-tab strip. Sits above the filter input so it's the first
          control the eye lands on. */}
      <div className="mb-3">
        <FavoritesTabs
          active={tab}
          onChange={setTab}
          favoritesCount={isLoggedIn ? favoritesCount : undefined}
          disabled={!isLoggedIn}
        />
      </div>

      {groupPreLock && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          Group phase picks are still open. Picks will be visible after they are locked.
        </p>
      )}
      {!groupPreLock && knockoutPicksOpen && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          Knockout picks are still open. Knockout bracket picks will be visible once locked.
        </p>
      )}

      {/* Filter input.

          The visual treatment matches the pool-creation form input
          (super-admin / create-pool-form) — same border, radius, padding,
          and pitch-green focus ring — so it feels like the same control
          family as the rest of the app's text inputs.

          Mobile: inputs default to 16px font in this codebase, which keeps
          iOS Safari from auto-zooming on focus, so no special override
          needed. The clear (×) button only renders when there's text, and
          is keyboard-reachable. */}
      <div className="mb-3">
        <div className="relative">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter players…"
            aria-label="Filter players by name"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 pr-9 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 transition-colors"
          />
          {isFiltering && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)] transition-colors"
            >
              {/* Inline × glyph keeps us off any new icon dependency. */}
              <span aria-hidden="true" className="text-base leading-none">
                ×
              </span>
            </button>
          )}
        </div>
        {isFiltering && (
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
            Showing {filtered.length} of {tabFiltered.length} player
            {tabFiltered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Favorites tab, no favorites yet — distinct empty state separate
          from the "no players yet" empty state at the top of the
          component, and separate from the filter no-match state below.
          Tells the user how to add their first favorite. */}
      {showFavoritesEmptyState && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)]">
            No favorites yet.
          </p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Tap the star icon next to a pick set on the Standings tab to
            follow it here.
          </p>
        </div>
      )}

      {/* No-match empty state — distinct from the "no players yet" state at
          the top of the component (which fires when the pool itself has zero
          standings rows). This one only shows when the user's filter has
          excluded everything; reset is one click away via the × button or
          backspace. */}
      {!showFavoritesEmptyState && !hasMatches && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)]">
            {isFiltering
              ? `No players match \u201C${filter.trim()}\u201D.`
              : tab === "favorites"
                ? "None of your favorites match the current filter."
                : "No players to show."}
          </p>
        </div>
      )}

      {!showFavoritesEmptyState && hasMatches && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <StandingsTable
              standings={filtered}
              poolSlug={poolSlug}
              poolId={poolId}
              groupPreLock={groupPreLock}
              showPoints={showPoints}
              showLinks={showLinks}
              knockoutPicksOpen={knockoutPicksOpen}
              groupPickCounts={groupPickCounts}
              knockoutPickCounts={knockoutPickCounts}
              favoriteIds={favoriteIds}
              isLoggedIn={isLoggedIn}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((row) => (
              <StandingsCard
                key={row.pick_set_id}
                row={row}
                poolSlug={poolSlug}
                poolId={poolId}
                groupPreLock={groupPreLock}
                showPoints={showPoints}
                showLinks={showLinks}
                knockoutPicksOpen={knockoutPicksOpen}
                groupPickCount={groupPickCounts[row.pick_set_id] ?? 0}
                knockoutPickCount={knockoutPickCounts[row.pick_set_id] ?? 0}
                isFavorite={favoriteIds.has(row.pick_set_id)}
                isLoggedIn={isLoggedIn}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StandingsTable({
  standings,
  poolSlug,
  poolId,
  groupPreLock,
  showPoints,
  showLinks,
  knockoutPicksOpen,
  groupPickCounts,
  knockoutPickCounts,
  favoriteIds,
  isLoggedIn,
}: {
  standings: StandingsRow[];
  poolSlug: string;
  poolId: string;
  groupPreLock: boolean;
  showPoints: boolean;
  showLinks: boolean;
  knockoutPicksOpen: boolean;
  groupPickCounts: Record<string, number>;
  knockoutPickCounts: Record<string, number>;
  favoriteIds: Set<string>;
  isLoggedIn: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-surface-raised)] text-left">
            {showPoints && (
              <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] w-12">
                #
              </th>
            )}
            {/* Star column. We render the header cell even when logged
                out so the table doesn't visually re-flow on login —
                logged-out users just see an empty header. Width is
                fixed (w-10) so a present/absent star never resizes the
                player-name column. */}
            {isLoggedIn && (
              <th className="px-2 py-2.5 w-10" aria-label="Favorite" />
            )}
            <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)]">
              Player
            </th>
            {groupPreLock && (
              <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                Group Picks
              </th>
            )}
            {knockoutPicksOpen && (
              <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                Knockout Picks
              </th>
            )}
            {showPoints && (
              <>
                <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                  Group
                </th>
                <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                  Knockout
                </th>
                <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                  Total
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {standings.map((row, i) => {
            const groupCount = groupPickCounts[row.pick_set_id] ?? 0;
            const knockoutCount = knockoutPickCounts[row.pick_set_id] ?? 0;

            // Use the server-computed rank as the source of truth. The
            // previous fallback `i + 1` was fine when the visible list and
            // the standings list were the same array, but with filtering
            // they're decoupled — using `i + 1` would relabel the top of a
            // filtered list as #1, which would be wrong (a player in 5th
            // place should still show as #5 even when they're the only
            // visible row). Falling back to 0 makes RankBadge render its
            // neutral state if rank is somehow missing.
            const rank = row.rank ?? 0;
            const isFav = favoriteIds.has(row.pick_set_id);

            return (
              <tr
                key={row.pick_set_id}
                className={cn(
                  "bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] transition-colors",
                  showPoints && i < 3 && "font-medium"
                )}
              >
                {showPoints && (
                  <td className="px-4 py-3">
                    <RankBadge rank={rank} />
                  </td>
                )}
                {isLoggedIn && (
                  <td className="px-2 py-3">
                    <FavoriteStar
                      poolId={poolId}
                      poolSlug={poolSlug}
                      targetPickSetId={row.pick_set_id}
                      isFavorite={isFav}
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  {showLinks ? (
                    // Neutral link styling: inherits the default text colour
                    // rather than pitch-green, because green is already used
                    // in this app to signal correct picks / hypothetical
                    // winners / selected options, and overloading it on plain
                    // navigation links made the standings feel noisy. The
                    // affordance comes from hover:underline alone, which is
                    // the web's near-universal link convention.
                    <Link
                      href={`/${poolSlug}/picks/${row.pick_set_id}`}
                      className="font-medium hover:underline underline-offset-2 truncate block transition-colors"
                    >
                      {row.pick_set_name}
                    </Link>
                  ) : (
                    <span className="font-medium">{row.pick_set_name}</span>
                  )}
                </td>
                {groupPreLock && (
                  <td className="px-4 py-3 text-right">
                    <PickProgress current={groupCount} total={72} />
                  </td>
                )}
                {knockoutPicksOpen && (
                  <td className="px-4 py-3 text-right">
                    <PickProgress current={knockoutCount} total={31} />
                  </td>
                )}
                {showPoints && (
                  <>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.group_points}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.knockout_points}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">
                      {row.total_points}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StandingsCard({
  row,
  poolSlug,
  poolId,
  groupPreLock,
  showPoints,
  showLinks,
  knockoutPicksOpen,
  groupPickCount,
  knockoutPickCount,
  isFavorite,
  isLoggedIn,
}: {
  row: StandingsRow;
  poolSlug: string;
  poolId: string;
  groupPreLock: boolean;
  showPoints: boolean;
  showLinks: boolean;
  knockoutPicksOpen: boolean;
  groupPickCount: number;
  knockoutPickCount: number;
  isFavorite: boolean;
  isLoggedIn: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {showPoints && <RankBadge rank={row.rank ?? 0} />}
            {/* Star sits between the rank badge and the name, matching
                the desktop column order. Rendered only when logged in
                so guests don't see an inert control. */}
            {isLoggedIn && (
              <FavoriteStar
                poolId={poolId}
                poolSlug={poolSlug}
                targetPickSetId={row.pick_set_id}
                isFavorite={isFavorite}
              />
            )}
            {/*
              On the mobile card the whole card is a <Link>, so the name
              itself is just a span. Previously `showLinks` added
              `text-pitch-600` to tint the name green; we've dropped that to
              keep link colouring neutral (green is reserved in this app for
              correct picks / hypothetical winners / selected options). The
              card's own hover affordance (border + shadow on hover, handled
              below) is what still signals "this card is clickable".
            */}
            <span className="font-display font-semibold truncate">
              {row.pick_set_name}
            </span>
          </div>
        </div>
        {showPoints && (
          <span className="text-base font-bold tabular-nums shrink-0 ml-3">
            {row.total_points} <span className="text-2xs font-normal text-[var(--color-text-muted)]">pts</span>
          </span>
        )}
      </div>

      {groupPreLock && (
        <div className="flex gap-4 mt-2 text-xs text-[var(--color-text-secondary)]">
          <PickProgress current={groupPickCount} total={72} />
        </div>
      )}

      {knockoutPicksOpen && (
        <div className="flex gap-4 mt-2 text-xs text-[var(--color-text-secondary)]">
          <PickProgress current={knockoutPickCount} total={31} label="Knockout" />
        </div>
      )}

      {showPoints && !knockoutPicksOpen && (
        <div className={cn("flex gap-4 mt-2 text-xs text-[var(--color-text-secondary)]", showPoints && "ml-8")}>
          <span>Group: {row.group_points}</span>
          <span>Knockout: {row.knockout_points}</span>
        </div>
      )}

      {showPoints && knockoutPicksOpen && (
        <div className="flex gap-4 mt-2 ml-8 text-xs text-[var(--color-text-secondary)]">
          <span>Group: {row.group_points}</span>
        </div>
      )}
    </>
  );

  if (showLinks) {
    return (
      <Link
        href={`/${poolSlug}/picks/${row.pick_set_id}`}
        className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-pitch-400 hover:shadow-sm transition-all"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      {content}
    </div>
  );
}

function PickProgress({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label?: string;
}) {
  const isComplete = current >= total;
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        isComplete ? "text-pitch-600 font-medium" : "text-[var(--color-text-muted)]"
      )}
    >
      {label && <span className="mr-1">{label}:</span>}
      {current} of {total}
      {isComplete && " ✓"}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  // Rank styles — gold/silver/bronze all use the -100 / -700 / -200 pattern
  // for consistent contrast. Previously rank 3 used -50 / -600 / -200 which
  // rendered too washed out next to the other two badges.
  const styles =
    rank === 1
      ? "bg-gold-100 text-gold-700 border-gold-200"
      : rank === 2
        ? "bg-gray-100 text-gray-600 border-gray-200"
        : rank === 3
          ? "bg-orange-100 text-orange-700 border-orange-200"
          : "bg-transparent text-[var(--color-text-muted)] border-transparent";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border",
        styles
      )}
    >
      {rank}
    </span>
  );
}
