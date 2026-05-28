"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  sendBroadcastEmailAction,
  previewRecipientAction,
} from "./actions";
import { renderEmailBodyHtml } from "@/lib/email/render-email-body";
import { renderCustomWidget } from "@/lib/email/widget-rendering";
import type { RecipientTemplateData } from "@/lib/email/recipient-data";
import {
  RECIPIENT_LIST_VALUES,
  RECIPIENT_LIST_SHORT_LABELS,
  type RecipientListValue,
} from "./recipient-lists";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

// ---------------------------------------------------------------------------
// Shared shapes (also imported by page.tsx so the server prop type stays
// the form's contract)
// ---------------------------------------------------------------------------

/**
 * One rendering of the per-recipient template data for a single
 * participant. participantName is null when no eligible candidate
 * exists — the preview pane shows an empty-state placeholder in that
 * case.
 *
 * All widget rendering now flows through the template engine against
 * `templateData`. The five seeded default widgets and any
 * admin-authored widgets are rendered client-side from the same data
 * shape; nothing pre-rendered HTML lives on this bundle anymore.
 */
export interface PreviewBundle {
  participantName: string | null;
  /**
   * Per-recipient data for rendering widget templates. Null for the
   * empty-state bundle (no participant picked). See recipient-data.ts
   * for the documented shape.
   */
  templateData: RecipientTemplateData | null;
}

/**
 * One entry in the in-preview recipient dropdown. We carry both email
 * (for sort + label) and displayName so the dropdown can show e.g.
 * "Jim Smith — jim@example.com" while still allowing alphabetical-by-
 * email ordering.
 */
export interface RecipientOption {
  participantId: string;
  email: string;
  displayName: string | null;
}

/**
 * Everything the form needs for one recipient list:
 *   - the dropdown's option list
 *   - which option to auto-select on entry (matches the system-picked
 *     sample so the preview lands on someone immediately)
 *   - the pre-rendered bundle for that seed participant (so the
 *     initial preview render doesn't need a server fetch)
 */
export interface PerListData {
  recipientOptions: RecipientOption[];
  seedParticipantId: string | null;
  seedBundle: PreviewBundle;
}

/**
 * One admin-defined custom widget — surfaced in the Insert pills row
 * and spliced into the live preview's token map. Custom widgets don't
 * vary per recipient (unlike the built-ins), so the HTML is loaded
 * once on the server and shipped down with the form props.
 */
export interface CustomWidgetOption {
  /** The literal token the admin will write in the body: {{slug}}. */
  slug: string;
  /** Display label for the picker / insert pill. */
  label: string;
  /** Raw HTML the admin authored. Spliced unescaped at render time. */
  html: string;
}

// ---------------------------------------------------------------------------
// Form props
// ---------------------------------------------------------------------------

interface EmailFormProps {
  pool: Pool;
  /**
   * Pre-computed recipient counts for each list option, computed by the
   * server component. The form uses these to label the dropdown entries
   * inline ("All active users — 57") and to drive the dynamic Send
   * button count + disabled state.
   */
  recipientCounts: Record<RecipientListValue, number>;
  /** Per-list dropdown options, seed participant, and seed bundle. */
  perListData: Record<RecipientListValue, PerListData>;
  /**
   * Admin-defined HTML widgets for THIS pool. Empty array when the
   * pool has no custom widgets yet — the form still works, the Insert
   * row just shows built-ins only.
   */
  customWidgets: CustomWidgetOption[];
}

const initial: AdminActionResult = { success: false };

const DEFAULT_SUBJECT = "Pool update";
const DEFAULT_BODY = `Hi,

Here's where things stand:

{{standings-summary}}

Good luck the rest of the way.
`;

const EMPTY_BUNDLE: PreviewBundle = {
  participantName: null,
  templateData: null,
};

export function EmailForm({
  pool,
  recipientCounts,
  perListData,
  customWidgets,
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
  const currentListData = perListData[recipientList];

  // ---- In-preview recipient selection ------------------------------------

  /**
   * The participant the preview pane is currently rendering. Lives at
   * the form level (vs. inside the preview block) because changing it
   * from outside — e.g. switching the "Send to" list — needs to reset
   * back to the new list's seed participant.
   */
  const [selectedParticipantId, setSelectedParticipantId] = useState<
    string | null
  >(perListData[recipientList].seedParticipantId);

  /**
   * Client-side cache of preview bundles keyed by participant_id. Seeded
   * with the per-list seed bundles on first render so re-selecting a
   * seed participant after switching lists is instant. Using useRef
   * (not state) because cache mutation shouldn't trigger a re-render
   * — the bundle whose contents matter lives in `currentBundle` below.
   */
  const bundleCacheRef = useRef<Map<string, PreviewBundle>>(
    new Map(
      Object.values(perListData)
        .filter(
          (d): d is PerListData & { seedParticipantId: string } =>
            d.seedParticipantId !== null
        )
        .map((d) => [d.seedParticipantId, d.seedBundle])
    )
  );

  /**
   * The currently-rendered bundle. Distinct from the cache because we
   * want React to re-render the preview pane when this changes, which
   * means it has to be state, not a ref. Default to the seed bundle for
   * the initial list.
   */
  const [currentBundle, setCurrentBundle] = useState<PreviewBundle>(
    perListData[recipientList].seedBundle
  );

  /**
   * Tracks an inline fetch error for the preview action — separate from
   * the broadcast action's `state.error` so a failed preview fetch
   * doesn't visually clobber a Send-status banner.
   */
  const [previewError, setPreviewError] = useState<string | null>(null);

  /**
   * useTransition gives us a pending flag without blocking the UI on a
   * server-action round-trip. While the bundle is fetching, the
   * preview pane shows the previous bundle dimmed with a small "Loading
   * …" badge — better UX than blanking the pane out.
   */
  const [previewFetching, startPreviewTransition] = useTransition();

  /**
   * Monotonically-increasing token that lets us discard stale fetches.
   * Scenario: admin selects participant A on list 1, that fetch starts
   * (slow), admin switches to list 2 before it resolves. Without this
   * guard, A's bundle would land in currentBundle and clobber list 2's
   * seed bundle. The token bumps on every list change and on every
   * new fetch; the fetch-handler ignores its result if the token has
   * moved on.
   */
  const previewFetchTokenRef = useRef(0);

  // Fetch a participant's bundle, populating the cache and the current
  // bundle. Skips the fetch entirely on a cache hit.
  const loadParticipantBundle = useCallback(
    (participantId: string) => {
      const cached = bundleCacheRef.current.get(participantId);
      if (cached) {
        setCurrentBundle(cached);
        setPreviewError(null);
        return;
      }
      const token = ++previewFetchTokenRef.current;
      startPreviewTransition(async () => {
        const result = await previewRecipientAction({
          poolSlug: pool.slug,
          poolId: pool.id,
          participantId,
        });
        // Drop the result if a newer fetch (or a list change) has
        // happened since we started — see token comment above.
        if (token !== previewFetchTokenRef.current) return;
        if (!result.success) {
          setPreviewError(
            result.error ?? "Could not load this player's preview."
          );
          return;
        }
        const bundle: PreviewBundle = {
          participantName: result.participantName,
          templateData: result.templateData,
        };
        bundleCacheRef.current.set(participantId, bundle);
        setCurrentBundle(bundle);
        setPreviewError(null);
      });
    },
    [pool.id, pool.slug]
  );

  // When the admin switches the "Send to" list, reset the in-preview
  // recipient to that list's seed participant and use its pre-rendered
  // bundle directly. This is the only place we read `currentListData`'s
  // seed values; later changes route through loadParticipantBundle.
  useEffect(() => {
    // Invalidate any in-flight fetch — see previewFetchTokenRef comment.
    previewFetchTokenRef.current += 1;

    const newSeed = currentListData.seedParticipantId;
    setSelectedParticipantId(newSeed);
    setPreviewError(null);
    if (newSeed) {
      // Make sure the cache holds the seed bundle (it does after first
      // mount via the ref initialiser; this is defensive).
      bundleCacheRef.current.set(newSeed, currentListData.seedBundle);
      setCurrentBundle(currentListData.seedBundle);
    } else {
      setCurrentBundle(EMPTY_BUNDLE);
    }
    // currentListData is a stable per-render object — depending on
    // recipientList alone would miss the (very unlikely) case of the
    // server re-rendering with different seed data without changing
    // the list value.
  }, [recipientList, currentListData]);

  // The bundle that's actually visible. While a fetch is in flight,
  // `currentBundle` still points to the previously-displayed bundle, so
  // the pane stays populated and just dims; once the fetch resolves the
  // new bundle replaces it.
  const activeBundle = currentBundle;

  // Live preview body — HTML output, computed the same way the email
  // sender does it. Plain-text tokens are inlined and escaped along
  // with the admin's text; HTML tokens splice in raw markup. The
  // paragraph style here is deliberately a touch smaller than the
  // email's so the preview reads as a compact "what they'll see"
  // rather than a full-size mock.
  const PREVIEW_PARAGRAPH_STYLE =
    "margin:0 0 12px;white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5";
  const previewBodyHtml = useMemo(
    () =>
      renderEmailBodyHtml(
        body,
        {
          // Every widget — including the five seeded defaults — is
          // now a template rendered against the active recipient's
          // data. The empty plain bucket stays for shape compatibility
          // with RenderTokens. Template parse/render errors are caught
          // per-widget and emit a visible placeholder rather than
          // throwing — matches the send-side error containment in
          // renderCustomWidget.
          //
          // activeBundle.templateData is null on the empty-state
          // branch (no recipient selected). We still render in that
          // case so a template author sees something — pass an empty
          // object and let the engine's "field not found" placeholder
          // signal that real data is needed.
          plain: {},
          html: Object.fromEntries(
            customWidgets.map((w) => [
              w.slug,
              renderCustomWidget(
                { slug: w.slug, label: w.label, html_body: w.html },
                activeBundle.templateData ?? {}
              ),
            ])
          ),
        },
        PREVIEW_PARAGRAPH_STYLE
      ),
    [body, activeBundle, customWidgets]
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

        {/* Insert-widget buttons. Every widget — including the five
            canonical ones (standings-summary, missing-group-picks,
            missing-knockout-picks, group-phase-picks, knockout-round-
            picks) — is a row in custom_email_widgets (seeded per pool by
            migration 019) and flows through `customWidgets`. We render a
            single cluster from that one source so the palette matches the
            Manage Widgets page exactly. (Previously a hardcoded built-in
            cluster was rendered ALONGSIDE the DB rows, which double-listed
            the seeded five — the duplication this section used to show.) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Insert:
          </span>
          {customWidgets.length === 0 && (
            <span className="text-2xs text-[var(--color-text-muted)]">
              No widgets yet — add some on the Manage Widgets tab.
            </span>
          )}
          {customWidgets.map((w) => {
            const token = `{{${w.slug}}}`;
            return (
              <button
                key={w.slug}
                type="button"
                onClick={() => {
                  insertToken(token);
                  setConfirming(false);
                }}
                title={`${w.label}\n\nToken: ${token}`}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-2xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                + {w.label}
              </button>
            );
          })}
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
            HTML is supported — paste tags like{" "}
            <code className="font-mono text-[var(--color-text-secondary)]">
              &lt;b&gt;
            </code>
            ,{" "}
            <code className="font-mono text-[var(--color-text-secondary)]">
              &lt;a href&gt;
            </code>
            ,{" "}
            <code className="font-mono text-[var(--color-text-secondary)]">
              &lt;ul&gt;
            </code>{" "}
            directly. Widget tokens like{" "}
            <code className="font-mono text-[var(--color-text-secondary)]">
              {"{{slug}}"}
            </code>{" "}
            expand per recipient. For plain text, single newlines become
            line breaks and blank lines become paragraph breaks.
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
            {currentListData.recipientOptions.length > 0
              ? "Pick a recipient to see exactly what they'll receive."
              : "No matching players for this list — widgets render empty."}
          </p>
        </div>

        {/* In-preview recipient selector. Only rendered when this list
            has at least one recipient — for an empty list there's
            nothing to select. */}
        {currentListData.recipientOptions.length > 0 && (
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
            <label
              htmlFor="email-preview-recipient"
              className="text-xs font-medium text-[var(--color-text-secondary)] shrink-0"
            >
              Preview as:
            </label>
            <select
              id="email-preview-recipient"
              value={selectedParticipantId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setSelectedParticipantId(id);
                loadParticipantBundle(id);
              }}
              disabled={previewFetching}
              className="flex-1 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none disabled:opacity-60"
            >
              {currentListData.recipientOptions.map((opt) => {
                // Label format: "Display Name — email@host" when both
                // exist, "email@host" otherwise. Email alone is enough
                // because addresses are unique within a pool.
                const label = opt.displayName
                  ? `${opt.displayName} — ${opt.email}`
                  : opt.email;
                // Whitelist-only recipients (no participant) carry a
                // synthetic "whitelist:<email>" id — they have no picks
                // to preview, so the option is listed (so the admin sees
                // who'll be mailed) but disabled to avoid a failing
                // preview fetch.
                const notPreviewable = opt.participantId.startsWith("whitelist:");
                return (
                  <option
                    key={opt.participantId}
                    value={opt.participantId}
                    disabled={notPreviewable}
                  >
                    {label}
                    {notPreviewable ? " (no picks)" : ""}
                    {opt.participantId === currentListData.seedParticipantId
                      ? " (auto-pick)"
                      : ""}
                  </option>
                );
              })}
            </select>
            {previewFetching && (
              <span className="text-2xs text-[var(--color-text-muted)] shrink-0">
                Loading…
              </span>
            )}
          </div>
        )}

        {previewError && (
          <div className="mx-4 mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {previewError}
          </div>
        )}

        <div
          className={`p-4 space-y-3 transition-opacity ${previewFetching ? "opacity-60" : ""}`}
        >
          {/* Faux email "envelope" — From / To / Subject. */}
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

          {/* Body preview — rendered as HTML using the same renderer
              the email sender uses. Admin body text is rendered as raw
              HTML (this page is admin-only — see render-email-body.ts);
              HTML widgets like the pick-summary tables splice in raw.
              The mirror means the preview accurately reflects what the
              recipient will see, including any HTML tags the admin
              types into the body. */}
          <div
            className="text-sm break-words bg-[var(--color-surface-raised)] rounded-md p-3 leading-relaxed text-[var(--color-text)]"
            dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
          />
        </div>
      </div>
    </div>
  );
}
