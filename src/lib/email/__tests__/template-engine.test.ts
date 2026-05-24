// ---------------------------------------------------------------------------
// Template engine — embedded test suite.
//
// The repo has no test runner configured, so this file uses plain
// assertions and can be run ad-hoc with `npx tsx src/lib/email/__tests__/template-engine.test.ts`.
// It documents the expected behaviour of the engine alongside acting as
// a regression check.
//
// Tests are grouped by feature: interpolation, escaping, blocks,
// scoping, errors. Each test is a small named block; failure throws an
// AssertionError with a descriptive message.
// ---------------------------------------------------------------------------

import {
  parse,
  render,
  renderTemplate,
  TemplateParseError,
  TemplateRenderError,
} from "../template-engine";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    failures.push(`✗ ${name}: ${(err as Error).message}`);
  }
}

function eq(actual: unknown, expected: unknown, label?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ": " : ""}expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
    );
  }
}

function throws(fn: () => unknown, errClass: new (...args: never[]) => Error, label?: string): void {
  let threw: Error | null = null;
  try {
    fn();
  } catch (e) {
    threw = e as Error;
  }
  if (threw === null) {
    throw new Error(`${label ? label + ": " : ""}expected ${errClass.name}, but no error was thrown`);
  }
  if (!(threw instanceof errClass)) {
    const caught: Error = threw;
    throw new Error(
      `${label ? label + ": " : ""}expected ${errClass.name}, got ${caught.constructor.name}: ${caught.message}`
    );
  }
}

// ---- Interpolation --------------------------------------------------------

test("interpolation: simple field", () => {
  eq(renderTemplate("Hello {{name}}", { name: "Jim" }), "Hello Jim");
});

test("interpolation: dot path", () => {
  eq(
    renderTemplate("Hi {{user.name}}", { user: { name: "Ada" } }),
    "Hi Ada"
  );
});

test("interpolation: deep dot path", () => {
  eq(
    renderTemplate("{{a.b.c.d}}", { a: { b: { c: { d: "deep" } } } }),
    "deep"
  );
});

test("interpolation: HTML-escapes by default", () => {
  eq(
    renderTemplate("{{html}}", { html: '<a href="x">b</a>' }),
    "&lt;a href=&quot;x&quot;&gt;b&lt;/a&gt;"
  );
});

test("interpolation: triple-brace emits raw HTML", () => {
  eq(
    renderTemplate("{{{html}}}", { html: '<a href="x">b</a>' }),
    '<a href="x">b</a>'
  );
});

test("interpolation: number", () => {
  eq(renderTemplate("{{n}}", { n: 42 }), "42");
});

test("interpolation: boolean true", () => {
  eq(renderTemplate("{{b}}", { b: true }), "true");
});

test("interpolation: null renders as empty", () => {
  eq(renderTemplate("[{{x}}]", { x: null }), "[]");
});

test("interpolation: zero is rendered, not blank", () => {
  eq(renderTemplate("[{{x}}]", { x: 0 }), "[0]");
});

test("interpolation: missing field throws", () => {
  throws(() => renderTemplate("{{nope}}", {}), TemplateRenderError);
});

test("interpolation: missing deep path throws", () => {
  throws(() => renderTemplate("{{a.b.c}}", { a: { b: {} } }), TemplateRenderError);
});

// ---- Blocks: if -----------------------------------------------------------

test("if: truthy branch", () => {
  eq(
    renderTemplate("{{#if x}}yes{{/if}}", { x: true }),
    "yes"
  );
});

test("if: falsy branch is empty", () => {
  eq(
    renderTemplate("{{#if x}}yes{{/if}}", { x: false }),
    ""
  );
});

test("if/else: takes else branch", () => {
  eq(
    renderTemplate("{{#if x}}yes{{else}}no{{/if}}", { x: false }),
    "no"
  );
});

test("if: empty array is falsy", () => {
  eq(
    renderTemplate("{{#if items}}yes{{else}}empty{{/if}}", { items: [] }),
    "empty"
  );
});

test("if: non-empty array is truthy", () => {
  eq(
    renderTemplate("{{#if items}}yes{{/if}}", { items: [1] }),
    "yes"
  );
});

test("if: empty string is falsy", () => {
  eq(
    renderTemplate("{{#if s}}yes{{else}}no{{/if}}", { s: "" }),
    "no"
  );
});

test("if: zero is falsy", () => {
  eq(
    renderTemplate("{{#if n}}yes{{else}}no{{/if}}", { n: 0 }),
    "no"
  );
});

test("if: missing path is falsy (not an error)", () => {
  eq(
    renderTemplate("{{#if missing}}yes{{else}}no{{/if}}", {}),
    "no"
  );
});

test("if: .length on array", () => {
  eq(
    renderTemplate("{{#if items.length}}yes{{else}}no{{/if}}", { items: [1] }),
    "yes"
  );
});

// ---- Blocks: each ---------------------------------------------------------

test("each: iterates", () => {
  eq(
    renderTemplate("{{#each items}}[{{this}}]{{/each}}", {
      items: ["a", "b", "c"],
    }),
    "[a][b][c]"
  );
});

test("each: iterates objects with field access", () => {
  eq(
    renderTemplate("{{#each xs}}({{n}}){{/each}}", {
      xs: [{ n: 1 }, { n: 2 }, { n: 3 }],
    }),
    "(1)(2)(3)"
  );
});

test("each: empty array is empty output", () => {
  eq(renderTemplate("{{#each xs}}[{{this}}]{{/each}}", { xs: [] }), "");
});

test("each: @index", () => {
  eq(
    renderTemplate("{{#each xs}}{{@index}}={{this}};{{/each}}", {
      xs: ["a", "b"],
    }),
    "0=a;1=b;"
  );
});

test("each: @first and @last", () => {
  eq(
    renderTemplate(
      "{{#each xs}}{{#if @first}}[{{/if}}{{this}}{{#if @last}}]{{/if}}{{/each}}",
      { xs: ["a", "b", "c"] }
    ),
    "[abc]"
  );
});

test("each: throws on non-array", () => {
  throws(
    () => renderTemplate("{{#each xs}}x{{/each}}", { xs: "not-array" }),
    TemplateRenderError
  );
});

test("each: throws on missing field", () => {
  throws(
    () => renderTemplate("{{#each missing}}x{{/each}}", {}),
    TemplateRenderError
  );
});

test("each: lexical scope falls through to parent", () => {
  // `pool` is on the parent scope; inside #each pickSets, a bare `pool`
  // should still resolve.
  eq(
    renderTemplate("{{#each pickSets}}{{pool.name}}-{{name}};{{/each}}", {
      pool: { name: "P" },
      pickSets: [{ name: "A" }, { name: "B" }],
    }),
    "P-A;P-B;"
  );
});

test("each: nested each + inner field access", () => {
  eq(
    renderTemplate(
      "{{#each xs}}{{name}}({{#each items}}{{this}},{{/each}}){{/each}}",
      {
        xs: [
          { name: "A", items: [1, 2] },
          { name: "B", items: [3] },
        ],
      }
    ),
    "A(1,2,)B(3,)"
  );
});

// ---- Comments -------------------------------------------------------------

test("comments: single-line removed", () => {
  eq(
    renderTemplate("a{{! note }}b", {}),
    "ab"
  );
});

test("comments: multi-line removed", () => {
  eq(
    renderTemplate("a{{!--\n  multi-line\n  comment\n--}}b", {}),
    "ab"
  );
});

// ---- Parse errors ---------------------------------------------------------

test("parse: unclosed {{", () => {
  throws(() => parse("hello {{name"), TemplateParseError);
});

test("parse: unclosed #each", () => {
  throws(() => parse("{{#each xs}}body"), TemplateParseError);
});

test("parse: unclosed #if", () => {
  throws(() => parse("{{#if x}}body"), TemplateParseError);
});

test("parse: mismatched closer", () => {
  throws(() => parse("{{#each xs}}body{{/if}}"), TemplateParseError);
});

test("parse: stray {{else}}", () => {
  throws(() => parse("plain{{else}}"), TemplateParseError);
});

test("parse: unexpected closer", () => {
  throws(() => parse("plain{{/each}}"), TemplateParseError);
});

test("parse: empty tag", () => {
  throws(() => parse("{{}}"), TemplateParseError);
});

test("parse: unknown block kind", () => {
  throws(() => parse("{{#foo bar}}{{/foo}}"), TemplateParseError);
});

test("parse: block without argument", () => {
  throws(() => parse("{{#each}}body{{/each}}"), TemplateParseError);
});

test("parse: bad path characters", () => {
  throws(() => parse("{{name with space}}"), TemplateParseError);
});

// ---- Realistic widget templates ------------------------------------------

test("realistic: standings-summary-shaped template", () => {
  const tpl = `
{{#each pickSets}}
<p style="font-weight:700">{{name}} — Rank {{rank}}, {{totalPoints}} pts</p>
{{/each}}
`.trim();
  const data = {
    pickSets: [
      { name: "Alpha", rank: 1, totalPoints: 42 },
      { name: "Beta", rank: 3, totalPoints: 30 },
    ],
  };
  // Whitespace inside the {{#each}} body is preserved verbatim per
  // iteration — including the leading and trailing newlines around
  // the <p>. The engine is intentionally not trim-on-block.
  eq(
    renderTemplate(tpl, data),
    `\n<p style="font-weight:700">Alpha — Rank 1, 42 pts</p>\n\n<p style="font-weight:700">Beta — Rank 3, 30 pts</p>\n`
  );
});

test("realistic: missing-picks template with empty branch", () => {
  const tpl = `
{{#each pickSets}}
<p><strong>{{name}}</strong></p>
{{#if missingMatches.length}}
<ul>{{#each missingMatches}}<li>{{home}} vs {{away}}</li>{{/each}}</ul>
{{else}}
<p>No missing picks</p>
{{/if}}
{{/each}}
`.trim();
  const data = {
    pickSets: [
      {
        name: "Alpha",
        missingMatches: [
          { home: "Mexico", away: "Brazil" },
          { home: "Italy", away: "Germany" },
        ],
      },
      { name: "Beta", missingMatches: [] },
    ],
  };
  const out = renderTemplate(tpl, data);
  if (!out.includes("<li>Mexico vs Brazil</li>")) {
    throw new Error("expected Mexico vs Brazil bullet");
  }
  if (!out.includes("No missing picks")) {
    throw new Error("expected empty-branch text for Beta");
  }
});

test("realistic: escaping team names", () => {
  // Team named with an apostrophe; engine should escape it in the default
  // double-brace branch.
  const out = renderTemplate("{{home}} vs {{away}}", {
    home: "Côte d'Ivoire",
    away: "<script>",
  });
  eq(out, "Côte d&#39;Ivoire vs &lt;script&gt;");
});

// ---- Report ---------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
