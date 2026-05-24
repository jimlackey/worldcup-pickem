// ---------------------------------------------------------------------------
// Handlebars-flavored template engine for email widgets.
//
// Why a small engine vs. pulling in Handlebars itself:
//   - One additional npm dep was overkill for the feature surface we need
//     (field interpolation, {{#each}}, {{#if}}/{{else}}).
//   - Handlebars's runtime is permissive in ways that don't fit an email
//     authoring tool (silent missing-field returns "", silent type
//     coercion, helpers, partials, runtime registration). We want LOUD
//     errors so the admin learns what's wrong.
//   - Keeping the surface small means we can change it confidently later
//     without breaking templates — admins write against a narrow,
//     documented contract.
//
// Surface:
//
//   {{ path }}              HTML-escaped interpolation
//   {{{ path }}}            Raw HTML interpolation (caller's responsibility)
//   {{# each path }} ... {{/ each }}
//                           Iterate; inside the block, `this` resolves to
//                           the current element; field access also looks
//                           up the parent scope on miss (Handlebars-style
//                           lexical scoping).
//   {{# if path }} ... {{ else }} ... {{/ if }}
//                           Truthy = non-empty array, non-zero number,
//                           non-empty string, true. The {{else}} branch is
//                           optional.
//   {{ ! comment }}         Removed from output, including the surrounding
//                           token. Multi-line comments are supported as
//                           {{!-- ... --}}.
//   path                    Dot path (a.b.c) into the current data scope.
//                           Special names: `this` is the current scope,
//                           `@index` (inside #each) is the 0-based iteration
//                           index, `@first` / `@last` are booleans.
//
// Whitespace around block tags is preserved verbatim. Authors who want
// trim-on-block behaviour can write it themselves — we don't try to
// guess.
//
// Errors:
//   - parse(): throws TemplateParseError with a 1-based line / column.
//   - render(): throws TemplateRenderError on missing fields, type
//     mismatches, or iterating a non-array. The caller is responsible
//     for catching at render time if a single-widget failure shouldn't
//     blow up the whole email.
// ---------------------------------------------------------------------------

// ===========================================================================
// Errors
// ===========================================================================

export class TemplateParseError extends Error {
  readonly line: number;
  readonly column: number;
  constructor(message: string, line: number, column: number) {
    super(`Template parse error at ${line}:${column}: ${message}`);
    this.name = "TemplateParseError";
    this.line = line;
    this.column = column;
  }
}

export class TemplateRenderError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(`Template render error at ${path}: ${message}`);
    this.name = "TemplateRenderError";
    this.path = path;
  }
}

// ===========================================================================
// AST
// ===========================================================================

type TextNode = { type: "text"; value: string };
type InterpolationNode = {
  type: "interpolation";
  path: string;
  escape: boolean;
  line: number;
  column: number;
};
type EachNode = {
  type: "each";
  path: string;
  body: Node[];
  line: number;
  column: number;
};
type IfNode = {
  type: "if";
  path: string;
  consequent: Node[];
  alternate: Node[];
  line: number;
  column: number;
};
type Node = TextNode | InterpolationNode | EachNode | IfNode;

// ===========================================================================
// Parser
// ===========================================================================

// Token regexes. The lexer scans for the next opening `{{` and emits
// alternating text and tag tokens. Tags are classified by their first
// non-whitespace character after `{{`.

const PATH_REGEX = /^[a-zA-Z_@][a-zA-Z0-9_@.]*$/;

function lineColAt(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset; i++) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function isValidPath(path: string): boolean {
  if (path === "this") return true;
  return PATH_REGEX.test(path);
}

/**
 * Parse a template source string into an AST. Throws TemplateParseError
 * on malformed input (unclosed blocks, bad paths, unexpected `else`,
 * mismatched closers, etc.).
 */
export function parse(source: string): Node[] {
  // Strip block comments `{{!-- ... --}}` first. They're removed from
  // the source entirely — easier than threading a third token type
  // through the lexer.
  const commentStripped = source.replace(/\{\{!--[\s\S]*?--\}\}/g, "");

  // Triple-brace `{{{ path }}}` is handled specially because it has
  // three open + three close braces. We scan the source for `{{` and
  // peek the next char to choose between two-brace and three-brace.

  const stack: { node: EachNode | IfNode; branch: "consequent" | "alternate" }[] = [];
  const root: Node[] = [];
  // top() returns the current "where to push" array — the body of the
  // innermost open block, or the root array.
  function top(): Node[] {
    if (stack.length === 0) return root;
    const frame = stack[stack.length - 1];
    if (frame.node.type === "each") return frame.node.body;
    return frame.branch === "consequent"
      ? frame.node.consequent
      : frame.node.alternate;
  }

  let i = 0;
  const len = commentStripped.length;
  while (i < len) {
    // Find next `{{`
    const next = commentStripped.indexOf("{{", i);
    if (next === -1) {
      // Trailing text — push and stop.
      const tail = commentStripped.slice(i);
      if (tail.length > 0) top().push({ type: "text", value: tail });
      break;
    }
    // Push the text between the previous position and the next `{{`.
    if (next > i) {
      top().push({ type: "text", value: commentStripped.slice(i, next) });
    }

    const tagStart = next;
    const isTriple = commentStripped[next + 2] === "{";
    const openLen = isTriple ? 3 : 2;
    const closeStr = isTriple ? "}}}" : "}}";
    const closeAt = commentStripped.indexOf(closeStr, next + openLen);
    if (closeAt === -1) {
      const { line, column } = lineColAt(commentStripped, tagStart);
      throw new TemplateParseError(
        `Unclosed ${isTriple ? "{{{...}}}" : "{{...}}"} tag`,
        line,
        column
      );
    }

    const inner = commentStripped.slice(next + openLen, closeAt).trim();
    const { line, column } = lineColAt(commentStripped, tagStart);

    // Classify the tag.
    if (inner.length === 0) {
      throw new TemplateParseError("Empty tag", line, column);
    }

    if (inner[0] === "!") {
      // Single-line comment {{! ... }}; remove from output. Already
      // consumed by the slice — nothing to push.
    } else if (inner[0] === "#") {
      // Opener: #each PATH or #if PATH
      const body = inner.slice(1).trim();
      const spaceAt = body.search(/\s/);
      if (spaceAt === -1) {
        throw new TemplateParseError(
          `Block tag needs an argument (e.g. "#each items" or "#if visible")`,
          line,
          column
        );
      }
      const kind = body.slice(0, spaceAt);
      const path = body.slice(spaceAt + 1).trim();
      if (!isValidPath(path)) {
        throw new TemplateParseError(
          `Invalid path "${path}"`,
          line,
          column
        );
      }
      if (kind === "each") {
        const node: EachNode = {
          type: "each",
          path,
          body: [],
          line,
          column,
        };
        top().push(node);
        stack.push({ node, branch: "consequent" });
      } else if (kind === "if") {
        const node: IfNode = {
          type: "if",
          path,
          consequent: [],
          alternate: [],
          line,
          column,
        };
        top().push(node);
        stack.push({ node, branch: "consequent" });
      } else {
        throw new TemplateParseError(
          `Unknown block "#${kind}". Supported: "#each", "#if"`,
          line,
          column
        );
      }
    } else if (inner[0] === "/") {
      // Closer: /each or /if
      const kind = inner.slice(1).trim();
      const frame = stack.pop();
      if (!frame) {
        throw new TemplateParseError(
          `Unexpected closing tag {{/${kind}}}`,
          line,
          column
        );
      }
      if (frame.node.type !== kind) {
        throw new TemplateParseError(
          `Mismatched closing tag {{/${kind}}} (expected {{/${frame.node.type}}})`,
          line,
          column
        );
      }
    } else if (inner === "else") {
      const frame = stack[stack.length - 1];
      if (!frame || frame.node.type !== "if") {
        throw new TemplateParseError(
          `Unexpected {{else}} (must appear inside an {{#if}})`,
          line,
          column
        );
      }
      frame.branch = "alternate";
    } else {
      // Interpolation: triple-brace = raw, double-brace = escaped.
      // Path validation: a single dot-path with no spaces.
      if (!isValidPath(inner)) {
        throw new TemplateParseError(
          `Invalid path "${inner}"`,
          line,
          column
        );
      }
      top().push({
        type: "interpolation",
        path: inner,
        escape: !isTriple,
        line,
        column,
      });
    }

    i = closeAt + closeStr.length;
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1].node;
    throw new TemplateParseError(
      `Unclosed {{#${unclosed.type}}} block`,
      unclosed.line,
      unclosed.column
    );
  }

  return root;
}

// ===========================================================================
// Evaluator
// ===========================================================================

/**
 * The evaluator walks the AST and produces a string. Data lookups
 * follow Handlebars-style lexical scoping: a bare name first resolves
 * against the current scope (the innermost #each element), then walks
 * up the stack until found. Dot paths resolve against the current
 * scope only — they're explicit qualified references.
 */

interface Frame {
  scope: unknown;
  extras?: Record<string, unknown>; // @index, @first, @last
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function resolvePath(
  path: string,
  stack: Frame[]
): { value: unknown; resolved: boolean } {
  // The path is one or more dot-separated segments. The first segment
  // is looked up in the scope stack (innermost first). Subsequent
  // segments index into the result.
  const segments = path.split(".");
  const head = segments[0];

  let current: unknown;
  let found = false;

  // Special @-prefixed names look up `extras` instead of `scope`.
  if (head.startsWith("@")) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const frame = stack[i];
      if (frame.extras && head in frame.extras) {
        current = frame.extras[head];
        found = true;
        break;
      }
    }
    if (!found) {
      return { value: undefined, resolved: false };
    }
  } else if (head === "this") {
    // `this` always resolves to the innermost scope's value.
    current = stack[stack.length - 1].scope;
    found = true;
  } else {
    // Lexical lookup: walk up the stack.
    for (let i = stack.length - 1; i >= 0; i--) {
      const scope = stack[i].scope;
      if (
        scope !== null &&
        typeof scope === "object" &&
        !Array.isArray(scope) &&
        head in (scope as Record<string, unknown>)
      ) {
        current = (scope as Record<string, unknown>)[head];
        found = true;
        break;
      }
    }
    if (!found) {
      return { value: undefined, resolved: false };
    }
  }

  // Walk the remaining segments through the resolved root.
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (current === null || current === undefined) {
      return { value: undefined, resolved: false };
    }
    if (typeof current !== "object") {
      return { value: undefined, resolved: false };
    }
    // Arrays do support numeric index via [].length etc., though we
    // don't expose bracket syntax — `.length` is the typical case.
    if (Array.isArray(current)) {
      if (seg === "length") {
        current = current.length;
        continue;
      }
      // Numeric segment treated as index.
      const n = Number(seg);
      if (Number.isInteger(n) && n >= 0 && n < current.length) {
        current = current[n];
        continue;
      }
      return { value: undefined, resolved: false };
    }
    const obj = current as Record<string, unknown>;
    if (!(seg in obj)) {
      return { value: undefined, resolved: false };
    }
    current = obj[seg];
  }
  return { value: current, resolved: true };
}

function evalNode(node: Node, stack: Frame[], out: string[]): void {
  switch (node.type) {
    case "text":
      out.push(node.value);
      return;
    case "interpolation": {
      const { value, resolved } = resolvePath(node.path, stack);
      if (!resolved) {
        throw new TemplateRenderError(
          `Field "${node.path}" not found`,
          node.path
        );
      }
      // Render rules: null/undefined → empty; boolean → "true"/"false";
      // number → its string form; everything else → String(value).
      if (value === null || value === undefined) {
        return;
      }
      const str =
        typeof value === "string"
          ? value
          : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : Array.isArray(value)
          ? value.join("")
          : String(value);
      out.push(node.escape ? escapeHtml(str) : str);
      return;
    }
    case "if": {
      const { value } = resolvePath(node.path, stack);
      if (isTruthy(value)) {
        for (const c of node.consequent) evalNode(c, stack, out);
      } else {
        for (const c of node.alternate) evalNode(c, stack, out);
      }
      return;
    }
    case "each": {
      const { value, resolved } = resolvePath(node.path, stack);
      if (!resolved) {
        throw new TemplateRenderError(
          `Field "${node.path}" not found`,
          node.path
        );
      }
      if (!Array.isArray(value)) {
        throw new TemplateRenderError(
          `Field "${node.path}" is not iterable (expected an array)`,
          node.path
        );
      }
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        stack.push({
          scope: item,
          extras: {
            "@index": i,
            "@first": i === 0,
            "@last": i === value.length - 1,
          },
        });
        try {
          for (const c of node.body) evalNode(c, stack, out);
        } finally {
          stack.pop();
        }
      }
      return;
    }
  }
}

/**
 * Render an AST against the given root data. Throws TemplateRenderError
 * on missing fields or type mismatches.
 */
export function render(ast: Node[], data: unknown): string {
  const out: string[] = [];
  const stack: Frame[] = [{ scope: data }];
  for (const node of ast) evalNode(node, stack, out);
  return out.join("");
}

/**
 * One-shot helper: parse + render. Useful when the template doesn't
 * need to be cached across calls. For per-recipient rendering of the
 * same template, the caller should parse() once and call render() per
 * recipient.
 */
export function renderTemplate(source: string, data: unknown): string {
  return render(parse(source), data);
}
