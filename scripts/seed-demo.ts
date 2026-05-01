/**
 * scripts/seed-demo.ts
 *
 * Seed four demo pools:
 *   1. demo-pre-tournament     — players with varied pick progress, picks open
 *   2. demo-group-phase        — group stage ~50% completed
 *   3. demo-knockout-picking   — group done, bracket set, varied KO picks
 *   4. demo-knockout-phase     — knockout underway
 *
 * Each pool gets admin@demo.example.com as a non-player admin.
 * Some users in each pool have multiple pick sets to demo multi-entry.
 *
 * Run with: npx tsx scripts/seed-demo.ts
 * Idempotent — deletes existing demo pools and re-creates from scratch.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// ---- Load .env.local ----
function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TOURNAMENT_ID =
  process.env.NEXT_PUBLIC_TOURNAMENT_ID || "00000000-0000-0000-0000-000000000001";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing env vars. Ensure .env.local is present.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================================
// Retry helper — wraps async Supabase operations with exponential backoff.
// ============================================================================
// Node's built-in fetch occasionally throws "TypeError: fetch failed" under
// sustained load (especially on Windows) due to connection pool churn. The
// Supabase JS client does not retry these automatically, so we wrap the hot
// paths — batch inserts in particular — in our own retry loop.
//
// Delays: 500ms, 1s, 2s, 4s (total ≈ 7.5s across 4 retries).
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delayMs = 500 * Math.pow(2, attempt - 1);
        console.warn(
          `    ⚠️  ${label} failed (attempt ${attempt}/${maxAttempts}): ${msg} — retrying in ${delayMs}ms...`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error(
          `    ❌ ${label} failed after ${maxAttempts} attempts: ${msg}`
        );
      }
    }
  }
  throw lastError;
}

// ============================================================================
// Scale knobs
// ============================================================================
// 200 players + 250 pick sets = 25 players with 3 sets (75), 175 with 1 set (175).
// 75 + 175 = 250 pick sets across 200 players.
const DEMO_PLAYERS_PER_POOL = 200;
const DEMO_MULTI_SET_PLAYERS = 25;  // these players get MULTI_SET_COUNT sets each
const DEMO_MULTI_SET_COUNT = 3;      // must be ≤ pool.max_pick_sets_per_player (5)
// Pool 1 is slightly different — it's the "picks still open" pool, so not
// everyone fills in picks. Keep the same relative distribution as before:
// first 33% fully picked, next 33% partial, last 33% empty.

// Pool 3 KO picks distribution (out of total pick sets):
// Keep the same proportions that were used before — first 20% full bracket,
// next 20% partial, remainder none.
const POOL3_KO_FULL_FRACTION = 0.20;
const POOL3_KO_PARTIAL_FRACTION = 0.20;

// Batch size for row inserts. Lowered from 100 to 50 — smaller payloads are
// more resilient to transient network issues and the speedup from 50→100 is
// marginal (all HTTP round-trips pay roughly the same latency cost).
const BATCH_SIZE = 50;

// ----------------------------------------------------------------------------
// Featured demo player override (Pool 1 only).
//
// The landing-page "View as Player" button logs visitors in as
// heathercollins@demo.example.com (see src/app/demo-login-actions.ts). To
// give that featured account a more interesting Pool 1 dashboard than three
// identically-full pick sets, we override Heather's three sets in Pool 1
// with a deterministic 72 / 35 / 0 progression:
//
//   "Heather Collins 1" — 72 of 72 picked (full)
//   "Heather Collins 2" — 35 of 72 picked (partial)
//   "Heather Collins 3" —  0 of 72 picked (empty)
//
// If the featured player name no longer appears in PLAYER_NAMES (or her
// position falls outside the multi-set range), the override is silently
// skipped and Pool 1 falls back to the normal thirds-based distribution.
//
// Keep this name in sync with the email in src/app/demo-login-actions.ts —
// nameToEmail("Heather Collins") === "heathercollins@demo.example.com".
const POOL1_FEATURED_PLAYER_NAME = "Heather Collins";
const POOL1_FEATURED_PICK_COUNTS = [72, 35, 0] as const;

// Bracket wiring (same as bracket-picker.tsx)
const BRACKET_FEEDERS: Record<number, [number, number]> = {
  89: [73, 74], 90: [75, 76], 91: [77, 78], 92: [79, 80],
  93: [81, 82], 94: [83, 84], 95: [85, 86], 96: [87, 88],
  97: [89, 90], 98: [91, 92], 99: [93, 94], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  103: [101, 102],
};

// ---- Seeded random ----
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ---- Player names ----
// 200 hand-picked realistic names across a range of cultural backgrounds.
// Every full name is unique, every derived email is unique, and there are no
// collisions with the original 50 names.
const PLAYER_NAMES = [
  // Original 50
  "Mike Jones", "Sarah Chen", "Carlos Rivera", "Emily Watson", "David Kim",
  "Rachel Foster", "James Murphy", "Olivia Green", "Ryan Phillips", "Maria Santos",
  "Tyler Brooks", "Amanda Patel", "Kevin Mitchell", "Jessica Clarke", "Brandon Lee",
  "Nicole Adams", "Justin Howard", "Stephanie Cruz", "Derek Thompson", "Lauren Bailey",
  "Marcus Young", "Heather Collins", "Patrick Dunn", "Ashley Morgan", "Chris Wallace",
  "Megan Stewart", "Trevor Hall", "Kimberly Ross", "Scott Palmer", "Jennifer Torres",
  "Brian Cooper", "Michelle Reed", "Aaron Price", "Christina Bell", "Nathan Gray",
  "Victoria Hughes", "Dylan Carter", "Samantha Perry", "Cody Barnes", "Rebecca Turner",
  "Jake Sullivan", "Hannah Edwards", "Drew Campbell", "Brooke Nelson", "Sean Wright",
  "Katie Morris", "Luke Patterson", "Danielle Shaw", "Evan Russell", "Amber Hayes",
  // Anglo / American variety
  "Jordan Mills", "Alexis Parker", "Trent Fisher", "Chloe Ward", "Mason Reyes",
  "Paige Hunter", "Garrett Bennett", "Sienna Griffin", "Jared Coleman", "Morgan Boyd",
  "Blake Henderson", "Taylor Dixon", "Caleb Warren", "Natalie Richardson", "Owen Sanders",
  "Grace Spencer", "Levi Knox", "Zoe Harper", "Mitchell Franklin", "Ava Burke",
  "Devon Gallagher", "Peyton Becker", "Hunter Frost", "Summer Lowe", "Bryce Nash",
  // Latin / Hispanic
  "Diego Herrera", "Lucia Vega", "Rafael Mendoza", "Sofia Castillo", "Mateo Reyes",
  "Valentina Ortiz", "Miguel Guerrero", "Isabela Fuentes", "Alejandro Navarro", "Camila Delgado",
  "Hector Jimenez", "Elena Vargas", "Sergio Castro", "Gabriela Ramos", "Enrique Molina",
  "Daniela Silva", "Pablo Aguilar", "Catalina Rojas", "Luis Medina", "Ines Dominguez",
  // East Asian
  "Wei Zhang", "Yuki Tanaka", "Min-Jun Park", "Mei Wu", "Kenji Sato",
  "Hyejin Choi", "Haruto Nakamura", "Li Na Huang", "Joon Oh", "Akira Fujimoto",
  "Lin Zhao", "Sho Yamamoto", "Eunji Lim", "Xin Liu", "Takashi Kobayashi",
  // South Asian
  "Arjun Sharma", "Priya Iyer", "Ravi Desai", "Neha Kapoor", "Vikram Singh",
  "Anika Verma", "Rohan Gupta", "Meera Joshi", "Karthik Nair", "Sana Khan",
  "Deepak Rao", "Tanvi Agarwal", "Sameer Bhatt", "Asha Menon", "Nikhil Banerjee",
  // African / African-American typical
  "Jamal Washington", "Tiana Brooks", "DeShawn Carter", "Imani Johnson", "Marcus Freeman",
  "Aaliyah Pierce", "Kendrick Banks", "Simone Blackwell", "Terrence Fuller", "Nia Holmes",
  "Darnell Sheppard", "Kamara Webb", "Xavier Booker", "Jada Whitfield", "Malik Bryant",
  // European variety (Irish, Italian, Slavic, Scandinavian)
  "Liam O'Connor", "Elena Rossi", "Declan Fitzgerald", "Sophia Romano", "Finn Doyle",
  "Anna Kowalski", "Matteo Ricci", "Katya Volkov", "Magnus Andersen", "Freya Lindqvist",
  "Oskar Novak", "Greta Bauer", "Dmitri Sokolov", "Ingrid Johansson", "Luca Ferrari",
  // Middle Eastern / North African
  "Omar Hassan", "Layla Farah", "Tariq Mansour", "Yasmin Habib", "Ziad Khoury",
  "Farida Saleh", "Karim Nasser", "Amira Haddad", "Samir Aziz", "Dalia Rashid",
  // Additional mixed
  "Preston Walsh", "Georgia Buchanan", "Weston Reid", "Molly Sinclair", "Silas Lambert",
  "Ruby McDaniel", "August Chapman", "Nora Barrett", "Felix Abbott", "Clara Whitmore",
  "Bodhi Tran", "Willa Duarte", "Atlas Kowal", "Juno Mercer", "Rhett Callahan",
  "Ezra Holloway", "Iris Baldwin", "Theo Whitaker", "Mila Donovan", "Cole Prescott",
  "Eva Stratton", "Beau Hendricks", "Harper Vaughn", "Sage Riddle", "Violet McKenzie",
  "Kai Sutton", "Reese Blanco", "Nico Espinoza", "Juniper Ashby", "Hayden Cortez",
  "Emery Langston", "Soren Ellison", "Wren Tatum", "Gideon Alvarez", "Marlowe Sexton",
];

function getPlayerName(index: number): string {
  // PLAYER_NAMES holds 200 unique names — one per player per pool. If the
  // seeder is ever configured to want more than 200 players, the caller
  // will need to extend the array; we no longer synthesize placeholder names.
  if (index >= PLAYER_NAMES.length) {
    throw new Error(
      `getPlayerName(${index}) exceeds PLAYER_NAMES length (${PLAYER_NAMES.length}). ` +
      `Either extend PLAYER_NAMES or lower DEMO_PLAYERS_PER_POOL.`
    );
  }
  return PLAYER_NAMES[index];
}

// Strip all non-alphanumeric characters from the name to derive an email
// local-part. This handles apostrophes ("Liam O'Connor"), hyphens ("Min-Jun
// Park"), or anything else that could otherwise produce an invalid or
// awkward email address.
function nameToEmail(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "") + "@demo.example.com";
}

function randomResult(rng: () => number): "home" | "draw" | "away" {
  const r = rng();
  return r < 0.4 ? "home" : r < 0.7 ? "draw" : "away";
}

function randomKOResult(rng: () => number): "home" | "away" {
  return rng() > 0.5 ? "home" : "away";
}

function randomScore(rng: () => number, result: "home" | "draw" | "away"): [number, number] {
  if (result === "draw") { const s = Math.floor(rng() * 3); return [s, s]; }
  const w = 1 + Math.floor(rng() * 3), l = Math.floor(rng() * w);
  return result === "home" ? [w, l] : [l, w];
}

function randomKOScore(rng: () => number, result: "home" | "away"): [number, number] {
  const w = 1 + Math.floor(rng() * 3), l = Math.floor(rng() * w);
  return result === "home" ? [w, l] : [l, w];
}

/** Insert rows in chunks of BATCH_SIZE. Returns total inserted. */
async function insertInBatches<T>(table: string, rows: T[]): Promise<number> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    await withRetry(`Insert batch (${table}, ${slice.length} rows)`, async () => {
      const { error } = await supabase.from(table).insert(slice);
      if (error) throw new Error(error.message);
    });
  }
  return rows.length;
}

// ---- Cleanup ----
async function cleanupDemoPools() {
  console.log("🧹 Cleaning existing demo pools...");

  const demoSlugs = ["demo-pre-tournament", "demo-group-phase", "demo-knockout-picking", "demo-knockout-phase"];
  const { data: existingDemos } = await supabase
    .from("pools").select("id, slug")
    .or(`is_demo.eq.true,slug.in.(${demoSlugs.join(",")})`);

  for (const pool of existingDemos ?? []) {
    // Delete in dependency order. Picks → pick_sets → memberships → pool.
    // Tournament data (teams/groups/matches) is also pool-scoped for demos.
    const { data: pickSets } = await supabase.from("pick_sets").select("id").eq("pool_id", pool.id);
    const pickSetIds = (pickSets ?? []).map((p) => p.id);
    if (pickSetIds.length > 0) {
      await supabase.from("group_picks").delete().in("pick_set_id", pickSetIds);
      await supabase.from("knockout_picks").delete().in("pick_set_id", pickSetIds);
      await supabase.from("pick_sets").delete().in("id", pickSetIds);
    }
    await supabase.from("pool_memberships").delete().eq("pool_id", pool.id);
    await supabase.from("scoring_config").delete().eq("pool_id", pool.id);
    await supabase.from("matches").delete().eq("pool_id", pool.id);
    await supabase.from("teams").delete().eq("pool_id", pool.id);
    await supabase.from("groups").delete().eq("pool_id", pool.id);
    await supabase.from("pools").delete().eq("id", pool.id);
    console.log(`  🗑️  ${pool.slug}`);
  }
}

// ---- Copy global tournament data into a pool-scoped copy ----
async function copyTournamentData(poolId: string) {
  const [{ data: gGroups }, { data: gTeams }, { data: gMatches }] = await Promise.all([
    supabase.from("groups").select("*").is("pool_id", null),
    supabase.from("teams").select("*").is("pool_id", null),
    supabase.from("matches").select("*").is("pool_id", null),
  ]);

  if (!gGroups || !gTeams || !gMatches) throw new Error("Missing global tournament data");

  const groupIdMap = new Map<string, string>();
  for (const g of gGroups) {
    const { data } = await supabase.from("groups").insert({ tournament_id: TOURNAMENT_ID, pool_id: poolId, name: g.name, letter: g.letter }).select("id").single();
    if (data) groupIdMap.set(g.id, data.id);
  }

  const teamIdMap = new Map<string, string>();
  for (const t of gTeams) {
    const { data } = await supabase.from("teams").insert({
      tournament_id: TOURNAMENT_ID, pool_id: poolId, name: t.name, short_code: t.short_code,
      flag_code: t.flag_code, group_id: t.group_id ? groupIdMap.get(t.group_id) : null,
    }).select("id").single();
    if (data) teamIdMap.set(t.id, data.id);
  }

  const groupMatches: any[] = [], knockoutMatches: any[] = [];
  const matchNumberToId = new Map<number, string>();

  for (const m of gMatches) {
    const { data } = await supabase.from("matches").insert({
      tournament_id: TOURNAMENT_ID, pool_id: poolId, phase: m.phase,
      group_id: m.group_id ? groupIdMap.get(m.group_id) : null, match_number: m.match_number,
      home_team_id: m.home_team_id ? teamIdMap.get(m.home_team_id) : null,
      away_team_id: m.away_team_id ? teamIdMap.get(m.away_team_id) : null,
      scheduled_at: m.scheduled_at, status: "scheduled", label: m.label,
    }).select().single();
    if (data) {
      if (m.phase === "group") groupMatches.push(data);
      else knockoutMatches.push(data);
      if (data.match_number) matchNumberToId.set(data.match_number, data.id);
    }
  }

  console.log(`  ✅ ${groupIdMap.size} groups, ${teamIdMap.size} teams, ${groupMatches.length + knockoutMatches.length} matches`);
  return { groupIdMap, teamIdMap, groupMatches, knockoutMatches, matchNumberToId };
}

// ---- Create admin ----
async function createAdmin(poolId: string) {
  const email = "admin@demo.example.com";
  const { data } = await supabase.from("participants")
    .upsert({ email, display_name: "Pool Admin" }, { onConflict: "email" }).select("id").single();
  if (data) {
    await supabase.from("pool_memberships").upsert(
      { pool_id: poolId, participant_id: data.id, role: "admin", is_approved: true, is_active: true },
      { onConflict: "pool_id,participant_id" }
    );
  }
  console.log(`  ✅ Admin: admin@demo.example.com`);
}

// ---- Create players (batched) ----
// Upserts participants first (may already exist from a previous pool's seeding),
// then creates pool_memberships. Batches both.
async function createPlayers(poolId: string, count: number, startIndex: number = 0) {
  // Build the target list up front so we can keep the order stable.
  const targets = Array.from({ length: count }, (_, i) => {
    const name = getPlayerName(startIndex + i);
    return { name, email: nameToEmail(name) };
  });

  // Upsert participants in batches. Supabase's upsert returns the affected rows
  // so we can collect IDs without a separate SELECT.
  const participants: { id: string; email: string; displayName: string }[] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const slice = targets.slice(i, i + BATCH_SIZE);
    const data = await withRetry(
      `Upsert participants (${slice.length} rows)`,
      async () => {
        const { data, error } = await supabase
          .from("participants")
          .upsert(
            slice.map((t) => ({ email: t.email, display_name: t.name })),
            { onConflict: "email" }
          )
          .select("id, email, display_name");
        if (error) throw new Error(error.message);
        return data;
      }
    );

    // Preserve input order — Supabase may return rows in a different order.
    const byEmail = new Map((data ?? []).map((r) => [r.email, r]));
    for (const t of slice) {
      const row = byEmail.get(t.email);
      if (row) {
        participants.push({ id: row.id, email: t.email, displayName: t.name });
      }
    }
  }

  // Create memberships in batches.
  const memberships = participants.map((p) => ({
    pool_id: poolId,
    participant_id: p.id,
    role: "player",
    is_approved: true,
    is_active: true,
  }));
  for (let i = 0; i < memberships.length; i += BATCH_SIZE) {
    const slice = memberships.slice(i, i + BATCH_SIZE);
    await withRetry(`Upsert memberships (${slice.length} rows)`, async () => {
      const { error } = await supabase
        .from("pool_memberships")
        .upsert(slice, { onConflict: "pool_id,participant_id" });
      if (error) throw new Error(error.message);
    });
  }

  console.log(`  ✅ ${participants.length} players`);
  return participants;
}

// ---- Create pick sets (batched) ----
// Takes an array of (participantId, name) and returns the created IDs in input
// order. Uses batch insert + follow-up select since .insert().select() only
// returns the newly inserted rows.
async function createPickSetsBatch(
  poolId: string,
  entries: { participantId: string; name: string }[]
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const slice = entries.slice(i, i + BATCH_SIZE);
    const data = await withRetry(
      `Insert pick_sets (${slice.length} rows)`,
      async () => {
        const { data, error } = await supabase
          .from("pick_sets")
          .insert(
            slice.map((e) => ({
              pool_id: poolId,
              participant_id: e.participantId,
              name: e.name,
            }))
          )
          .select("id");
        if (error) throw new Error(error.message);
        return data;
      }
    );
    for (const row of data ?? []) ids.push(row.id);
  }
  return ids;
}

/**
 * Given a list of players and the desired pick-set distribution, return a
 * flat list of (participantId, name, playerIndex) entries. The playerIndex
 * is preserved so downstream code can decide which players get which kinds
 * of picks.
 */
function planPickSets(
  players: { id: string; displayName: string }[],
  multiSetPlayerCount: number,
  multiSetCount: number
): { participantId: string; name: string; playerIndex: number; setIndex: number }[] {
  const out: ReturnType<typeof planPickSets> = [];
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const count = i < multiSetPlayerCount ? multiSetCount : 1;
    for (let ps = 0; ps < count; ps++) {
      const name = count > 1 ? `${p.displayName} ${ps + 1}` : p.displayName;
      out.push({
        participantId: p.id,
        name,
        playerIndex: i,
        setIndex: ps,
      });
    }
  }
  return out;
}

// ---- Create group picks (batched, non-blocking per pick set) ----
// Returns number of picks inserted.
async function createGroupPicks(pickSetId: string, groupMatches: any[], pickCount: number, rng: () => number) {
  const shuffled = [...groupMatches].sort(() => rng() - 0.5);
  const toPick = shuffled.slice(0, pickCount);
  const rows = toPick.map((m) => ({ pick_set_id: pickSetId, match_id: m.id, pick: randomResult(rng) }));
  await insertInBatches("group_picks", rows);
  return rows.length;
}

// ---- Simulate group results ----
async function simulateGroupResults(groupMatches: any[], fraction: number, rng: () => number) {
  const count = Math.floor(groupMatches.length * fraction);
  const shuffled = [...groupMatches].sort(() => rng() - 0.5);
  for (let i = 0; i < count; i++) {
    const result = randomResult(rng);
    const [hs, as] = randomScore(rng, result);
    await supabase.from("matches").update({ result, home_score: hs, away_score: as, status: "completed" }).eq("id", shuffled[i].id);
  }
  console.log(`  ✅ ${count}/${groupMatches.length} group matches completed`);
  return shuffled.slice(0, count);
}

// ---- Recalculate group is_correct ----
async function recalcGroupPicks(completedMatches: any[]) {
  for (const m of completedMatches) {
    const { data } = await supabase.from("matches").select("result").eq("id", m.id).single();
    if (data?.result) {
      await supabase.from("group_picks").update({ is_correct: true }).eq("match_id", m.id).eq("pick", data.result);
      await supabase.from("group_picks").update({ is_correct: false }).eq("match_id", m.id).neq("pick", data.result);
    }
  }
  console.log(`  ✅ Group is_correct recalculated`);
}

// ---- Set up knockout bracket (assign teams to R32) ----
async function setupKnockoutBracket(knockoutMatches: any[], teamIdMap: Map<string, string>, rng: () => number) {
  const qualifiers = [...teamIdMap.values()].sort(() => rng() - 0.5).slice(0, 32);
  const r32 = knockoutMatches.filter((m) => m.phase === "r32").sort((a: any, b: any) => a.match_number - b.match_number);
  for (let i = 0; i < r32.length; i++) {
    const home = qualifiers[i * 2], away = qualifiers[i * 2 + 1];
    if (home && away) await supabase.from("matches").update({ home_team_id: home, away_team_id: away }).eq("id", r32[i].id);
  }
  console.log(`  ✅ 32 teams placed in R32 bracket`);
}

// ---- Create cascading knockout picks for a pick set ----
async function createCascadingKnockoutPicks(
  pickSetId: string,
  knockoutMatches: any[],
  matchNumberToId: Map<number, string>,
  roundsToPick: number,
  rng: () => number,
  r32TeamsByMatchId: Map<string, { home_team_id: string | null; away_team_id: string | null }>
) {
  const matchByNumber = new Map<number, any>();
  for (const m of knockoutMatches) {
    if (m.match_number) matchByNumber.set(m.match_number, m);
  }

  const pickedWinners = new Map<number, string>();
  const pickRows: { pick_set_id: string; match_id: string; picked_team_id: string }[] = [];

  const roundOrder = [
    [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88],
    [89, 90, 91, 92, 93, 94, 95, 96],
    [97, 98, 99, 100],
    [101, 102],
    [103],
    [104],
  ];

  for (let roundIdx = 0; roundIdx < Math.min(roundsToPick, roundOrder.length); roundIdx++) {
    for (const mn of roundOrder[roundIdx]) {
      const match = matchByNumber.get(mn);
      if (!match) continue;

      let homeTeamId: string | null = null;
      let awayTeamId: string | null = null;

      const feeders = BRACKET_FEEDERS[mn];
      if (!feeders) {
	    // R32: as before
	    const assigned = r32TeamsByMatchId.get(match.id);
	    homeTeamId = assigned?.home_team_id ?? null;
	    awayTeamId = assigned?.away_team_id ?? null;
      } else if (mn === 104) {
	    // Consolation: home from loser of SF1, away from loser of SF2.
	    // pickedWinners holds each match's PICKED winner; the loser is
	    // whichever feeder team isn't that picked winner.
	    const sf1 = matchByNumber.get(101);
	    const sf2 = matchByNumber.get(102);
	    const sf1Winner = pickedWinners.get(101);
	    const sf2Winner = pickedWinners.get(102);
	    if (sf1 && sf1Winner) {
		  homeTeamId = sf1.home_team_id === sf1Winner ? sf1.away_team_id : sf1.home_team_id;
	    }
	    if (sf2 && sf2Winner) {
		  awayTeamId = sf2.home_team_id === sf2Winner ? sf2.away_team_id : sf2.home_team_id;
	    }
      } else {
	    homeTeamId = pickedWinners.get(feeders[0]) ?? null;
	    awayTeamId = pickedWinners.get(feeders[1]) ?? null;
      }

      if (!homeTeamId || !awayTeamId) continue;

      const winner = rng() > 0.5 ? homeTeamId : awayTeamId;
      pickedWinners.set(mn, winner);

      pickRows.push({ pick_set_id: pickSetId, match_id: match.id, picked_team_id: winner });
    }
  }

  await insertInBatches("knockout_picks", pickRows);
  return pickRows.length;
}

/**
 * Pre-fetch R32 team assignments so createCascadingKnockoutPicks doesn't hit
 * the DB once per match per pick set (that's 16 queries × 250 pick sets =
 * 4,000 round trips). Called once per pool.
 */
async function fetchR32TeamAssignments(
  knockoutMatches: any[]
): Promise<Map<string, { home_team_id: string | null; away_team_id: string | null }>> {
  const r32 = knockoutMatches.filter((m) => m.phase === "r32");
  const ids = r32.map((m) => m.id);
  const { data } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id")
    .in("id", ids);
  const map = new Map<
    string,
    { home_team_id: string | null; away_team_id: string | null }
  >();
  for (const row of data ?? []) {
    map.set(row.id, {
      home_team_id: row.home_team_id,
      away_team_id: row.away_team_id,
    });
  }
  return map;
}

// ---- Complete R32 and advance winners to R16 ----
async function completeR32AndAdvance(knockoutMatches: any[], rng: () => number) {
  const r32 = knockoutMatches.filter((m) => m.phase === "r32").sort((a: any, b: any) => a.match_number - b.match_number);
  const r16 = knockoutMatches.filter((m) => m.phase === "r16").sort((a: any, b: any) => a.match_number - b.match_number);

  for (const m of r32) {
    const { data } = await supabase.from("matches").select("home_team_id, away_team_id").eq("id", m.id).single();
    if (!data?.home_team_id || !data?.away_team_id) continue;
    const result = randomKOResult(rng);
    const [hs, as] = randomKOScore(rng, result);
    await supabase.from("matches").update({ result, home_score: hs, away_score: as, status: "completed" }).eq("id", m.id);
  }
  console.log(`  ✅ All R32 completed`);

  for (let i = 0; i < r16.length; i++) {
    const m1 = r32[i * 2], m2 = r32[i * 2 + 1];
    if (!m1 || !m2) continue;
    const { data: d1 } = await supabase.from("matches").select("result, home_team_id, away_team_id").eq("id", m1.id).single();
    const { data: d2 } = await supabase.from("matches").select("result, home_team_id, away_team_id").eq("id", m2.id).single();
    const w1 = d1?.result === "home" ? d1.home_team_id : d1?.away_team_id;
    const w2 = d2?.result === "home" ? d2.home_team_id : d2?.away_team_id;
    if (w1 && w2) await supabase.from("matches").update({ home_team_id: w1, away_team_id: w2 }).eq("id", r16[i].id);
  }
  console.log(`  ✅ Winners advanced to R16`);
}

// ---- Complete partial R16 ----
async function completePartialR16(knockoutMatches: any[], rng: () => number) {
  const r16 = knockoutMatches.filter((m) => m.phase === "r16").sort((a: any, b: any) => a.match_number - b.match_number);
  const count = Math.floor(r16.length / 2);
  for (let i = 0; i < count; i++) {
    const { data } = await supabase.from("matches").select("home_team_id, away_team_id").eq("id", r16[i].id).single();
    if (!data?.home_team_id || !data?.away_team_id) continue;
    const result = randomKOResult(rng);
    const [hs, as] = randomKOScore(rng, result);
    await supabase.from("matches").update({ result, home_score: hs, away_score: as, status: "completed" }).eq("id", r16[i].id);
  }
  console.log(`  ✅ ${count}/${r16.length} R16 completed`);
}

// ---- Recalculate knockout is_correct ----
async function recalcKnockoutPicks(knockoutMatches: any[]) {
  for (const m of knockoutMatches) {
    const { data } = await supabase.from("matches").select("result, home_team_id, away_team_id, status").eq("id", m.id).single();
    if (data?.status !== "completed" || !data.result) continue;
    const winner = data.result === "home" ? data.home_team_id : data.away_team_id;
    await supabase.from("knockout_picks").update({ is_correct: true }).eq("match_id", m.id).eq("picked_team_id", winner);
    await supabase.from("knockout_picks").update({ is_correct: false }).eq("match_id", m.id).neq("picked_team_id", winner);
  }
  console.log(`  ✅ Knockout is_correct recalculated`);
}

// ---- Create pool ----
async function createDemoPool(name: string, slug: string, opts: { groupLock?: string; knockoutOpen?: string; knockoutLock?: string }) {
  const { data: pool, error } = await supabase.from("pools").insert({
    name, slug, tournament_id: TOURNAMENT_ID, max_pick_sets_per_player: 5,
    is_demo: true, is_active: true,
    group_lock_at: opts.groupLock ?? null, knockout_open_at: opts.knockoutOpen ?? null, knockout_lock_at: opts.knockoutLock ?? null,
  }).select().single();
  if (error || !pool) { console.error(`  ❌ ${error?.message}`); return null; }
  await supabase.rpc("initialize_pool_scoring", { p_pool_id: pool.id });
  return pool;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log(`\n🏆 World Cup Pick'em — Demo Pool Seeder`);
  console.log(`   Target: ${DEMO_PLAYERS_PER_POOL} players/pool, ~${DEMO_MULTI_SET_PLAYERS * DEMO_MULTI_SET_COUNT + (DEMO_PLAYERS_PER_POOL - DEMO_MULTI_SET_PLAYERS)} pick sets/pool\n`);
  await cleanupDemoPools();

  // ========================================================================
  // POOL 1: Group Stage Picking — varied group pick progress, picks open
  // ========================================================================
  console.log("🌱 Pool 1: Group Stage Picking");
  const rng1 = seededRandom(10);
  const pool1 = await createDemoPool("Demo 1 — Group Stage Picking", "demo-pre-tournament", {});
  if (pool1) {
    const { groupMatches } = await copyTournamentData(pool1.id);
    await createAdmin(pool1.id);
    const players1 = await createPlayers(pool1.id, DEMO_PLAYERS_PER_POOL);

    // Plan + create pick sets in one batch
    const plan1 = planPickSets(players1, DEMO_MULTI_SET_PLAYERS, DEMO_MULTI_SET_COUNT);
    const psIds1 = await createPickSetsBatch(pool1.id, plan1);

    // Resolve the index of the featured demo player (Heather Collins) so
    // we can override her three pick sets with a deterministic 72/35/0
    // progression. If she isn't found (or isn't a multi-set player), the
    // override is silently skipped and Pool 1 falls back to thirds.
    const featuredPlayerIndex = players1.findIndex(
      (p) => p.displayName === POOL1_FEATURED_PLAYER_NAME
    );

    // Distribute pick progress by player index (matches the old behavior's
    // thirds). Players with multiple sets get the same treatment for all sets.
    const thirdCutoff = Math.floor(players1.length / 3);
    const twoThirdsCutoff = Math.floor((players1.length * 2) / 3);
    let fullCount = 0, partialCount = 0, emptyCount = 0;

    for (let i = 0; i < plan1.length; i++) {
      const psId = psIds1[i];
      const pi = plan1[i].playerIndex;
      const si = plan1[i].setIndex;

      // Featured-player override: Heather Collins's three sets get an
      // explicit 72/35/0 pick distribution so the landing-page "View as
      // Player" demo lands on a player with one full, one partial, and one
      // empty pick set. We still tally each set into the matching
      // full/partial/empty counter so the summary log line stays accurate.
      if (
        featuredPlayerIndex !== -1 &&
        pi === featuredPlayerIndex &&
        si < POOL1_FEATURED_PICK_COUNTS.length
      ) {
        const count = POOL1_FEATURED_PICK_COUNTS[si];
        if (count > 0) await createGroupPicks(psId, groupMatches, count, rng1);
        if (count >= 72) fullCount++;
        else if (count <= 0) emptyCount++;
        else partialCount++;
        continue;
      }

      if (pi < thirdCutoff) {
        await createGroupPicks(psId, groupMatches, 72, rng1);
        fullCount++;
      } else if (pi < twoThirdsCutoff) {
        const count = 10 + Math.floor(rng1() * 51);
        await createGroupPicks(psId, groupMatches, count, rng1);
        partialCount++;
      } else {
        emptyCount++;
      }
    }
    console.log(`  ✅ ${psIds1.length} pick sets (${fullCount} full, ${partialCount} partial, ${emptyCount} empty)`);
    console.log(`  🏁 Done: /demo-pre-tournament\n`);
  }

  // ========================================================================
  // POOL 2: Group Phase in Progress
  // ========================================================================
  console.log("🌱 Pool 2: Group Phase in Progress");
  const rng2 = seededRandom(42);
  const pool2 = await createDemoPool("Demo 2 — Group Stage in Progress", "demo-group-phase", { groupLock: "2025-06-10T00:00:00Z" });
  if (pool2) {
    const { groupMatches } = await copyTournamentData(pool2.id);
    await createAdmin(pool2.id);
    const players2 = await createPlayers(pool2.id, DEMO_PLAYERS_PER_POOL);

    const plan2 = planPickSets(players2, DEMO_MULTI_SET_PLAYERS, DEMO_MULTI_SET_COUNT);
    const psIds2 = await createPickSetsBatch(pool2.id, plan2);

    for (const psId of psIds2) {
      await createGroupPicks(psId, groupMatches, 72, rng2);
    }
    console.log(`  ✅ ${psIds2.length} pick sets with full group picks`);

    const completed2 = await simulateGroupResults(groupMatches, 0.5, rng2);
    await recalcGroupPicks(completed2);
    console.log(`  🏁 Done: /demo-group-phase\n`);
  }

  // ========================================================================
  // POOL 3: Knockout Picking — bracket set, KO picks open, varied progress
  // ========================================================================
  console.log("🌱 Pool 3: Knockout Picking Phase");
  const rng3 = seededRandom(77);
  const pool3 = await createDemoPool("Demo 3 — Knockout Bracket Picking", "demo-knockout-picking",
    { groupLock: "2025-06-10T00:00:00Z", knockoutOpen: "2025-07-01T00:00:00Z" });
  if (pool3) {
    const { groupMatches, knockoutMatches, teamIdMap, matchNumberToId } = await copyTournamentData(pool3.id);
    await createAdmin(pool3.id);
    const players3 = await createPlayers(pool3.id, DEMO_PLAYERS_PER_POOL);

    const plan3 = planPickSets(players3, DEMO_MULTI_SET_PLAYERS, DEMO_MULTI_SET_COUNT);
    const psIds3 = await createPickSetsBatch(pool3.id, plan3);

    for (const psId of psIds3) {
      await createGroupPicks(psId, groupMatches, 72, rng3);
    }
    console.log(`  ✅ ${psIds3.length} pick sets with group picks`);

    const completed3 = await simulateGroupResults(groupMatches, 1.0, rng3);
    await recalcGroupPicks(completed3);
    await setupKnockoutBracket(knockoutMatches, teamIdMap, rng3);

    const r32Assignments3 = await fetchR32TeamAssignments(knockoutMatches);

    // KO picks distribution: first N% full, next N% partial, rest none
    const koFullEnd = Math.floor(psIds3.length * POOL3_KO_FULL_FRACTION);
    const koPartialEnd = koFullEnd + Math.floor(psIds3.length * POOL3_KO_PARTIAL_FRACTION);
    let full = 0, partial = 0, none = 0;

    for (let i = 0; i < psIds3.length; i++) {
      if (i < koFullEnd) {
        await createCascadingKnockoutPicks(psIds3[i], knockoutMatches, matchNumberToId, 5, rng3, r32Assignments3);
        full++;
      } else if (i < koPartialEnd) {
        const rounds = 1 + Math.floor(rng3() * 3);
        await createCascadingKnockoutPicks(psIds3[i], knockoutMatches, matchNumberToId, rounds, rng3, r32Assignments3);
        partial++;
      } else {
        none++;
      }
    }
    console.log(`  ✅ KO picks: ${full} full, ${partial} partial, ${none} none`);
    console.log(`  🏁 Done: /demo-knockout-picking\n`);
  }

  // ========================================================================
  // POOL 4: Knockout Phase in Progress
  // ========================================================================
  console.log("🌱 Pool 4: Knockout Phase in Progress");
  const rng4 = seededRandom(123);
  const pool4 = await createDemoPool("Demo 4 — Knockout Phase in Progress", "demo-knockout-phase",
    { groupLock: "2025-06-10T00:00:00Z", knockoutOpen: "2025-07-01T00:00:00Z", knockoutLock: "2025-07-05T00:00:00Z" });
  if (pool4) {
    const { groupMatches, knockoutMatches, teamIdMap, matchNumberToId } = await copyTournamentData(pool4.id);
    await createAdmin(pool4.id);
    const players4 = await createPlayers(pool4.id, DEMO_PLAYERS_PER_POOL);

    const plan4 = planPickSets(players4, DEMO_MULTI_SET_PLAYERS, DEMO_MULTI_SET_COUNT);
    const psIds4 = await createPickSetsBatch(pool4.id, plan4);

    for (const psId of psIds4) {
      await createGroupPicks(psId, groupMatches, 72, rng4);
    }
    console.log(`  ✅ ${psIds4.length} pick sets with group picks`);

    const completedGroup4 = await simulateGroupResults(groupMatches, 1.0, rng4);
    await recalcGroupPicks(completedGroup4);
    await setupKnockoutBracket(knockoutMatches, teamIdMap, rng4);

    const r32Assignments4 = await fetchR32TeamAssignments(knockoutMatches);

    // All pick sets get full cascading KO picks before matches are played
    for (const psId of psIds4) {
      await createCascadingKnockoutPicks(psId, knockoutMatches, matchNumberToId, 5, rng4, r32Assignments4);
    }
    console.log(`  ✅ All ${psIds4.length} pick sets have full knockout brackets`);

    await completeR32AndAdvance(knockoutMatches, rng4);
    await completePartialR16(knockoutMatches, rng4);
    await recalcKnockoutPicks(knockoutMatches);
    console.log(`  🏁 Done: /demo-knockout-phase\n`);
  }

  console.log("🎉 All 4 demo pools seeded!\n");
  console.log("   /demo-pre-tournament        — Make picks (mikejones@demo.example.com)");
  console.log("   /demo-group-phase           — Group stage in progress");
  console.log("   /demo-knockout-picking      — Fill out knockout bracket");
  console.log("   /demo-knockout-phase        — Knockout round underway");
  console.log("   Admin for all pools: admin@demo.example.com\n");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
