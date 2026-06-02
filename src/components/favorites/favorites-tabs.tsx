"use client";

import { track } from "@vercel/analytics";
import { cn } from "@/lib/utils/cn";

export type FavoritesTabKey = "all" | "favorites";

interface FavoritesTabsProps {
  /**
   * Currently active tab.
   */
  active: FavoritesTabKey;
  /**
   * Called when the user clicks a different tab.
   */
  onChange: (next: FavoritesTabKey) => void;
  /**
   * Optional count badge for the Favorites tab. When provided, the tab
   * shows " (N)" next to the label so the user can see how many
   * favorites they have without first switching to the tab. Hidden when
   * undefined (e.g. logged-out callers that don't have a count).
   */
  favoritesCount?: number;
  /**
   * When the visitor isn't logged in, the Favorites tab is disabled
   * (with a title-attribute tooltip explaining why). This stays visible
   * rather than being hidden entirely so logged-out visitors can
   * discover the feature exists.
   */
  disabled?: boolean;
  /**
   * Identifies which page hosts this tab strip (e.g. "standings",
   * "what-if", "game-drilldown"). Sent as a property on the
   * `favorites_tab` analytics event so the same shared component's
   * usage can be told apart in the Vercel dashboard. When omitted,
   * the event still fires with view only.
   */
  context?: string;
}

/**
 * Sub-tab strip used on /standings and /what-if to switch between the
 * full standings view and the favorites-only view.
 *
 * Visual treatment mirrors the rest of the app's pill/segmented-button
 * controls: rounded-lg outer frame, divider between buttons, an
 * underline-style "active" indicator inside each button. We intentionally
 * use a stock segmented-button shape rather than introducing a true
 * tablist with arrow-key navigation — there are only two tabs and the
 * adjacent filter input is the primary keyboard target on this page.
 */
export function FavoritesTabs({
  active,
  onChange,
  favoritesCount,
  disabled = false,
  context,
}: FavoritesTabsProps) {
  // Wrap the parent's onChange so a user-initiated tab switch also
  // emits an analytics event. Fires only on an actual change (not a
  // re-click of the active tab) so the counts reflect genuine
  // switches. The optional `context` distinguishes the three pages
  // that share this component.
  function handleChange(next: FavoritesTabKey) {
    if (next !== active) {
      track("favorites_tab", {
        view: next,
        ...(context ? { context } : {}),
      });
    }
    onChange(next);
  }

  return (
    <div
      role="tablist"
      aria-label="Standings view"
      className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
    >
      <TabButton
        active={active === "all"}
        onClick={() => handleChange("all")}
        label="Standings"
      />
      <TabButton
        active={active === "favorites"}
        onClick={() => handleChange("favorites")}
        label="Favorites"
        count={favoritesCount}
        disabled={disabled}
        disabledTitle="Log in to use favorites"
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  disabled,
  disabledTitle,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      className={cn(
        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
        active
          ? "bg-[var(--color-surface-raised)] text-[var(--color-text)]"
          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
        disabled && "opacity-50 cursor-not-allowed hover:text-[var(--color-text-secondary)]"
      )}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={cn(
            "ml-1.5 tabular-nums",
            active
              ? "text-[var(--color-text-secondary)]"
              : "text-[var(--color-text-muted)]"
          )}
        >
          ({count})
        </span>
      )}
    </button>
  );
}
