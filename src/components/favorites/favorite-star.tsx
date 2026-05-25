"use client";

import { useEffect, useState, useTransition } from "react";
import { toggleFavoriteAction } from "@/app/[poolSlug]/standings/favorite-actions";
import { cn } from "@/lib/utils/cn";

interface FavoriteStarProps {
  poolId: string;
  poolSlug: string;
  /**
   * The pick set the star refers to — i.e. the pick set being
   * favorited / unfavorited. Favorites are per-pick-set, so the same
   * participant's other pick sets each have their own independent
   * star button.
   */
  targetPickSetId: string;
  /**
   * Server-supplied "is this currently a favorite?" flag. The component
   * mirrors this into local state so the UI can flip instantly on click
   * before the server round-trip resolves.
   */
  isFavorite: boolean;
  /**
   * Optional accessible label override. Defaults to "Add to favorites"
   * / "Remove from favorites".
   */
  ariaLabel?: string;
  /**
   * Compact lets the standings rows render a 20×20 star without the
   * surrounding hover-pill padding the default 28×28 button has. The
   * what-if standings panel uses this — its rows are much tighter than
   * the main /standings rows.
   */
  size?: "default" | "compact";
}

/**
 * Tappable star icon that toggles the current user's favorite status
 * for a single pick set in this pool.
 *
 * IMPLEMENTATION NOTES:
 *
 *   - Optimistic update: we flip `localFav` immediately on click. If
 *     the server returns an error we revert and surface a small
 *     non-blocking title-attribute tooltip. The standings list does
 *     not need to re-sort on favorite changes, so no parent state
 *     juggling is required — the list of "all standings" stays the
 *     same; only the row's star fills/empties.
 *
 *   - We deliberately do NOT use <form action={...}> here. A button-
 *     in-form pattern would work, but the standings table row is
 *     ALSO a clickable area (the player name is a Link). Nesting a
 *     form inside the same flex container as a link, and stopping
 *     propagation manually, gets messy. A bare button with an
 *     onClick that builds FormData and calls the server action
 *     directly keeps the click target small and lets us call
 *     stopPropagation cleanly so a tap on the star doesn't also
 *     navigate to the player's picks page.
 *
 *   - When `isFavorite` (the server-supplied prop) changes — which
 *     happens after a successful action because we revalidate the
 *     path and the parent re-fetches — we trust the server state and
 *     resync localFav via useEffect.
 */
export function FavoriteStar({
  poolId,
  poolSlug,
  targetPickSetId,
  isFavorite,
  ariaLabel,
  size = "default",
}: FavoriteStarProps) {
  const [localFav, setLocalFav] = useState(isFavorite);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Resync local state when the server-supplied prop changes — happens
  // after a successful toggle because the server action calls
  // revalidatePath, which causes the parent server component to re-fetch
  // favorites and re-render with a new `isFavorite` value. We skip the
  // sync while a transition is pending so the optimistic flip isn't
  // clobbered mid-flight by a stale render.
  useEffect(() => {
    if (!pending) {
      setLocalFav(isFavorite);
    }
  }, [isFavorite, pending]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Critical: stop propagation so clicking the star doesn't also
    // trigger the surrounding row-link / card-link click handler.
    // preventDefault is for the rare case where the button is rendered
    // inside an <a> or a <Link>, where the browser would otherwise
    // navigate before the click handler completes.
    e.stopPropagation();
    e.preventDefault();

    const desired = !localFav;
    setLocalFav(desired);
    setError(null);

    const formData = new FormData();
    formData.set("poolId", poolId);
    formData.set("poolSlug", poolSlug);
    formData.set("targetPickSetId", targetPickSetId);
    formData.set("desired", desired ? "true" : "false");

    startTransition(async () => {
      const result = await toggleFavoriteAction(
        { success: false },
        formData
      );
      if (!result.success) {
        // Revert optimistic update on failure.
        setLocalFav(!desired);
        setError(result.error ?? "Could not update favorite.");
      }
    });
  };

  const label =
    ariaLabel ??
    (localFav ? "Remove from favorites" : "Add to favorites");

  // Two sizes:
  //   default: 28×28 hit area with hover pill — used on /standings rows
  //   compact: 20×20 bare icon — used in the dense what-if standings panel
  const isCompact = size === "compact";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={localFav}
      aria-label={label}
      title={error ?? label}
      className={cn(
        "inline-flex items-center justify-center shrink-0 transition-colors",
        isCompact
          ? "w-5 h-5 rounded"
          : "w-7 h-7 rounded-full hover:bg-[var(--color-surface-raised)]",
        // Star colour: gold when filled, muted/grey when empty.
        // We avoid pitch-green here because green is overloaded in this
        // app for correct picks / hypothetical winners.
        localFav
          ? "text-gold-500 hover:text-gold-600"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
        pending && "opacity-60 cursor-wait"
      )}
    >
      {/* Inline SVG keeps us off any new icon-library dependency.
          Path is the standard 5-point star at 24×24 viewBox.
          When filled (favorite): solid gold fill, no stroke.
          When empty: no fill, 1.5px stroke in currentColor. */}
      <svg
        viewBox="0 0 24 24"
        width={isCompact ? "14" : "18"}
        height={isCompact ? "14" : "18"}
        fill={localFav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.77l-5.9 3.0 1.13-6.57L2.45 9.54l6.6-.96L12 2.6z" />
      </svg>
    </button>
  );
}
