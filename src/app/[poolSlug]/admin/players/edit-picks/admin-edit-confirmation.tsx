"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AdminEditConfirmationProps {
  /**
   * Display name (preferred) and email of the target pick set's owner.
   * The banner and modal both surface this so the admin sees clearly
   * whose picks they're about to modify.
   */
  targetParticipantDisplayName: string | null;
  targetParticipantEmail: string;
  /**
   * Name of the pick set being edited (e.g. "Heather Collins 2"). One
   * participant can have multiple pick sets; the name disambiguates.
   */
  pickSetName: string;
  /**
   * When true, the picks belong to the logged-in admin themselves
   * (admin opened the admin-edit route on their own pick set). Skip
   * the confirmation modal in that case — the user is editing their
   * own picks, not someone else's, so the "are you sure these aren't
   * yours" warning would be backwards. Banner still shows so the
   * admin context is clear; only the modal is suppressed.
   */
  isOwnPickSet: boolean;
  /**
   * URL to return to if the admin clicks "Cancel" on the modal.
   * Typically the Admin Players page so they can pick a different
   * pick set or back out entirely.
   */
  cancelHref: string;
  /**
   * The actual edit form. Renders below the banner once the modal is
   * confirmed (or immediately when isOwnPickSet === true).
   */
  children: React.ReactNode;
}

/**
 * Wraps the admin pick-edit pages with a loud confirmation modal +
 * persistent banner.
 *
 * Modal behavior:
 *   - Renders on mount when the pick set does NOT belong to the
 *     current admin. Blocks the underlying form until acknowledged.
 *   - "Confirm" dismisses the modal; "Cancel" navigates back to the
 *     Admin Players page (no form mutation possible).
 *   - Suppressed entirely when isOwnPickSet === true.
 *
 * Banner behavior:
 *   - Always renders above the form when the wrapper is active. Even
 *     after the modal is dismissed, the admin should see at a glance
 *     whose picks they're editing.
 *
 * Why a modal rather than an inline disclaimer:
 *   - The user explicitly asked for a "loud validation modal" to avoid
 *     accidental updates. A passive banner is easy to ignore; a
 *     modal forces an explicit acknowledgement before any change is
 *     possible.
 *
 * Implementation notes:
 *   - The modal uses fixed positioning with a backdrop. role="dialog"
 *     + aria-modal="true" + an autofocused Confirm button keep
 *     keyboard navigation correct.
 *   - We don't pull in any modal library — the codebase doesn't use
 *     one anywhere else, and a self-contained ~30-line component
 *     here matches the project's preference for inlining UI
 *     primitives.
 *   - Escape key cancels (same as clicking Cancel). Common keyboard
 *     expectation for any blocking modal.
 */
export function AdminEditConfirmation({
  targetParticipantDisplayName,
  targetParticipantEmail,
  pickSetName,
  isOwnPickSet,
  cancelHref,
  children,
}: AdminEditConfirmationProps) {
  // Start the modal open whenever the pick set isn't the admin's own.
  // When it IS their own (rare but legal — admin browsed to the
  // admin-edit route for one of their own pick sets), skip the modal
  // entirely so we don't ask "are you sure these picks don't belong
  // to you?" when the answer is "they do".
  const [showModal, setShowModal] = useState(!isOwnPickSet);
  const router = useRouter();

  const displayName =
    targetParticipantDisplayName?.trim() || targetParticipantEmail;

  // Escape closes the modal (same effect as Cancel).
  useEffect(() => {
    if (!showModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        router.push(cancelHref);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showModal, router, cancelHref]);

  return (
    <>
      {/* Persistent banner. Stays above the form throughout the edit
          session as a constant visual reminder of whose picks the
          admin is touching. Coloured deliberately strong (amber
          rather than the neutral surface) so it doesn't blend in
          with the rest of the admin chrome.

          When isOwnPickSet we soften the wording — "Editing your own
          pick set as admin" — because the standard "Editing on
          behalf of {name}" copy would be misleading. */}
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm">
        <p className="font-semibold text-amber-900">
          {isOwnPickSet ? (
            <>Editing your own pick set as admin</>
          ) : (
            <>Editing picks on behalf of {displayName}</>
          )}
        </p>
        <p className="text-xs text-amber-800 mt-0.5">
          {isOwnPickSet ? (
            <>
              You&apos;re editing &quot;{pickSetName}&quot;. Changes will be
              recorded in the audit log as an admin edit.
            </>
          ) : (
            <>
              Editing &quot;{pickSetName}&quot;
              {targetParticipantDisplayName &&
              targetParticipantDisplayName !== targetParticipantEmail
                ? ` (${targetParticipantEmail})`
                : ""}
              . Every change is recorded in the audit log.
            </>
          )}
        </p>
      </div>

      {children}

      {/* Confirmation modal. Renders only when not the admin's own
          pick set and not yet dismissed. */}
      {showModal && (
        <div
          // Backdrop + centring.
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-edit-modal-title"
          // Clicking the backdrop is treated as Cancel — common
          // affordance and matches the Escape-key behaviour.
          onClick={() => router.push(cancelHref)}
        >
          <div
            className="max-w-md w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl p-5 space-y-4"
            // Stop propagation so a click inside the modal body
            // doesn't reach the backdrop's onClick and dismiss the
            // dialog unexpectedly.
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2
                id="admin-edit-modal-title"
                className="text-lg font-display font-bold text-amber-900"
              >
                Confirm admin edit
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                You are about to edit picks that do NOT belong to you.
              </p>
            </div>

            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 text-sm space-y-1">
              <p>
                <span className="text-[var(--color-text-muted)] text-xs">
                  Pick set:
                </span>{" "}
                <span className="font-medium">{pickSetName}</span>
              </p>
              <p>
                <span className="text-[var(--color-text-muted)] text-xs">
                  Owner:
                </span>{" "}
                <span className="font-medium">{displayName}</span>
              </p>
              {targetParticipantDisplayName &&
                targetParticipantDisplayName !==
                  targetParticipantEmail && (
                  <p>
                    <span className="text-[var(--color-text-muted)] text-xs">
                      Email:
                    </span>{" "}
                    <span className="font-mono text-xs">
                      {targetParticipantEmail}
                    </span>
                  </p>
                )}
            </div>

            <p className="text-xs text-[var(--color-text-muted)]">
              Every change will be recorded in the audit log along with
              your name and the diff. Continue only if you have the
              owner&apos;s permission to make this change.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => router.push(cancelHref)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                autoFocus
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Yes, edit on their behalf
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
