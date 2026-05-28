"use client";

import { useActionState } from "react";
import { emailMyPicksAction } from "./email-picks-action";
import type { EmailPicksResult } from "./email-picks-action";
import type { Pool } from "@/types/database";
import { cn } from "@/lib/utils/cn";

const initial: EmailPicksResult = { success: false };

/**
 * "Email My Picks" button + explanatory note for the /my-picks page.
 *
 * Posts to emailMyPicksAction, which emails the player a snapshot of all
 * their pick sets (which widgets appear depends on the tournament phase —
 * see the action). The note tells the player exactly where the mail goes
 * and who it comes from before they click.
 *
 * Rendered inside the lock-badge row in the dashboard: the badge stays
 * left-aligned, this button sits at the right. The note drops below the
 * row (full width) so it doesn't fight the badge for horizontal space.
 */
export function EmailMyPicksButton({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(emailMyPicksAction, initial);

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <form action={action}>
        <input type="hidden" name="poolId" value={pool.id} />
        <input type="hidden" name="poolSlug" value={pool.slug} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors tap-target"
        >
          {pending ? "Sending…" : "Email My Picks"}
        </button>
      </form>
      {state.error && (
        <p className="text-xs text-red-600 text-right max-w-xs">{state.error}</p>
      )}
      {state.success && state.message && (
        <p className="text-xs text-pitch-600 text-right">{state.message}</p>
      )}
    </div>
  );
}

/**
 * The explanatory note describing what "Email My Picks" does. The
 * dashboard places it inline to the left of the button on wide screens
 * (passing a right-align + max-width className) and lets it wrap below on
 * narrow screens. Accepts a className so the caller controls alignment
 * and width without this component hard-coding a layout assumption.
 */
export function EmailMyPicksNote({
  recipientEmail,
  fromAddress,
  className,
}: {
  recipientEmail: string;
  fromAddress: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-2xs text-[var(--color-text-muted)] leading-relaxed",
        className
      )}
    >
      &quot;Email My Picks&quot; sends a snapshot of all your pick sets to{" "}
      <span className="font-medium text-[var(--color-text-secondary)]">
        {recipientEmail}
      </span>
      . The email comes from{" "}
      <span className="font-medium text-[var(--color-text-secondary)]">
        {fromAddress}
      </span>
      .
    </p>
  );
}
