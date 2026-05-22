"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { sendBroadcastEmailAction } from "./actions";
import { applyBodyTokens } from "@/lib/email/standings-summary";
import {
  RECIPIENT_LIST_VALUES,
  RECIPIENT_LIST_SHORT_LABELS,
  type RecipientListValue,
} from "./recipient-lists";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

interface EmailFormProps {
  pool: Pool;
  /**
   * Pre-computed recipient counts for each list option, computed by the
   * server component. The form uses these to label the dropdown entries
   * inline ("All active users — 57") and to drive the dynamic Send button
   * count + disabled state.
   */
  recipientCounts: Record<RecipientListValue, number>;
  /**
   * Pre-rendered preview bundles, one per recipient list. The form
   * shows the bundle that matches the currently-selected dropdown
   * value, so switching the dropdown swaps the preview to a participant
   * from the new list (no extra round-trip — bundles are computed
   * server-side on initial render).
   */
  previewBundles: Record<RecipientListValue, PreviewBundle>;
}

/**
 * One rendering of the three widgets for a single representative
 * participant. participantName is null when the corresponding list has
 * no eligible candidates — the preview pane then shows an empty-state
 * placeholder and no "To:" line.
 *
 * Exported so the page can construct the bundles map and pass it
 * through. The shape lives here (next to the form that consumes it)
 * rather than next to the data-loading code; the page treats this
 * module as the contract.
 */
export interface PreviewBundle {
  participantName: string | null;
  standingsSummary: string;
  missingGroupPicks: string;
  missingKnockoutPicks: string;
}

const initial: AdminActionResult = { success: false };

const DEFAULT_SUBJECT = "Pool update";
const DEFAULT_BODY = `Hi,

Here's where things stand:

{{standings-summary}}

Good luck the rest of the way.
`;

// Catalog of insertable widgets. Each entry surfaces an "Insert" pill on
// the form; the server action and the preview substitution map need a
// matching entry (token name must match exactly).
const WIDGETS: { token: string; label: string; description: string }[] = [
  {
    token: "{{standings-summary}}",
    label: "Standings summary",
    description:
      "Per-recipient block: each of their pick sets with current rank and points.",
  },
  {
    token: "{{missing-group-picks}}",
    label: "Missing group picks",
    description:
      "Per-recipient block: each pick set's unpicked Group Phase matches.",
  },
  {
    token: "{{missing-knockout-picks}}",
    label: "Missing knockout picks",
    description:
      "Per-recipient block: each pick set's unpicked Knockout Phase matches with determinable teams.",
  },
];

export function EmailForm({
  pool,
  recipientCounts,
  previewBundles,
}: EmailFormProps) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [recipientList, setRecipientList] = useState<RecipientListValue>("all");
  const [confirming, setConfirming] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // The action receives subject + body + recipientList via FormData. State
  // mirrors them so the preview can update live as the admin types.
  const [state, action, pending] = useActionState(
    sendBroadcastEmailAction,
    initial
  );

  // After a send completes (success OR error), reset the two-step confirm
  // gate so the next action starts fresh. Without this, a successful send
  // would leave the "Send to N" strip visible next to the green banner.
  useEffect(() => {
    if (state.success || state.error) {
      setConfirming(false);
    }
  }, [state]);

  const currentRecipientCount = recipientCounts[recipientList];

  // The bundle that drives the preview pane — re-selected whenever the
  // dropdown changes so the preview always reflects "what a recipient
  // in THIS list would actually see." Falls back to an empty bundle for
  // type-safety; the type signature guarantees the key exists, but the
  // fallback removes any chance of a runtime undefined under future
  // refactors.
  const activeBundle =
    previewBundles[recipientList] ?? {
      participantName: null,
      standingsSummary: "",
      missingGroupPicks: "",
      missingKnockoutPicks: "",
    };

  // Live preview. Per-recipient expansion is the server's job at send
  // time; here we substitute the active bundle's server-rendered widget
  // strings so the admin sees exactly what one representative recipient
  // from the chosen list would receive.
  const previewBody = useMemo(
    () =>
      applyBodyTokens(body, {
        "standings-summary": activeBundle.standingsSummary,
        "missing-group-picks": activeBundle.missingGroupPicks,
        "missing-knockout-picks": activeBundle.missingKnockoutPicks,
      }),
    [body, activeBundle]
  );

  function insertToken(token: string) {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => `${b}${b.endsWith("\n") || b.length === 0 ? "" : "\n"}${token}\n`);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;
    setBody(next);
    // Restore cursor to just after the inserted token after React applies state.
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        const caret = start + token.length;
        bodyRef.current.focus();
        bodyRef.current.setSelectionRange(caret, caret);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* ---- Recipients banner ------------------------------------- */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 text-xs text-[var(--color-text-secondary)]">
        This message will be sent to{" "}
        <strong className="text-[var(--color-text)]">
          {currentRecipientCount}{" "}
          {currentRecipientCount === 1 ? "player" : "players"}
        </strong>{" "}
        in <strong className="text-[var(--color-text)]">{pool.name}</strong>.
        Inactive members are skipped.
      </div>

      {/* ---- Form -------------------------------------------------- */}
      <form
        action={action}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4"
        onSubmit={(e) => {
          // Two-step confirm: first submit shows confirmation strip,
          // second submit (after the strip's "Send" button is pressed)
          // actually fires the action. Block on the first submit so the
          // admin can't accidentally trigger a real send.
          if (!confirming) {
            e.preventDefault();
            setConfirming(true);
            return;
          }
          // Falls through to the action handler.
        }}
      >
        <input type="hidden" name="poolId" value={pool.id} />
        <input type="hidden" name="poolSlug" value={pool.slug} />

        {/* Send To dropdown */}
        <div>
          <label
            htmlFor="email-recipient-list"
            className="block text-sm font-medium mb-1.5"
          >
            Send to
          </label>
          <select
            id="email-recipient-list"
            name="recipientList"
            value={recipientList}
            onChange={(e) => {
              setRecipientList(e.target.value as RecipientListValue);
              setConfirming(false);
            }}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          >
            {RECIPIENT_LIST_VALUES.map((value) => {
              const count = recipientCounts[value];
              return (
                <option key={value} value={value}>
                  {RECIPIENT_LIST_SHORT_LABELS[value]} — {count}
                </option>
              );
            })}
          </select>
        </div>

        {/* Subject */}
        <div>
          <label
            htmlFor="email-subject"
            className="block text-sm font-medium mb-1.5"
          >
            Subject
          </label>
          <input
            id="email-subject"
            name="subject"
            type="text"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setConfirming(false);
            }}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          />
        </div>

        {/* Insert-widget buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Insert:
          </span>
          {WIDGETS.map((w) => (
            <button
              key={w.token}
              type="button"
              onClick={() => {
                insertToken(w.token);
                setConfirming(false);
              }}
              title={`${w.description}\n\nToken: ${w.token}`}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-2xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] transition-colors"
            >
              + {w.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div>
          <label
            htmlFor="email-body"
            className="block text-sm font-medium mb-1.5"
          >
            Body
          </label>
          <textarea
            id="email-body"
            name="body"
            ref={bodyRef}
            required
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setConfirming(false);
            }}
            rows={14}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none resize-y"
          />
          <p className="text-2xs text-[var(--color-text-muted)] mt-1">
            Plain text. Single newlines become line breaks; blank lines
            become paragraph breaks.
          </p>
        </div>

        {/* Status messages */}
        {state.error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {state.error}
          </div>
        )}
        {state.success && state.message && (
          <div className="rounded-md bg-pitch-50 border border-pitch-200 px-3 py-2 text-sm text-pitch-700">
            {state.message}
          </div>
        )}

        {/* Send / Confirm strip */}
        <div className="flex items-center justify-end gap-2 pt-1">
          {confirming ? (
            <>
              <span className="text-xs text-[var(--color-text-secondary)] mr-auto">
                Send this message to{" "}
                <strong className="text-[var(--color-text)]">
                  {currentRecipientCount}
                </strong>{" "}
                player{currentRecipientCount === 1 ? "" : "s"}?
              </span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || currentRecipientCount === 0}
                className="rounded-md bg-pitch-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {pending
                  ? `Sending to ${currentRecipientCount}...`
                  : `Send to ${currentRecipientCount}`}
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={currentRecipientCount === 0}
              className="rounded-md bg-pitch-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Review &amp; Send…
            </button>
          )}
        </div>
      </form>

      {/* ---- Preview ---------------------------------------------- */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className="text-2xs text-[var(--color-text-muted)]">
            {activeBundle.participantName
              ? "Rendered with one player's real data. Each recipient sees their own."
              : "No matching players for this list — widgets render empty."}
          </p>
        </div>

        <div className="p-4 space-y-3">
          {/* Faux email "envelope" — subject + from line. When we have a
              preview participant, surface them as the "To:" so the admin
              can verify whose data is being rendered. */}
          <div className="text-xs text-[var(--color-text-muted)] space-y-0.5">
            <p>
              <span className="font-medium text-[var(--color-text-secondary)]">
                From:{" "}
              </span>
              World Cup Pick&apos;em &lt;noreply@…&gt;
            </p>
            {activeBundle.participantName && (
              <p>
                <span className="font-medium text-[var(--color-text-secondary)]">
                  To:{" "}
                </span>
                <span className="text-[var(--color-text)]">
                  {activeBundle.participantName}
                </span>
                <span className="text-[var(--color-text-muted)] ml-1">
                  (sample recipient from this list)
                </span>
              </p>
            )}
            <p>
              <span className="font-medium text-[var(--color-text-secondary)]">
                Subject:{" "}
              </span>
              <span className="text-[var(--color-text)] font-medium">
                {subject || (
                  <em className="text-[var(--color-text-muted)]">
                    (no subject)
                  </em>
                )}
              </span>
            </p>
          </div>

          {/* Body preview — preserves whitespace and newlines so widget
              blocks render the way recipients will see them. Mono font
              matches the textarea for a "what you typed is what they get"
              feel. */}
          <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-[var(--color-surface-raised)] rounded-md p-3 leading-relaxed">
            {previewBody}
          </pre>
        </div>
      </div>
    </div>
  );
}
