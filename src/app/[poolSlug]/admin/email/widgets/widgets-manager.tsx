"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  createCustomWidgetAction,
  updateCustomWidgetAction,
  deleteCustomWidgetAction,
} from "./actions";
import { previewRecipientAction } from "../actions";
import { renderEmailBodyHtml } from "@/lib/email/render-email-body";
import { renderCustomWidget } from "@/lib/email/widget-rendering";
import {
  RECIPIENT_LIST_VALUES,
  RECIPIENT_LIST_SHORT_LABELS,
  type RecipientListValue,
} from "../recipient-lists";
import type { PreviewBundle, PerListData } from "../email-form";
import type { AdminActionResult } from "../../actions";
import type { CustomEmailWidget, Pool } from "@/types/database";

// ---------------------------------------------------------------------------
// Manage Widgets — client component.
//
// Layout follows the Send Email page's form / preview split:
//
//   ┌──────────────────────────────────────────┐
//   │  Editor form                              │
//   │  - widget picker (existing + "+ New")     │
//   │  - slug + label inputs                    │
//   │  - HTML body textarea                     │
//   │  - Save / Delete / Cancel strip           │
//   ├──────────────────────────────────────────┤
//   │  Preview pane                             │
//   │  - Preview as: <recipient dropdown>       │
//   │  - From / To / Subject envelope            │
//   │  - widget HTML expanded against recipient │
//   │    (built-in {{tokens}} inside resolve)   │
//   └──────────────────────────────────────────┘
//
// State model:
//
//   selectedWidgetId
//      null  → "create new" mode. Save runs the create action.
//      uuid  → "edit" mode for that widget. Save runs the update action,
//              and a Delete button appears.
//
//   slug, label, htmlBody
//      Controlled inputs that mirror the editor form. When the picker
//      selection changes, these reset to either the picked widget's
//      values or the empty defaults for create mode.
//
//   dirty
//      Cheap heuristic — anything diverging from the snapshot we took
//      when entering this widget. Drives the "Discard changes?" guard
//      on picker changes, and the disabled state of the Save button.
//
// Preview pane state (selectedParticipantId, bundle cache, fetch token)
// is lifted directly from EmailForm so the same "Preview As" UX works
// here. The two could share a hook later, but for now keeping it inline
// matches the level of duplication the rest of the email module
// tolerates (e.g. buildPerListData is duplicated between the two
// pages).
// ---------------------------------------------------------------------------

interface WidgetsManagerProps {
  pool: Pool;
  widgets: CustomEmailWidget[];
  recipientCounts: Record<RecipientListValue, number>;
  perListData: Record<RecipientListValue, PerListData>;
}

const initial: AdminActionResult = { success: false };

const EMPTY_BUNDLE: PreviewBundle = {
  participantName: null,
  templateData: null,
};

const NEW_WIDGET_OPTION = "__new__";

// Inline-style shared with the Send Email preview pane so the two
// previews read at the same visual weight.
const PREVIEW_PARAGRAPH_STYLE =
  "margin:0 0 12px;white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5";

export function WidgetsManager({
  pool,
  widgets,
  recipientCounts,
  perListData,
}: WidgetsManagerProps) {
  // ---- Picker selection + edit-mode state ------------------------------

  /**
   * The widget currently being edited, identified by id. `null` puts
   * the editor in "create new" mode. Picker default: first existing
   * widget if any, otherwise null (start in create mode).
   */
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(
    widgets[0]?.id ?? null
  );

  // Editor inputs — controlled so we can drive them from picker changes.
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [htmlBody, setHtmlBody] = useState("");

  // Snapshot used to detect "dirty" state. Reset whenever the picker
  // moves to a different widget.
  const snapshotRef = useRef<{ slug: string; label: string; htmlBody: string }>(
    { slug: "", label: "", htmlBody: "" }
  );

  // Action state for the three actions. All three share the same
  // AdminActionResult shape, but each gets its own useActionState so
  // their pending flags don't collide.
  const [createState, createAction, createPending] = useActionState(
    createCustomWidgetAction,
    initial
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateCustomWidgetAction,
    initial
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteCustomWidgetAction,
    initial
  );

  // Two-step delete confirmation — first click arms the button, second
  // submits. Avoids accidental destructive clicks. Resets on success or
  // when the user switches widgets.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /**
   * Apply a picker selection: load the widget's values into the editor
   * (or reset to blank for the "new" option), refresh the dirty
   * snapshot, and clear the delete-confirm state.
   *
   * The snapshot has to be set HERE (not via a useEffect on selection)
   * so the snapshot reflects exactly what we put into the inputs at
   * load time, not whatever the inputs ended up holding after React's
   * batched render.
   */
  const applySelection = useCallback(
    (newId: string | null) => {
      const widget = newId ? widgets.find((w) => w.id === newId) ?? null : null;
      const next = widget
        ? {
            slug: widget.slug,
            label: widget.label,
            htmlBody: widget.html_body,
          }
        : { slug: "", label: "", htmlBody: "" };

      setSelectedWidgetId(newId);
      setSlug(next.slug);
      setLabel(next.label);
      setHtmlBody(next.htmlBody);
      snapshotRef.current = next;
      setConfirmingDelete(false);
    },
    [widgets]
  );

  // Seed the editor on first render. We can't just initialise useState
  // with the widget values because we also need to populate the
  // snapshot ref, and that has to happen alongside the state inits.
  // useEffect with empty deps runs after first paint, but the inputs
  // are unset before that, so we run applySelection synchronously on
  // mount via a ref guard.
  const mountedRef = useRef(false);
  if (!mountedRef.current) {
    mountedRef.current = true;
    const initialWidget = widgets[0];
    if (initialWidget) {
      snapshotRef.current = {
        slug: initialWidget.slug,
        label: initialWidget.label,
        htmlBody: initialWidget.html_body,
      };
      // Direct setState in render is generally discouraged, but here
      // we're guarding with a ref to make it strictly one-shot
      // initialisation. React tolerates this pattern; the alternative
      // (re-running applySelection in a useEffect) would briefly paint
      // empty inputs.
      if (slug === "" && label === "" && htmlBody === "") {
        setSlug(initialWidget.slug);
        setLabel(initialWidget.label);
        setHtmlBody(initialWidget.html_body);
      }
    }
  }

  // After a successful create / update / delete, the server has
  // revalidated this page so `widgets` will be the fresh list on the
  // next render. We need to:
  //   - on CREATE success → select the new widget (it'll be in `widgets`
  //     by slug; we can't know the id without re-shape, so re-select
  //     by slug)
  //   - on UPDATE success → keep current selection, refresh snapshot
  //   - on DELETE success → fall back to first widget or null
  //
  // The action result's `message` doesn't carry the id, so we rely on
  // slug uniqueness within the pool to re-resolve. For update, that's
  // the new slug; for create, also the new slug.
  useEffect(() => {
    if (!createState.success) return;
    const justCreated = widgets.find((w) => w.slug === slug);
    if (justCreated && justCreated.id !== selectedWidgetId) {
      applySelection(justCreated.id);
    } else {
      // Same selection but the snapshot is now stale — refresh it.
      snapshotRef.current = { slug, label, htmlBody };
    }
    // We deliberately don't include `slug`/`label`/`htmlBody` in deps —
    // those mirror the controlled inputs and would re-fire this effect
    // every keystroke. The action result is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState]);

  useEffect(() => {
    if (!updateState.success) return;
    snapshotRef.current = { slug, label, htmlBody };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState]);

  useEffect(() => {
    if (!deleteState.success) return;
    applySelection(widgets[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteState]);

  // ---- Dirty / mode helpers --------------------------------------------

  const isNewMode = selectedWidgetId === null;
  const isDirty =
    slug !== snapshotRef.current.slug ||
    label !== snapshotRef.current.label ||
    htmlBody !== snapshotRef.current.htmlBody;

  const savePending = isNewMode ? createPending : updatePending;
  const saveState = isNewMode ? createState : updateState;

  // ---- Recipient list + preview wiring ---------------------------------
  //
  // This block is structurally identical to the EmailForm equivalent —
  // we duplicate it intentionally to keep the two preview surfaces
  // independent. See the WidgetsManager header for the rationale.

  const [recipientList, setRecipientList] =
    useState<RecipientListValue>("all");
  const currentListData = perListData[recipientList];
  const currentRecipientCount = recipientCounts[recipientList];

  const [selectedParticipantId, setSelectedParticipantId] = useState<
    string | null
  >(currentListData.seedParticipantId);

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

  const [currentBundle, setCurrentBundle] = useState<PreviewBundle>(
    currentListData.seedBundle
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFetching, startPreviewTransition] = useTransition();
  const previewFetchTokenRef = useRef(0);

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

  useEffect(() => {
    previewFetchTokenRef.current += 1;
    const newSeed = currentListData.seedParticipantId;
    setSelectedParticipantId(newSeed);
    setPreviewError(null);
    if (newSeed) {
      bundleCacheRef.current.set(newSeed, currentListData.seedBundle);
      setCurrentBundle(currentListData.seedBundle);
    } else {
      setCurrentBundle(EMPTY_BUNDLE);
    }
  }, [recipientList, currentListData]);

  // The preview body for a widget: the widget HTML body itself,
  // expanded with the built-in tokens against the selected recipient.
  // We include the OTHER custom widgets too so a widget that references
  // another `{{custom-slug}}` resolves — but we deliberately leave THIS
  // widget's own slug out of its own token map (no self-reference).
  const previewBodyHtml = useMemo(() => {
    // The widget currently being edited is itself a TEMPLATE — we need
    // to run it through the engine against the recipient data so that
    // tags like {{#each pickSets}} expand. The output of that render
    // becomes the body we hand to renderEmailBodyHtml.
    //
    // Other custom widgets the editor references via {{slug}} also need
    // to be rendered as templates. We exclude the widget under edit
    // from the token map so a self-reference doesn't recursively splice
    // the LAST-SAVED version of the same widget (which would be
    // confusing when the admin is editing it).
    const data = currentBundle.templateData ?? {};

    // Editor content → engine → final HTML for this widget. Renders
    // through the shared renderCustomWidget helper so parse / render
    // errors produce the same visible placeholder the send-side uses.
    const editorRendered = renderCustomWidget(
      // Synthesise a transient widget shape; slug/label only feed the
      // error placeholder so the admin sees which widget failed.
      {
        slug: slug || "(unsaved)",
        label: label || "(unsaved)",
        html_body: htmlBody,
      },
      data
    );

    // Other custom widget templates — pre-rendered too, since they
    // could reference recipient data of their own. After Phase 2, the
    // five seeded default widgets (standings-summary, etc.) are
    // ordinary custom_email_widgets rows, so they're already in
    // `widgets` and get rendered here — no special-case branch.
    const otherCustomTokens: Record<string, string> = {};
    for (const w of widgets) {
      if (w.id === selectedWidgetId) continue;
      otherCustomTokens[w.slug] = renderCustomWidget(w, data);
    }

    return renderEmailBodyHtml(
      editorRendered,
      {
        plain: {},
        html: otherCustomTokens,
      },
      PREVIEW_PARAGRAPH_STYLE
    );
  }, [htmlBody, currentBundle, widgets, selectedWidgetId, slug, label]);

  // ---- Picker change handler with dirty guard --------------------------

  function handlePickerChange(value: string) {
    if (isDirty) {
      const ok = window.confirm(
        "You have unsaved changes. Discard them and switch widgets?"
      );
      if (!ok) return;
    }
    if (value === NEW_WIDGET_OPTION) {
      applySelection(null);
    } else {
      applySelection(value);
    }
  }

  // ---- Pseudo-subject shown in the preview envelope --------------------
  // Real emails have a Subject; widget previews don't, so we synthesise
  // one that names the widget being previewed (or "(new widget)" in
  // create mode). Keeps the envelope visually identical to the Send
  // Email preview.
  const previewSubject = isNewMode
    ? "(new widget)"
    : label || "(unnamed widget)";

  return (
    <div className="space-y-4">
      {/* ---- Widget picker ----------------------------------------- */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label
            htmlFor="widget-picker"
            className="text-sm font-medium shrink-0"
          >
            Widget:
          </label>
          <select
            id="widget-picker"
            value={selectedWidgetId ?? NEW_WIDGET_OPTION}
            onChange={(e) => handlePickerChange(e.target.value)}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          >
            {widgets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label} — {`{{${w.slug}}}`}
              </option>
            ))}
            <option value={NEW_WIDGET_OPTION}>+ New widget…</option>
          </select>
        </div>
      </div>

      {/* ---- Editor form ------------------------------------------- */}
      <form
        // Same action wired to both modes — switched at submit time so
        // useActionState's pending flag flips for the right action.
        action={isNewMode ? createAction : updateAction}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4"
      >
        <input type="hidden" name="poolId" value={pool.id} />
        <input type="hidden" name="poolSlug" value={pool.slug} />
        {!isNewMode && selectedWidgetId && (
          <input type="hidden" name="widgetId" value={selectedWidgetId} />
        )}

        {/* Slug + Label on one row (slug narrower because it's a short token) */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
          <div>
            <label
              htmlFor="widget-slug"
              className="block text-sm font-medium mb-1.5"
            >
              Slug{" "}
              <span className="font-normal text-[var(--color-text-muted)]">
                (token)
              </span>
            </label>
            <input
              id="widget-slug"
              name="slug"
              type="text"
              required
              maxLength={50}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="reminder-footer"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
            />
            <p className="text-2xs text-[var(--color-text-muted)] mt-1">
              Lowercase letters, digits, hyphens, underscores. Insert as{" "}
              <code className="font-mono">
                {`{{${slug || "your-slug"}}}`}
              </code>
              .
            </p>
          </div>
          <div>
            <label
              htmlFor="widget-label"
              className="block text-sm font-medium mb-1.5"
            >
              Label
            </label>
            <input
              id="widget-label"
              name="label"
              type="text"
              required
              maxLength={100}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Reminder footer"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
            />
            <p className="text-2xs text-[var(--color-text-muted)] mt-1">
              How this widget appears in the picker and Insert pills.
            </p>
          </div>
        </div>

        {/* HTML body */}
        <div>
          <label
            htmlFor="widget-html"
            className="block text-sm font-medium mb-1.5"
          >
            HTML
          </label>
          <textarea
            id="widget-html"
            name="htmlBody"
            value={htmlBody}
            onChange={(e) => setHtmlBody(e.target.value)}
            rows={14}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none resize-y"
            placeholder='<p style="margin:16px 0;font-size:14px;color:#57534e">A reminder block — set fonts, colours, and links inline.</p>'
          />
          <p className="text-2xs text-[var(--color-text-muted)] mt-1">
            Raw HTML — use inline styles since most email clients strip{" "}
            <code className="font-mono">&lt;style&gt;</code> blocks. The
            body is a template: use{" "}
            <code className="font-mono">{"{{path}}"}</code> to interpolate
            per-recipient fields,{" "}
            <code className="font-mono">{"{{#each pickSets}}…{{/each}}"}</code>{" "}
            to loop, and{" "}
            <code className="font-mono">{"{{#if missingMatches.length}}…{{else}}…{{/if}}"}</code>{" "}
            for conditionals. Inside an{" "}
            <code className="font-mono">each</code> block, bare field
            names resolve to the current item.
          </p>
          <details className="mt-2 text-2xs text-[var(--color-text-muted)]">
            <summary className="cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors select-none">
              Available data fields
            </summary>
            <pre className="mt-2 p-3 bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-md font-mono text-2xs leading-snug whitespace-pre overflow-x-auto">{`{
  recipient: { name, email }
  pool: { name, knockoutPhaseStarted }
  pickSets: [
    {
      name, rank, totalPoints, groupPoints, knockoutPoints,
      groupCorrect, knockoutCorrect,
      groupCompleteCount, groupPickableCount,
      knockoutCompleteCount, knockoutPickableCount,
      missingGroupMatches: [{ matchNumber, home, away, phase }],
      missingKnockoutMatches: [{ matchNumber, home, away, phase }],
      groupPickRows: [
        { matchNumber, home, away,
          picked, pickedLabel,        // "HOME" | "DRAW" | "AWAY" | "NOT PICKED"
          result, resultLabel,
          status, isCorrect }
      ],
      knockoutRounds: [
        { phase, label,                // e.g. "Round of 32"
          matches: [ {... same shape as groupPickRows ...} ] }
      ]
    }
  ]
}`}</pre>
            <p className="mt-2">
              Helpers inside{" "}
              <code className="font-mono">{"{{#each}}"}</code>:{" "}
              <code className="font-mono">@index</code> (0-based),{" "}
              <code className="font-mono">@first</code>,{" "}
              <code className="font-mono">@last</code>. Use{" "}
              <code className="font-mono">{"{{{ html }}}"}</code> (triple
              braces) for fields you don&apos;t want HTML-escaped.
            </p>
          </details>
        </div>

        {/* Status messages — Save + Delete each have their own banner */}
        {saveState.error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {saveState.error}
          </div>
        )}
        {saveState.success && saveState.message && (
          <div className="rounded-md bg-pitch-50 border border-pitch-200 px-3 py-2 text-sm text-pitch-700">
            {saveState.message}
          </div>
        )}
        {deleteState.error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {deleteState.error}
          </div>
        )}
        {deleteState.success && deleteState.message && (
          <div className="rounded-md bg-pitch-50 border border-pitch-200 px-3 py-2 text-sm text-pitch-700">
            {deleteState.message}
          </div>
        )}

        {/* Action strip */}
        <div className="flex items-center justify-end gap-2 pt-1">
          {/* Delete sits on the left so it doesn't fall under the
              admin's Save flow accidentally. Only in edit mode. */}
          {!isNewMode && (
            <div className="mr-auto">
              {confirmingDelete ? (
                <DeleteConfirmInline
                  pool={pool}
                  widgetId={selectedWidgetId!}
                  pending={deletePending}
                  onCancel={() => setConfirmingDelete(false)}
                  deleteAction={deleteAction}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={deletePending}
                  className="rounded-md border border-red-200 text-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          )}

          {isDirty && !isNewMode && (
            <button
              type="button"
              onClick={() => applySelection(selectedWidgetId)}
              disabled={savePending}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors"
            >
              Discard
            </button>
          )}
          <button
            type="submit"
            disabled={savePending || (!isDirty && !isNewMode) || !slug || !label}
            className="rounded-md bg-pitch-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savePending
              ? isNewMode
                ? "Creating..."
                : "Saving..."
              : isNewMode
              ? "Create widget"
              : "Save changes"}
          </button>
        </div>
      </form>

      {/* ---- Preview pane ----------------------------------------- */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className="text-2xs text-[var(--color-text-muted)]">
            {currentListData.recipientOptions.length > 0
              ? "Pick a recipient to see how built-in tokens inside this widget expand."
              : "No matching players for this list — widgets render empty."}
          </p>
        </div>

        {/* Recipient list dropdown — same set of options as Send Email
            so the admin can verify the widget against the same audience
            slices they'd target there. */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
          <label
            htmlFor="widget-preview-list"
            className="text-xs font-medium text-[var(--color-text-secondary)] shrink-0"
          >
            List:
          </label>
          <select
            id="widget-preview-list"
            value={recipientList}
            onChange={(e) =>
              setRecipientList(e.target.value as RecipientListValue)
            }
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 outline-none"
          >
            {RECIPIENT_LIST_VALUES.map((value) => (
              <option key={value} value={value}>
                {RECIPIENT_LIST_SHORT_LABELS[value]} —{" "}
                {recipientCounts[value]}
              </option>
            ))}
          </select>
        </div>

        {/* Per-recipient picker — identical UX to the Send Email page. */}
        {currentListData.recipientOptions.length > 0 && (
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
            <label
              htmlFor="widget-preview-recipient"
              className="text-xs font-medium text-[var(--color-text-secondary)] shrink-0"
            >
              Preview as:
            </label>
            <select
              id="widget-preview-recipient"
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
                const optLabel = opt.displayName
                  ? `${opt.displayName} — ${opt.email}`
                  : opt.email;
                // Whitelist-only recipients (synthetic "whitelist:<email>"
                // id) have no picks to preview — list but disable them.
                const notPreviewable = opt.participantId.startsWith("whitelist:");
                return (
                  <option
                    key={opt.participantId}
                    value={opt.participantId}
                    disabled={notPreviewable}
                  >
                    {optLabel}
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
          className={`p-4 space-y-3 transition-opacity ${
            previewFetching ? "opacity-60" : ""
          }`}
        >
          {/* Faux envelope — same shape as Send Email's preview. The
              "Subject" line here is synthesised from the widget label,
              since widgets don't have real subjects. */}
          <div className="text-xs text-[var(--color-text-muted)] space-y-0.5">
            <p>
              <span className="font-medium text-[var(--color-text-secondary)]">
                From:{" "}
              </span>
              World Cup Pick&apos;em &lt;noreply@…&gt;
            </p>
            {currentBundle.participantName && (
              <p>
                <span className="font-medium text-[var(--color-text-secondary)]">
                  To:{" "}
                </span>
                <span className="text-[var(--color-text)]">
                  {currentBundle.participantName}
                </span>
              </p>
            )}
            <p>
              <span className="font-medium text-[var(--color-text-secondary)]">
                Subject:{" "}
              </span>
              <span className="text-[var(--color-text)] font-medium">
                Preview: {previewSubject}
              </span>
            </p>
          </div>

          {/* Widget HTML preview — same renderer the email sender uses,
              same admin-trusted treatment of the body. */}
          <div
            className="text-sm break-words bg-[var(--color-surface-raised)] rounded-md p-3 leading-relaxed text-[var(--color-text)]"
            dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
          />

          {/* Empty-state hint when the HTML body is blank */}
          {htmlBody.trim().length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] italic">
              Type some HTML above to see the preview render here.
            </p>
          )}
        </div>
      </div>

      {/* Bottom hint: how to use this widget once saved */}
      {!isNewMode && slug && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 text-xs text-[var(--color-text-secondary)]">
          To use this widget in an email, switch to the{" "}
          <strong className="text-[var(--color-text)]">Send Email</strong>{" "}
          tab and insert{" "}
          <code className="font-mono text-[var(--color-text)]">
            {`{{${slug}}}`}
          </code>{" "}
          into the body. The pool currently has{" "}
          <strong className="text-[var(--color-text)]">
            {currentRecipientCount}
          </strong>{" "}
          player{currentRecipientCount === 1 ? "" : "s"} on the{" "}
          {RECIPIENT_LIST_SHORT_LABELS[recipientList].toLowerCase()} list.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm inline strip
//
// Pulled out so the editor form's action-strip JSX doesn't bloat. Renders
// the "Sure?" copy + Confirm + Cancel buttons, with the Confirm button
// triggering the delete action via a button click.
//
// IMPORTANT: this MUST NOT render a <form>. The whole component is
// rendered inside the editor's outer <form action={createAction|updateAction}>,
// and HTML doesn't permit nested forms — React 19 flags it as a
// hydration error and the dev runtime crashes. Instead the confirm
// button is type="button" (so it doesn't submit the outer form) and
// calls deleteAction programmatically with a built FormData. The
// hidden inputs that the action's Zod schema reads (poolId, poolSlug,
// widgetId) are constructed in JS, not as DOM elements.
//
// The dispatch is wrapped in startTransition because React 19 requires
// useActionState dispatchers to be called inside a transition. When
// you submit a <form action={dispatch}>, React wraps it for you; when
// you call dispatch(fd) from an onClick, you wrap it yourself or the
// runtime warns and the pending flag doesn't flip.
// ---------------------------------------------------------------------------

function DeleteConfirmInline({
  pool,
  widgetId,
  pending,
  onCancel,
  deleteAction,
}: {
  pool: Pool;
  widgetId: string;
  pending: boolean;
  onCancel: () => void;
  // Type matches the action returned by useActionState — a function
  // that takes FormData. Loose typing here is intentional; the
  // useActionState dispatch signature isn't worth re-deriving.
  deleteAction: (formData: FormData) => void;
}) {
  function handleConfirm() {
    // Build the FormData the server action expects (same field names
    // the Zod schema reads). Calling the useActionState dispatcher
    // with a FormData is equivalent to submitting a form whose
    // `action` is the same dispatcher.
    //
    // The dispatch MUST be wrapped in startTransition when called from
    // an onClick (vs. from a form's action prop, where React wraps it
    // automatically). Without the transition the action still runs,
    // but the deletePending flag never flips, which means the button's
    // "Deleting..." state and disabled cycle don't fire.
    const fd = new FormData();
    fd.set("poolId", pool.id);
    fd.set("poolSlug", pool.slug);
    fd.set("widgetId", widgetId);
    startTransition(() => {
      deleteAction(fd);
    });
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--color-text-secondary)]">
        Delete this widget?
      </span>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={pending}
        className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "Deleting..." : "Yes, delete"}
      </button>
    </div>
  );
}
