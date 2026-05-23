// ---------------------------------------------------------------------------
// Shared inline styles for HTML email widgets.
//
// All widgets that emit HTML (the {{standings-summary}}, missing-picks,
// and pick-summaries families) share these constants so the email's
// visual language stays consistent. Centralising them here means a
// future visual tweak — different palette, different typography, tighter
// spacing — lands once and the email body keeps a unified look.
//
// Inline styles are mandatory in email: most clients strip <style>
// blocks and class-based rules never reach the rendered message. Every
// visual rule has to ride on the element it targets. We use the system
// font stack to fall back gracefully across macOS, Windows, iOS and
// Android, and the Stone/Tailwind colour scale because it reads well
// on both light and dark email backgrounds.
//
// Also exported: an escapeHtml helper, since every widget needs it for
// participant-supplied strings (team names, pick set names). Keeping
// one copy here means a future change to the escape policy (e.g.
// adding the back-tick edge-case) is one-file.
// ---------------------------------------------------------------------------

// ---- Typography & layout --------------------------------------------------

/** Pick set name — the strongest section header per pick set. */
export const STYLE_PICK_SET_HEADER =
  "font-weight:700;font-size:15px;color:#1c1917;margin:18px 0 4px";

/** Sub-section header within a pick set, e.g. a knockout round name. */
export const STYLE_SUB_HEADER =
  "font-weight:600;font-size:13px;color:#57534e;margin:14px 0 0";

/**
 * The "no missing picks" / "no data" muted note inside a widget block.
 * Italic so it reads as a status line, not as content.
 */
export const STYLE_MUTED_NOTE =
  "margin:4px 0 14px;color:#a8a29e;font-size:13px;font-style:italic";

/** Greyed-out text style — used for NOT PICKED, no-data labels, etc. */
export const STYLE_MUTED = "color:#a8a29e";

// ---- Tables ---------------------------------------------------------------

export const STYLE_TABLE =
  "border-collapse:collapse;margin:6px 0 14px;width:100%;max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px";

export const STYLE_TH_LEFT =
  "text-align:left;padding:6px 10px;background:#f5f5f4;color:#44403c;font-weight:600;font-size:12px;border-bottom:1px solid #e7e5e4";

export const STYLE_TH_RIGHT =
  "text-align:right;padding:6px 10px;background:#f5f5f4;color:#44403c;font-weight:600;font-size:12px;border-bottom:1px solid #e7e5e4";

export const STYLE_TD_LEFT =
  "padding:5px 10px;border-bottom:1px solid #f5f5f4;color:#1c1917";

/** Right-aligned table data cell with a slight emphasis weight. */
export const STYLE_TD_RIGHT =
  "padding:5px 10px;border-bottom:1px solid #f5f5f4;color:#1c1917;text-align:right;font-weight:500";

/**
 * Compact label-value table used by standings-summary. Narrower than
 * the match-list tables and aligned left/left so labels and values sit
 * close together rather than spanning the full width.
 */
export const STYLE_LABEL_VALUE_TABLE =
  "border-collapse:collapse;margin:4px 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px";

/** Label cell in a label-value table — muted colour, no border. */
export const STYLE_LABEL_CELL =
  "padding:3px 12px 3px 0;color:#57534e;font-size:13px;vertical-align:top;white-space:nowrap";

/** Value cell in a label-value table — primary text colour. */
export const STYLE_VALUE_CELL =
  "padding:3px 0;color:#1c1917;font-size:14px;vertical-align:top";

// ---- Lists ----------------------------------------------------------------

/**
 * Bulleted list block — used by the missing-picks widgets to render
 * the matches without picks. Padding-left is set explicitly because
 * email clients vary on default list indentation.
 */
export const STYLE_LIST =
  "margin:4px 0 14px;padding-left:22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1c1917;line-height:1.5";

/** Each list item — slight vertical separation between bullets. */
export const STYLE_LIST_ITEM = "margin:2px 0";

// ---- Helpers --------------------------------------------------------------

/**
 * HTML-escape a user-supplied string so it's safe to splice into an
 * inline-styled HTML output. Covers the five characters that matter in
 * HTML attribute contexts plus the body. Single quotes are escaped to
 * the numeric entity because `&apos;` isn't universally supported.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
