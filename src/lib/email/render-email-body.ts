// ---------------------------------------------------------------------------
// HTML-aware email body renderer.
//
// The email body composer accepts free-form admin text with {{token}}
// placeholders for widgets. Widget outputs come in two flavours:
//
//   PLAIN TEXT  — escaped along with the admin's text. Used for the
//                 standings summary and missing-picks widgets.
//   HTML        — raw inline-styled HTML (tables, paragraphs). Used for
//                 the pick-summaries widgets. Must NOT be escaped.
//
// The substitution flow:
//
//   1. Replace HTML-trusted tokens with unique placeholder sentinels.
//      (We use \x00 markers — these can never appear in admin text
//      because the textarea rejects null bytes in practice, and we
//      defensively strip them just before substitution.)
//
//   2. Replace plain-text tokens with their text values. Both these and
//      the admin's surrounding prose then go through HTML escaping in
//      the next step.
//
//   3. HTML-escape the result.
//
//   4. Split into paragraphs on blank lines, the same convention the
//      existing broadcast renderer uses.
//
//   5. For each paragraph: if it's a bare sentinel, emit the widget
//      HTML standalone (no wrapping <p>, because the widget already
//      contains block-level HTML). Otherwise wrap in <p>, convert
//      single newlines to <br>, and replace any inline sentinels with
//      their widget HTML.
//
// The output is a string of HTML ready to drop into the email
// template's body slot.
// ---------------------------------------------------------------------------

/**
 * Token name → widget output value. Partitioned by which family each
 * token belongs to (escape vs. raw). Token keys MUST NOT overlap
 * between the two families.
 */
export interface RenderTokens {
  /** Plain-text widget outputs. Will be HTML-escaped. */
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
 *                     {{token}} placeholders.
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

  // ---- Pass 2: plain-text tokens → their text values --------------------
  working = working.replace(
    /\{\{([a-zA-Z0-9_-]+)\}\}/g,
    (match, name: string) => {
      if (Object.prototype.hasOwnProperty.call(tokens.plain, name)) {
        return tokens.plain[name];
      }
      // Unknown token: leave the {{name}} literal in place — that's a
      // helpful signal to the admin that they typo'd. It still gets
      // escaped in the next pass so it shows up as literal text, not
      // a "broken HTML" artifact.
      return match;
    }
  );

  // ---- Pass 3: HTML-escape -----------------------------------------------
  // This escapes the admin's text and the plain-text widget outputs.
  // The HTML widgets are still hidden behind sentinels — escapeHtml
  // doesn't touch \x00 — so they survive intact.
  working = escapeHtml(working);

  // ---- Pass 4: paragraph + line-break rendering --------------------------
  const paragraphs = working.split(/\n\n+/);

  const rendered = paragraphs
    .map((p) => {
      const trimmed = p.trim();

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

      // Mixed paragraph: text + maybe inline sentinels.
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
