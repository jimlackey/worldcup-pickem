// ---------------------------------------------------------------------------
// Integration smoke test: data builder + engine end-to-end.
//
// Constructs a minimal synthetic EmailContext, runs it through
// buildRecipientTemplateData, then renders several realistic widget
// templates against the result. Verifies the data contract documented
// in recipient-data.ts actually matches what templates can read.
//
// Run with: npx tsx src/lib/email/__tests__/recipient-data.smoke.ts
// ---------------------------------------------------------------------------

import { buildRecipientTemplateData } from "../recipient-data";
import { renderTemplate } from "../template-engine";
import type { EmailContext } from "../load-context";

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

function contains(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(
      `${label}: expected output to contain ${JSON.stringify(needle)}\n--- output ---\n${haystack}\n--- end ---`
    );
  }
}

function notContains(haystack: string, needle: string, label: string): void {
  if (haystack.includes(needle)) {
    throw new Error(
      `${label}: expected output NOT to contain ${JSON.stringify(needle)}\n--- output ---\n${haystack}\n--- end ---`
    );
  }
}

// ---- Synthetic context ----------------------------------------------------

const MEX_ID = "team-mex";
const BRA_ID = "team-bra";
const GER_ID = "team-ger";
const ITA_ID = "team-ita";

const M1_ID = "match-1";
const M2_ID = "match-2";

// Minimal EmailContext — only the fields buildRecipientTemplateData reads.
// Casts to EmailContext at the use site because we don't fill PoolMembership
// shape; the builder doesn't read activeMembers itself, just rollupByParticipant.
const ctx = {
  standings: [
    {
      pick_set_id: "ps-1",
      pick_set_name: "Alpha",
      participant_id: "p-1",
      participant_email: "p1@example.com",
      display_name: "Player One",
      group_points: 6,
      knockout_points: 0,
      total_points: 6,
      rank: 1,
    },
    {
      pick_set_id: "ps-2",
      pick_set_name: "Beta",
      participant_id: "p-1",
      participant_email: "p1@example.com",
      display_name: "Player One",
      group_points: 3,
      knockout_points: 0,
      total_points: 3,
      rank: 2,
    },
  ],
  groupMatches: [
    {
      id: M1_ID,
      phase: "group" as const,
      match_number: 1,
      home_team_id: MEX_ID,
      away_team_id: BRA_ID,
      result: "home" as const,
      status: "completed" as const,
    },
    {
      id: M2_ID,
      phase: "group" as const,
      match_number: 2,
      home_team_id: GER_ID,
      away_team_id: ITA_ID,
      result: null,
      status: "scheduled" as const,
    },
  ],
  knockoutMatches: [],
  teamsById: new Map<string, { id: string; name: string }>([
    [MEX_ID, { id: MEX_ID, name: "Mexico" }],
    [BRA_ID, { id: BRA_ID, name: "Brazil" }],
    [GER_ID, { id: GER_ID, name: "Germany" }],
    [ITA_ID, { id: ITA_ID, name: "Italy" }],
  ]),
  knockoutPhaseStarted: false,
  rollupByParticipant: new Map(),
  activeMembers: [],
};

const rollup = {
  pickSets: [
    {
      pick_set_id: "ps-1",
      pick_set_name: "Alpha",
      group_correct: 1,
      knockout_correct: 0,
      // ps-1 has picked M1 (home, correct), not M2
      groupPickedMatchIds: new Set([M1_ID]),
      knockoutPickedMatchIds: new Set<string>(),
      groupPicksByMatchId: new Map([[M1_ID, "home" as const]]),
      knockoutPicksByMatchId: new Map(),
    },
    {
      pick_set_id: "ps-2",
      pick_set_name: "Beta",
      group_correct: 0,
      knockout_correct: 0,
      // ps-2 hasn't picked anything
      groupPickedMatchIds: new Set<string>(),
      knockoutPickedMatchIds: new Set<string>(),
      groupPicksByMatchId: new Map(),
      knockoutPicksByMatchId: new Map(),
    },
  ],
};

const data = buildRecipientTemplateData({
  ctx: ctx as unknown as EmailContext,
  participantId: "p-1",
  rollup,
  recipientName: "Player One",
  recipientEmail: "p1@example.com",
  poolName: "Test Pool",
});

// ---- Schema sanity checks ------------------------------------------------

test("data: recipient and pool shape", () => {
  if (data.recipient.name !== "Player One") throw new Error("recipient.name");
  if (data.recipient.email !== "p1@example.com") throw new Error("recipient.email");
  if (data.pool.name !== "Test Pool") throw new Error("pool.name");
  if (data.pool.knockoutPhaseStarted !== false)
    throw new Error("pool.knockoutPhaseStarted");
  if (data.pool.totalPickSets !== 2)
    throw new Error(`pool.totalPickSets=${data.pool.totalPickSets}, want 2`);
});

test("data: pickSets length and order", () => {
  if (data.pickSets.length !== 2) throw new Error(`pickSets.length=${data.pickSets.length}`);
  if (data.pickSets[0].name !== "Alpha") throw new Error("pickSets[0].name");
  if (data.pickSets[1].name !== "Beta") throw new Error("pickSets[1].name");
});

test("data: ranks and totals", () => {
  if (data.pickSets[0].rank !== 1) throw new Error("Alpha rank");
  if (data.pickSets[0].totalPoints !== 6) throw new Error("Alpha total");
  if (data.pickSets[0].groupPoints !== 6) throw new Error("Alpha group");
  if (data.pickSets[1].rank !== 2) throw new Error("Beta rank");
});

test("data: completion counts", () => {
  if (data.pickSets[0].groupCompleteCount !== 1)
    throw new Error("Alpha groupCompleteCount");
  if (data.pickSets[0].groupPickableCount !== 2)
    throw new Error("Alpha groupPickableCount");
  if (data.pickSets[1].groupCompleteCount !== 0)
    throw new Error("Beta groupCompleteCount");
});

test("data: missing matches for Alpha", () => {
  const missing = data.pickSets[0].missingGroupMatches;
  if (missing.length !== 1) throw new Error(`Alpha missing.length=${missing.length}`);
  if (missing[0].home !== "Germany") throw new Error("Alpha missing[0].home");
  if (missing[0].away !== "Italy") throw new Error("Alpha missing[0].away");
});

test("data: missing matches for Beta (all)", () => {
  const missing = data.pickSets[1].missingGroupMatches;
  if (missing.length !== 2) throw new Error(`Beta missing.length=${missing.length}`);
});

test("data: groupPickRows for Alpha", () => {
  const rows = data.pickSets[0].groupPickRows;
  if (rows.length !== 2) throw new Error(`Alpha rows.length=${rows.length}`);

  // Row 1: M1, picked HOME, result HOME, completed, isCorrect true, isPicked true
  if (rows[0].picked !== "home") throw new Error("row0.picked");
  if (rows[0].pickedLabel !== "MEXICO") throw new Error(`row0.pickedLabel=${rows[0].pickedLabel}`);
  if (rows[0].isPicked !== true) throw new Error("row0.isPicked");
  if (rows[0].result !== "home") throw new Error("row0.result");
  if (rows[0].isCorrect !== true) throw new Error("row0.isCorrect");
  if (rows[0].status !== "completed") throw new Error("row0.status");

  // Row 2: M2, NOT picked, no result, scheduled, isCorrect null, isPicked false
  if (rows[1].picked !== null) throw new Error("row1.picked");
  if (rows[1].pickedLabel !== "NOT PICKED") throw new Error("row1.pickedLabel");
  if (rows[1].isPicked !== false) throw new Error("row1.isPicked");
  if (rows[1].isCorrect !== null) throw new Error("row1.isCorrect");
});

// ---- Template rendering --------------------------------------------------

test("template: realistic missing-picks widget", () => {
  const tpl = `{{#each pickSets}}<p><strong>{{name}}</strong></p>{{#if missingGroupMatches.length}}<ul>{{#each missingGroupMatches}}<li>{{home}} vs {{away}}</li>{{/each}}</ul>{{else}}<p>No missing picks</p>{{/if}}{{/each}}`;
  const out = renderTemplate(tpl, data);
  contains(out, "<strong>Alpha</strong>", "Alpha header");
  contains(out, "<li>Germany vs Italy</li>", "Alpha missing item");
  contains(out, "<strong>Beta</strong>", "Beta header");
  contains(out, "<li>Mexico vs Brazil</li>", "Beta missing M1");
  contains(out, "<li>Germany vs Italy</li>", "Beta missing M2");
});

test("template: realistic standings-summary widget", () => {
  const tpl = `{{#each pickSets}}<p>{{name}} — Rank {{rank}}, {{totalPoints}} pts (group: {{groupCorrect}} correct / {{groupPickableCount}})</p>{{/each}}`;
  const out = renderTemplate(tpl, data);
  contains(out, "Alpha — Rank 1, 6 pts (group: 1 correct / 2)", "Alpha line");
  contains(out, "Beta — Rank 2, 3 pts (group: 0 correct / 2)", "Beta line");
});

test("template: realistic group-phase-picks widget", () => {
  const tpl = `{{#each pickSets}}<h3>{{name}}</h3><table>{{#each groupPickRows}}<tr><td>{{home}} vs {{away}}</td><td>{{pickedLabel}}</td></tr>{{/each}}</table>{{/each}}`;
  const out = renderTemplate(tpl, data);
  // Alpha
  contains(out, "<h3>Alpha</h3>", "Alpha header");
  contains(out, "<tr><td>Mexico vs Brazil</td><td>MEXICO</td></tr>", "Alpha picked M1");
  contains(out, "<tr><td>Germany vs Italy</td><td>NOT PICKED</td></tr>", "Alpha not-picked M2");
  // Beta
  contains(out, "<tr><td>Mexico vs Brazil</td><td>NOT PICKED</td></tr>", "Beta not-picked M1");
});

test("template: pool-level conditionals", () => {
  const tpl = `{{#if pool.knockoutPhaseStarted}}KO STARTED{{else}}KO NOT YET{{/if}}`;
  const out = renderTemplate(tpl, data);
  contains(out, "KO NOT YET", "ko branch");
});

test("template: recipient interpolation", () => {
  const tpl = `Hi {{recipient.name}} ({{recipient.email}})`;
  const out = renderTemplate(tpl, data);
  contains(out, "Hi Player One (p1@example.com)", "recipient line");
});

test("template: HTML escaping in default branch", () => {
  // Synthesize a pick set with a name that contains HTML.
  const escapeData = {
    pickSets: [{ name: '<script>alert("x")</script>' }],
  };
  const tpl = `{{#each pickSets}}{{name}}{{/each}}`;
  const out = renderTemplate(tpl, escapeData);
  notContains(out, "<script>", "raw html should be escaped");
  contains(out, "&lt;script&gt;", "html should be escaped");
});

test("template: @first and @last in iteration", () => {
  const tpl = `{{#each pickSets}}{{#if @first}}[{{/if}}{{name}}{{#if @last}}]{{else}},{{/if}}{{/each}}`;
  const out = renderTemplate(tpl, data);
  contains(out, "[Alpha,Beta]", "first/last markers");
});

// ---- Report ---------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
