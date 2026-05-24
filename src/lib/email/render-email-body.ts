// ---------------------------------------------------------------------------
// HTML-aware email body renderer.
//
// The email body composer accepts free-form admin text with {{token}}
// placeholders for widgets. The composer page is admin-only — we
// intentionally do NOT HTML-escape the admin's body text, so admins can
// paste raw HTML (links, bold, lists, tables, headings, etc.) directly
// into the body and have it render in the email.
//
// Widget outputs still come in two flavours:
//
//   PLAIN TEXT  — escaped individually before being substituted in,
//                 because widgets in this bucket promise plain-text
//                 output. Currently unused (all widgets emit HTML),
//                 kept so a future widget can opt back in.
//   HTML        — raw inline-styled HTML (tables, paragraphs). Used for
//                 all current widgets. Spliced in raw via sentinels.
//
// Paragraph / line-break rules (kept so plain-text bodies still look
// right):
//
//   1. Replace HTML-trusted tokens with unique placeholder sentinels.
//      (We use \x00 markers — these can never appear in admin text
//      because the textarea rejects null bytes in practice, and we
//      defensively strip them just before substitution.)
//
//   2. Replace plain-text tokens with HTML-escaped versions of their
//      values. Admin text is NOT escaped.
//
//   3. Split into paragraphs on blank lines (the broadcast renderer's
//      existing convention).
//
//   4. For each paragraph:
//        - Bare sentinel: emit the widget HTML on its own — wrapping
//          a table in <p> would be invalid HTML.
//        - "Looks like an HTML block" (starts with `<` and ends with
//          `>` after trimming): emit raw, with no <p> wrap and no
//          <br> insertion. This is what lets admins paste a `<ul>` or
//          `<table>` and have it render correctly. Inline sentinels
//          inside still get spliced.
//        - Otherwise: wrap in <p>, convert single \n to <br>, splice
//          in any inline sentinels.
//
// SECURITY NOTE: This route is gated to admins (see the parent layout
// in src/app/[poolSlug]/admin/layout.tsx). Per the project requirement,
// XSS is not a concern here — only admins compose these emails. Do NOT
// reuse this renderer for non-admin-authored content without re-adding
// the body-escape pass.
// ---------------------------------------------------------------------------

/**
 * Token name → widget output value. Partitioned by which family each
 * token belongs to (escape vs. raw). Token keys MUST NOT overlap
 * between the two families.
 */
export interface RenderTokens {
  /** Plain-text widget outputs. Will be HTML-escaped at substitution time. */
  plain: Record<string, string>;
  /** HTML widget outputs. Will NOT be HTML-escaped. */
  html: Record<string, string>;
}

const SENTINEL_PREFIX = "\u0000W:";
const SENTINEL_SUFFIX = "\u0000";
const SENTINEL_REGEX = /\u0000W:(\d+)\u0000/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the admin's body + widget tokens into the final HTML payload
 * that goes inside the email template's body slot.
 *
 * @param body         The admin's freeform body, including any
 *                     {{token}} placeholders. Treated as raw HTML —
 *                     not escaped. See SECURITY NOTE at the top of
 *                     this file.
 * @param tokens       The widget output values, partitioned by family.
 * @param paragraphStyle  Inline style applied to each wrapping <p>.
 *                        Pulled out so the broadcast renderer can keep
 *                        its visual identity here.
 */
export function renderEmailBodyHtml(
  body: string,
  tokens: RenderTokens,
  paragraphStyle: string
): string {
  // Defensive: strip any literal null bytes the admin may have managed
  // to paste in, so our sentinels remain unambiguous.
  let working = body.replace(/\u0000/g, "");

  // ---- Pass 1: HTML tokens → numbered placeholders ----------------------
  // We index by occurrence so multiple {{group-phase-picks}} expansions
  // in the same body are each tracked individually (though there's no
  // practical reason to have more than one). The replacements array
  // mirrors the placeholder ids.
  const replacements: string[] = [];
  working = working.replace(
    /\{\{([a-zA-Z0-9_-]+)\}\}/g,
    (match, name: string) => {
      if (Object.prototype.hasOwnProperty.call(tokens.html, name)) {
        const id = replacements.length;
        replacements.push(tokens.html[name]);
        return `${SENTINEL_PREFIX}${id}${SENTINEL_SUFFIX}`;
      }
      // Not an HTML token — leave for pass 2 (or as-is if unknown).
      return match;
    }
  );

  // ---- Pass 2: plain-text tokens → escaped text values ------------------
  // Plain-text widgets are HTML-escaped at substitution time. The
  // admin's surrounding text is NOT escaped (admins are trusted to
  // author HTML), so we can't rely on a global escape pass — we have
  // to escape these individually instead.
  working = working.replace(
    /\{\{([a-zA-Z0-9_-]+)\}\}/g,
    (match, name: string) => {
      if (Object.prototype.hasOwnProperty.call(tokens.plain, name)) {
        return escapeHtml(tokens.plain[name]);
      }
      // Unknown token: leave the {{name}} literal in place — that's a
      // helpful signal to the admin that they typo'd.
      return match;
    }
  );

  // ---- Pass 3: paragraph + line-break rendering -------------------------
  const paragraphs = working.split(/\n\n+/);

  const rendered = paragraphs
    .map((p) => {
      const trimmed = p.trim();

      // Skip wholly-empty paragraphs (extra blank lines in the middle
      // of a body).
      if (trimmed.length === 0) return "";

      // Bare-sentinel paragraph: emit the widget HTML on its own. We
      // accept ONLY-WHITESPACE around the sentinel as "bare" so a
      // paragraph like "\n  \x00W:0\x00 \n" still qualifies. This is
      // the common case — the admin pastes the token on its own line
      // — and producing a wrapping <p> around a <table> would be
      // invalid HTML.
      const bareMatch = trimmed.match(/^\u0000W:(\d+)\u0000$/);
      if (bareMatch) {
        const id = Number(bareMatch[1]);
        return replacements[id] ?? "";
      }

      // "Looks like an HTML block" — starts with `<` and ends with
      // `>` after trimming. Emit raw, no <p> wrap, no \n → <br>
      // conversion (admins controlling block-level HTML should also
      // control their own whitespace). Inline sentinels still get
      // spliced. This is what lets a pasted `<ul>…</ul>` or
      // `<table>…</table>` render correctly.
      if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
        return trimmed.replace(SENTINEL_REGEX, (_m, idStr) => {
          const id = Number(idStr);
          return replacements[id] ?? "";
        });
      }

      // Mixed / plain paragraph: wrap in <p>, convert single newlines
      // to <br>, splice in inline sentinels. Admin HTML inside (e.g.
      // a `<strong>` or `<a>`) flows through untouched because we
      // never escaped it.
      const withBreaks = p.replace(/\n/g, "<br>");
      const inlined = withBreaks.replace(SENTINEL_REGEX, (_m, idStr) => {
        const id = Number(idStr);
        return replacements[id] ?? "";
      });
      return `<p style="${paragraphStyle}">${inlined}</p>`;
    })
    .join("");

  return rendered;
}
