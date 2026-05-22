"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { sendBroadcastEmailAction } from "./actions";
import { applyBodyTokens } from "@/lib/email/standings-summary";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

interface EmailFormProps {
  pool: Pool;
  activeRecipientCount: number;
  /**
   * Server-rendered standings-summary block built from dummy data,
   * used as the substitution for {{standings-summary}} in the preview
   * pane. The same widget is recomputed PER RECIPIENT on the server at
   * send time; this string is preview-only.
   */
  previewStandingsSummary: string;
}

const initial: AdminActionResult = { success: false };

const DEFAULT_SUBJECT = "Pool update";
const DEFAULT_BODY = `Hi,

Here's where things stand:

{{standings-summary}}

Good luck the rest of the way.
`;

// Catalog of insertable widgets. Adding a new entry here is all that's
// needed to surface a new "Insert" button — the substitution map in the
// server action and the previewTokens object below will need a matching
// entry too.
const WIDGETS: { token: string; label: string; description: string }[] = [
  {
    token: "{{standings-summary}}",
    label: "Standings summary",
    description:
      "Per-recipient block: each of their pick sets with current rank and points.",
  },
];

export function EmailForm({
  pool,
  activeRecipientCount,
  previewStandingsSummary,
}: EmailFormProps) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [confirming, setConfirming] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // The action also receives subject + body via the FormData payload — we
  // keep React state controlled so the preview can render live as the
  // admin types.
  const [state, action, pending] = useActionState(
    sendBroadcastEmailAction,
    initial
  );

  // After a send completes (success OR error), the two-step "confirm" gate
  // should reset so the next action starts fresh. Without this, a successful
  // send would leave the "Send to N" confirmation strip visible alongside
  // the green success banner — confusing UX. Reacting to `state` covers
  // both outcomes; either path means the user has seen the result.
  useEffect(() => {
    if (state.success || state.error) {
      setConfirming(false);
    }
  }, [state]);

  // Live preview. Per-recipient expansion is the server's job at send
  // time; here we show the admin what one representative recipient will
  // receive by substituting our pre-built dummy block.
  const previewBody = useMemo(
    () =>
      applyBodyTokens(body, {
        "standings-summary": previewStandingsSummary,
      }),
    [body, previewStandingsSummary]
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
          {activeRecipientCount} active player
          {activeRecipientCount === 1 ? "" : "s"}
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
          // actually fires the action. We block here unless `confirming`
          // is true so the admin can't accidentally fire a send.
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

        {/* Subject */}
        <div>
          <label htmlFor="email-subject" className="block text-sm font-medium mb-1.5">
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
          <label htmlFor="email-body" className="block text-sm font-medium mb-1.5">
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
            Plain text. Single newlines become line breaks; blank lines become paragraph breaks.
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
                  {activeRecipientCount}
                </strong>{" "}
                player{activeRecipientCount === 1 ? "" : "s"}?
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
                disabled={pending || activeRecipientCount === 0}
                className="rounded-md bg-pitch-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {pending
                  ? `Sending to ${activeRecipientCount}...`
                  : `Send to ${activeRecipientCount}`}
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={activeRecipientCount === 0}
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
            Sample data shown for the standings widget. Real recipients see their own pick sets.
          </p>
        </div>

        <div className="p-4 space-y-3">
          {/* Faux email "envelope" — subject + from line */}
          <div className="text-xs text-[var(--color-text-muted)] space-y-0.5">
            <p>
              <span className="font-medium text-[var(--color-text-secondary)]">From: </span>
              World Cup Pick&apos;em &lt;noreply@…&gt;
            </p>
            <p>
              <span className="font-medium text-[var(--color-text-secondary)]">Subject: </span>
              <span className="text-[var(--color-text)] font-medium">
                {subject || <em className="text-[var(--color-text-muted)]">(no subject)</em>}
              </span>
            </p>
          </div>

          {/* Body preview — preserves whitespace and newlines so the
              standings summary block renders the way recipients will see
              it. Mono font matches the textarea for a "what you typed
              is what they get" feel. */}
          <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-[var(--color-surface-raised)] rounded-md p-3 leading-relaxed">
            {previewBody}
          </pre>
        </div>
      </div>
    </div>
  );
}
