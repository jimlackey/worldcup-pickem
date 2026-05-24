// ---------------------------------------------------------------------------
// Custom widget rendering — pure functions, safe for client AND server.
//
// This module exists separately from custom-widgets.ts because the
// rendering helpers need to be importable from client components (the
// Send Email form's live preview, the Manage Widgets editor's preview)
// while custom-widgets.ts pulls in supabaseAdmin for the query path.
// Importing custom-widgets.ts from a client component would drag
// supabaseAdmin into the browser bundle, which throws at evaluation
// time because the service-role env var doesn't exist in the browser.
//
// The split is along server-only vs. universal lines:
//
//   custom-widgets.ts       — queries (needs supabaseAdmin). Server only.
//   widget-rendering.ts     — template rendering. Universal.
//
// Anything new that touches Supabase belongs in custom-widgets.ts.
// Anything that's a pure function over (widget HTML, data) → string
// belongs here.
// ---------------------------------------------------------------------------

import {
  parse as parseTemplate,
  renderTemplate,
} from "./template-engine";
import type { CustomEmailWidget } from "@/types/database";

/**
 * Render every custom widget against the given per-recipient data and
 * return a slug → rendered HTML map suitable for splicing into the
 * email body via render-email-body.ts.
 *
 * Custom widget HTML is treated as a template — see template-engine.ts
 * for the syntax. Templates with no tags render to themselves
 * (backwards-compatible with the pre-template-engine behaviour).
 *
 * Per-widget error containment:
 *   A widget whose template fails to parse OR fails to render at send
 *   time produces a visible inline placeholder rather than throwing.
 *   The rationale: one bad widget should not block the entire email,
 *   AND the placeholder lets the admin discover the failure when a
 *   recipient forwards them the broken email. Parse errors are also
 *   caught at save time by the create/update actions, so a saved
 *   widget should rarely fail to parse at render time — this catch is
 *   a defense-in-depth.
 */
export function renderCustomWidgetsToTokenMap(
  widgets: CustomEmailWidget[],
  data: unknown
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const w of widgets) {
    map[w.slug] = renderCustomWidget(w, data);
  }
  return map;
}

/**
 * Render a single custom widget's template against per-recipient data.
 * Returns the rendered HTML, or a visible placeholder on parse / render
 * error. Never throws.
 */
export function renderCustomWidget(
  widget: { slug: string; label: string; html_body: string },
  data: unknown
): string {
  try {
    return renderTemplate(widget.html_body, data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Visible placeholder — red text so an admin previewing or a
    // recipient receiving the email can see something went wrong with
    // this widget. The slug is included so the admin can find and fix
    // the offending row. Escape the message because it can contain the
    // widget's contents.
    return `<span style="color:#b91c1c;font-family:monospace;font-size:13px">[widget &quot;${escapeForAttr(
      widget.slug
    )}&quot; failed: ${escapeForAttr(message)}]</span>`;
  }
}

/** Minimal HTML-attr escape for the error placeholder. */
function escapeForAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pre-validate a template by attempting to parse it. Returns null when
 * valid; returns the error message when invalid. Used by the create
 * and update actions so an admin can't save a syntactically-broken
 * template.
 *
 * This is parse-only — render-time errors (missing fields, type
 * mismatches) only surface when actual data is supplied, so they
 * naturally don't block saving. The preview pane uses the same engine
 * and will reveal those issues to the admin before they send.
 */
export function validateWidgetTemplate(source: string): string | null {
  try {
    parseTemplate(source);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
