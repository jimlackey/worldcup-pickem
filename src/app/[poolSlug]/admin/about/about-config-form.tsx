"use client";

import { useActionState, useState } from "react";
import { updatePoolAboutConfigAction } from "../actions-about";
import type { AdminActionResult } from "../actions";
import type { Pool } from "@/types/database";

const initial: AdminActionResult = { success: false };

/**
 * Pool-admin form for editing the per-pool /{slug}/about page.
 *
 * The form is broken into four blocks that mirror the rendered About
 * page top-to-bottom: Header, Stages (intro + four stage descriptions),
 * Scoring, Payout, Footer. Each optional section (Stages, Scoring,
 * Payout) gets a checkbox at the top that controls whether the whole
 * section renders on the public About page; when the checkbox is off
 * the input fields stay editable but the section disappears for
 * players. This is intentional: an admin draft-editing a section
 * they've temporarily hidden shouldn't lose their work.
 *
 * Section toggles are tracked in local state so the form provides
 * immediate visual feedback (faded section when off) without waiting
 * for a server round-trip. The actual persistence happens on Save —
 * the hidden inputs at the bottom of each section serialise the
 * current toggle states alongside the textareas.
 *
 * The form posts every field at once via a single server action; there
 * is no per-field auto-save. That keeps the audit log clean (one row
 * per save instead of one per keystroke) and matches the form pattern
 * used elsewhere in the admin surface (dates-form, scoring-form).
 */
export function AboutConfigForm({ pool }: { pool: Pool }) {
  const [state, action, pending] = useActionState(
    updatePoolAboutConfigAction,
    initial
  );

  // Section toggles in local state so the disabled visual updates
  // immediately. Defaults read straight from the current pool row so
  // the form mounts in the correct state.
  const [showStages, setShowStages] = useState(pool.about_show_stages);
  const [showScoring, setShowScoring] = useState(pool.about_show_scoring);
  const [showPayout, setShowPayout] = useState(pool.about_show_payout);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="poolId" value={pool.id} />
      <input type="hidden" name="poolSlug" value={pool.slug} />

      {/* HTML-support hint. Every text field below renders on the public
          About page with HTML allowed: inline tags (<strong>, <em>,
          <a href="…">) work inside a paragraph, and a block that is
          wholly an HTML element on its own line (e.g. a <ul>…</ul> or
          <table>…</table>) renders as that block. Plain text still works
          unchanged — blank lines become separate paragraphs. */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2">
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          <span className="font-medium text-[var(--color-text)]">
            HTML is supported
          </span>{" "}
          in every field below. Use inline tags like{" "}
          <code className="font-mono text-[var(--color-text)]">
            &lt;strong&gt;
          </code>
          ,{" "}
          <code className="font-mono text-[var(--color-text)]">
            &lt;em&gt;
          </code>
          , or{" "}
          <code className="font-mono text-[var(--color-text)]">
            &lt;a href=&quot;…&quot;&gt;
          </code>{" "}
          within a paragraph, or put a block element such as{" "}
          <code className="font-mono text-[var(--color-text)]">
            &lt;ul&gt;…&lt;/ul&gt;
          </code>{" "}
          on its own line. Plain text still works as before — leave a
          blank line between paragraphs.
        </p>
      </div>

      {/* Header text — always rendered on the About page, no toggle. */}
      <FieldGroup
        title="Header"
        description="Opening paragraph shown at the top of the About page."
      >
        <TextArea
          name="about_header_text"
          rows={5}
          defaultValue={pool.about_header_text}
        />
      </FieldGroup>

      {/* Stages section. The "intro" text and four per-stage
          descriptions all live together because they all disappear
          together when the section toggle is off. */}
      <SectionGroup
        title="The Four Stages"
        description="Intro paragraph plus the description shown inside each of the four numbered stage tiles. The stage titles, deadline badges, and match-window dates are managed by the app and aren't editable here."
        toggleName="about_show_stages"
        toggleChecked={showStages}
        onToggleChange={setShowStages}
      >
        <FieldGroup
          title="Intro paragraph"
          description='Shown above the four stage tiles (currently "The pool runs in four stages…").'
        >
          <TextArea
            name="about_stages_intro_text"
            rows={3}
            defaultValue={pool.about_stages_intro_text}
            disabled={!showStages}
          />
        </FieldGroup>

        <FieldGroup title="Stage 1 — Group Phase picking">
          <TextArea
            name="about_stage1_text"
            rows={5}
            defaultValue={pool.about_stage1_text}
            disabled={!showStages}
          />
        </FieldGroup>

        <FieldGroup title="Stage 2 — Group Phase matches">
          <TextArea
            name="about_stage2_text"
            rows={5}
            defaultValue={pool.about_stage2_text}
            disabled={!showStages}
          />
        </FieldGroup>

        <FieldGroup title="Stage 3 — Knockout Bracket picking">
          <TextArea
            name="about_stage3_text"
            rows={5}
            defaultValue={pool.about_stage3_text}
            disabled={!showStages}
          />
        </FieldGroup>

        <FieldGroup title="Stage 4 — Knockout Round matches">
          <TextArea
            name="about_stage4_text"
            rows={5}
            defaultValue={pool.about_stage4_text}
            disabled={!showStages}
          />
        </FieldGroup>
      </SectionGroup>

      {/* Scoring section. The points-per-stage grid below the prose
          is generated from scoring_config and isn't part of this form
          — only the prose above it is editable. */}
      <SectionGroup
        title="Scoring"
        description="Prose shown above the points-per-stage grid. The grid itself is generated from your scoring config and isn't edited here."
        toggleName="about_show_scoring"
        toggleChecked={showScoring}
        onToggleChange={setShowScoring}
      >
        <FieldGroup title="Scoring explanation">
          <TextArea
            name="about_scoring_text"
            rows={6}
            defaultValue={pool.about_scoring_text}
            disabled={!showScoring}
          />
        </FieldGroup>
      </SectionGroup>

      {/* Payout section. Off by default for fresh pools because the
          copy is empty — turning it on with no text would render a
          blank section header. */}
      <SectionGroup
        title="Payout"
        description="Optional section describing how the pool's pot is split. Off by default; turn on once you've filled in the text below."
        toggleName="about_show_payout"
        toggleChecked={showPayout}
        onToggleChange={setShowPayout}
      >
        <FieldGroup title="Payout details">
          <TextArea
            name="about_payout_text"
            rows={6}
            defaultValue={pool.about_payout_text}
            disabled={!showPayout}
          />
        </FieldGroup>
      </SectionGroup>

      {/* Footer text — always rendered when non-empty. No toggle
          because leaving the field blank already hides it on the
          rendered page. */}
      <FieldGroup
        title="Footer"
        description="Closing paragraph at the bottom of the About page. Leave blank to hide."
      >
        <TextArea
          name="about_footer_text"
          rows={3}
          defaultValue={pool.about_footer_text}
        />
      </FieldGroup>

      {/* Save row. State badges sit beside the button so the admin
          sees the success/error message inline rather than at the
          page top. */}
      <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-border)]">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.error && (
          <p className="text-xs text-red-600">{state.error}</p>
        )}
        {state.success && (
          <p className="text-xs text-pitch-600">{state.message}</p>
        )}
      </div>
    </form>
  );
}

// ----------------------------------------------------------------------------
// Internal building blocks
// ----------------------------------------------------------------------------

/**
 * One labelled field cluster. Used both standalone (Header, Footer)
 * and as a child of SectionGroup (intro text, each stage description).
 */
function FieldGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-display font-semibold">{title}</h3>
        {description && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Wrapper for a toggleable section on the public About page. Renders
 * the section title with an inline "show on About page" checkbox plus
 * a description, and dims its children when the toggle is off so the
 * admin gets visual feedback. The hidden input mirrors the checkbox
 * value as a "true"/"false" string for the server action.
 */
function SectionGroup({
  title,
  description,
  toggleName,
  toggleChecked,
  onToggleChange,
  children,
}: {
  title: string;
  description: string;
  toggleName: string;
  toggleChecked: boolean;
  onToggleChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-display font-bold">{title}</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {description}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium shrink-0 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={toggleChecked}
            onChange={(e) => onToggleChange(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border)] text-pitch-600 focus:ring-pitch-500"
          />
          <span>Show on About page</span>
          {/* Mirror the checkbox to a string-valued hidden input so the
              server action receives "true" / "false" the same way the
              other toggle actions do. */}
          <input
            type="hidden"
            name={toggleName}
            value={toggleChecked ? "true" : "false"}
          />
        </label>
      </div>
      {/* Dim the fields when the section is hidden, but keep them
          editable — an admin polishing copy for a temporarily-hidden
          section shouldn't be blocked from typing. */}
      <div
        className={
          toggleChecked ? "space-y-5" : "space-y-5 opacity-60"
        }
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Plain textarea styled to match the rest of the admin forms in this
 * codebase. defaultValue is fine here because the inputs are
 * uncontrolled — the form is submitted whole via the action.
 */
function TextArea({
  name,
  rows,
  defaultValue,
  disabled,
}: {
  name: string;
  rows: number;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <textarea
      name={name}
      rows={rows}
      defaultValue={defaultValue}
      disabled={disabled}
      className="block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 disabled:bg-[var(--color-surface-raised)] disabled:cursor-not-allowed"
    />
  );
}
