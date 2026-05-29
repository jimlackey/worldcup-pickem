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
import { TEAM_FIFA_RANKS } from "./tournament-data";

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

// ----------------------------------------------------------------------------
// 3rd Place Consolation candidate teams (migration 024).
// ----------------------------------------------------------------------------
// All four demo pools have consolation_mode = 'preseason_pick' enabled, so
// half of each pool's pick sets get a 3rd-place pick during seeding to make
// the standings/about/payments pages look populated. The remaining half are
// left with no pick so the "Not yet" indicator and "—" placeholder also
// have realistic representation.
//
// We pick from this curated list of historically strong sides rather than
// randomising across all 48 teams. The output reads more believably ("most
// players are betting on Brazil or Argentina") and exercises the team
// flag rendering for some of the more recognisable codes.
//
// Names must match the canonical team.name values in the tournament
// seed data (see scripts/tournament-data.ts) so the lookup at seed time
// finds the matching rows in the pool's pool-scoped teams table.
const THIRD_PLACE_CANDIDATES = [
  "France",
  "Spain",
  "Argentina",
  "England",
  "Portugal",
  "Brazil",
  "Netherlands",
  "Morocco",
  "Belgium",
  "Germany",
  "United States",
] as const;

// ---- Seeded random ----
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ============================================================================
// Deterministic per-pick "decision" stream  (carry-forward across pools)
// ============================================================================
// The four demo pools each represent the SAME players progressing through the
// tournament: a player who picked Ghana over England in demo-pre-tournament
// should still hold that pick in demo-group-phase, demo-knockout-picking and
// demo-knockout-phase. The later pools then BUILD ON those picks (knockout
// rounds layered on top of identical group picks).
//
// To get that for free we stop drawing picks from each pool's shared RNG
// stream (which is order-dependent and therefore differs pool-to-pool) and
// instead derive every individual decision from a stable hash of:
//
//     (player email, pick-set index, "kind", match number)
//
// None of those inputs depend on the pool, so the same matchup yields the
// same uniform [0,1) "roll" in every pool. We compare that roll against
// rank-weighted thresholds (below) to land on home / draw / away (group) or
// home / away (knockout). Identical inputs + identical thresholds ⇒ identical
// pick in every pool. Carry-forward is thus a property of the math, not of
// any copy step.
//
// FNV-1a (32-bit) over the joined key, normalised to [0,1). Cheap, stable,
// and good enough for spreading demo picks; this is not security-sensitive.
function hashRoll(...parts: (string | number)[]): number {
  const str = parts.join("\u0001");
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return (h >>> 0) / 0xffffffff;
}

// Teams not present in TEAM_FIFA_RANKS (shouldn't happen for the 48-team
// field) fall back to a middling rank so the weighting math stays defined.
const FALLBACK_RANK = 50;

function rankOf(teamName: string | null | undefined): number {
  if (!teamName) return FALLBACK_RANK;
  return TEAM_FIFA_RANKS[teamName] ?? FALLBACK_RANK;
}

// ----------------------------------------------------------------------------
// Rank → pick-share model.
//
// We convert each side's FIFA rank into a "strength" score and let the gap in
// strength drive how lopsided the pick distribution is. The mapping is tuned
// so that:
//   • a small rank gap (evenly matched) stays close to a 3-way toss-up, and
//   • a large rank gap (e.g. England #4 vs Ghana #74) skews hard toward the
//     favourite — roughly 75% / 15% draw / 10% underdog in that example —
//     while never collapsing to 100/0 so genuine "upset" picks still appear.
//
// strength(rank) = 1 / rank^0.45 gives a gentle, diminishing-returns curve:
// the difference between #1 and #4 matters, but the difference between #60
// and #74 barely does (both clearly weak), which matches intuition.
function strength(rank: number): number {
  return 1 / Math.pow(rank, 0.45);
}

// Group-match weights → [pHome, pDraw, pAway]. The favourite's share grows
// with the strength gap; the draw share shrinks as the mismatch widens (a
// lopsided game is less likely to be called a draw); the underdog keeps a
// small but non-zero floor so upset picks remain in the mix.
function groupPickWeights(
  homeRank: number,
  awayRank: number
): [number, number, number] {
  const sh = strength(homeRank);
  const sa = strength(awayRank);
  // homeShare is the home team's share of the decisive (non-draw) mass;
  // 0.5 when evenly matched, >0.5 when home is stronger, <0.5 when away is.
  const homeShare = sh / (sh + sa);
  // Draw probability: ~30% for an even game, tapering toward ~12% as the
  // mismatch grows. The mismatch is symmetric in either direction.
  const mismatch = Math.abs(homeShare - 0.5) * 2; // 0 (even) .. 1 (max gap)
  const pDraw = 0.3 - 0.18 * mismatch; // 0.30 .. 0.12
  const decisive = 1 - pDraw;
  // Work in terms of the FAVOURITE's share (always ≥ 0.5) so the soften +
  // clamp can't accidentally erase the underdog's disadvantage, then map it
  // back onto whichever side is actually stronger. (A symmetric clamp on the
  // home share alone would flatten games where the AWAY team is the favourite
  // to a 50/50 split — e.g. Ghana-home vs England-away.)
  const favShare = Math.max(homeShare, 1 - homeShare); // ≥ 0.5
  // Soften slightly so even the biggest favourite leaves a real underdog
  // floor, and cap so picks never collapse to a certainty.
  const favSoft = 0.5 + (favShare - 0.5) * 1.28;
  const favClamped = Math.max(0.5, Math.min(0.86, favSoft));
  const homeIsFav = homeShare >= 0.5;
  const homeDecisiveShare = homeIsFav ? favClamped : 1 - favClamped;
  const pHome = decisive * homeDecisiveShare;
  const pAway = decisive * (1 - homeDecisiveShare);
  return [pHome, pDraw, pAway];
}

// Knockout-match weights → [pHome, pAway] (no draws in the bracket). Same
// strength model, with a firm upset floor (~12%) so the demo bracket always
// contains some lower-seed advancements rather than perfect chalk.
function knockoutPickWeights(homeRank: number, awayRank: number): [number, number] {
  const sh = strength(homeRank);
  const sa = strength(awayRank);
  const favShare = sh / (sh + sa);
  const favSoft = 0.5 + (favShare - 0.5) * 1.3;
  const favClamped = Math.max(0.5, Math.min(0.88, favSoft));
  // favClamped is the FAVOURITE's win share; assign it to whichever side is
  // actually the favourite.
  const homeIsFav = homeRank <= awayRank;
  const pHome = homeIsFav ? favClamped : 1 - favClamped;
  return [pHome, 1 - pHome];
}

// Resolve a group pick ("home" | "draw" | "away") deterministically from the
// rank-weighted distribution and a stable [0,1) roll.
function weightedGroupPick(
  roll: number,
  homeRank: number,
  awayRank: number
): "home" | "draw" | "away" {
  const [pHome, pDraw] = groupPickWeights(homeRank, awayRank);
  if (roll < pHome) return "home";
  if (roll < pHome + pDraw) return "draw";
  return "away";
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
      // Migration 024 — third_place_picks. The DB has ON DELETE CASCADE
      // from pick_sets so explicit deletion isn't strictly necessary,
      // but we follow the same defensive pattern as the picks tables
      // above so the cleanup stays robust to schema drift.
      await supabase.from("third_place_picks").delete().in("pick_set_id", pickSetIds);
      await supabase.from("pick_sets").delete().in("id", pickSetIds);
    }
    await supabase.from("pool_memberships").delete().eq("pool_id", pool.id);
    await supabase.from("pool_favorites").delete().eq("pool_id", pool.id);
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
  const teamNameById = new Map<string, string>();
  for (const t of gTeams) {
    const { data } = await supabase.from("teams").insert({
      tournament_id: TOURNAMENT_ID, pool_id: poolId, name: t.name, short_code: t.short_code,
      flag_code: t.flag_code, group_id: t.group_id ? groupIdMap.get(t.group_id) : null,
    }).select("id").single();
    if (data) {
      teamIdMap.set(t.id, data.id);
      teamNameById.set(data.id, t.name);
    }
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
  return { groupIdMap, teamIdMap, teamNameById, groupMatches, knockoutMatches, matchNumberToId };
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

// ---- Seed favorites for the featured demo player (Heather Collins) ----
//
// The favorites feature (migration 020 + 021) lets a logged-in pool
// member follow specific PICK SETS — not participants — on the
// Standings and What-If pages. Per product spec, the demo "View as
// Player" experience (which logs visitors in as Heather Collins) should
// land on a non-empty Favorites tab with exactly 10 rows.
//
// Selection (10 pick sets total):
//   - All 3 of Heather Collins's own pick sets ("Heather Collins 1",
//     "Heather Collins 2", "Heather Collins 3"). Since favorites are
//     per-pick-set, we add three separate rows for her.
//   - 7 random "other" pick sets drawn from anywhere in the rest of
//     the pool. Each row is one visible standings row, so 3 + 7 = 10.
//
// The 7 "others" are drawn deterministically via the pool's seeded RNG
// so each pool gets a different but reproducible mix. We DO include
// pick sets belonging to other multi-set players — there's no longer
// any row-math reason to restrict to single-set players (every favorite
// row maps to exactly one visible row regardless of how many other
// pick sets that participant has).
//
// Idempotent: the table's UNIQUE(pool_id, participant_id,
// favorite_pick_set_id) constraint means re-running the seeder upserts
// the same rows. cleanupDemoPools deletes the pool, which cascades and
// removes the favorite rows anyway, so this function only runs against
// a freshly-created pool. We use upsert with onConflict to be safe
// either way.
async function seedHeatherFavorites(
  poolId: string,
  players: { id: string; email: string; displayName: string }[],
  plan: { participantId: string; name: string; playerIndex: number; setIndex: number }[],
  psIds: string[],
  rng: () => number
) {
  const heather = players.find(
    (p) => p.displayName === POOL1_FEATURED_PLAYER_NAME
  );
  if (!heather) {
    // Featured player not in this pool — silently skip, same pattern as
    // the Pool 1 pick-progression override.
    return;
  }

  // Partition the plan into "Heather's pick sets" and "everyone else's".
  // `plan` and `psIds` are parallel arrays — plan[i] describes the pick
  // set whose id is psIds[i] — so the index i is the join key.
  const heatherPickSetIds: string[] = [];
  const otherPickSetIds: string[] = [];
  for (let i = 0; i < plan.length; i++) {
    if (plan[i].participantId === heather.id) {
      heatherPickSetIds.push(psIds[i]);
    } else {
      otherPickSetIds.push(psIds[i]);
    }
  }

  // Defensive: if Heather somehow doesn't have any pick sets, bail. (Can
  // only happen if planPickSets is changed in incompatible ways.)
  if (heatherPickSetIds.length === 0) return;

  // Fisher-Yates shuffle the "others" pool via the pool's seeded RNG so
  // each pool's selection is deterministic but distinct from the others.
  const shuffled = [...otherPickSetIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const others = shuffled.slice(0, Math.min(7, shuffled.length));

  // Build the rows. Heather's three pick sets + the seven others.
  const targetPickSetIds = [...heatherPickSetIds, ...others];
  const rows = targetPickSetIds.map((psId) => ({
    pool_id: poolId,
    participant_id: heather.id,
    favorite_pick_set_id: psId,
  }));

  await withRetry(`Seed Heather favorites (${rows.length} rows)`, async () => {
    const { error } = await supabase.from("pool_favorites").upsert(rows, {
      onConflict: "pool_id,participant_id,favorite_pick_set_id",
    });
    if (error) throw new Error(error.message);
  });

  console.log(
    `  ⭐ Heather follows ${rows.length} pick sets ` +
      `(${heatherPickSetIds.length} of her own + ${others.length} others)`
  );
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

// Build a pool-team-id → FIFA-rank map from the pool's id→name map. Used to
// weight picks by team strength. Unranked names fall back to FALLBACK_RANK.
function buildRankByTeamId(teamNameById: Map<string, string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, name] of teamNameById) m.set(id, rankOf(name));
  return m;
}

// ---- Create group picks (batched, non-blocking per pick set) ----
//
// Picks are now deterministic and pool-independent so they CARRY FORWARD
// across the four demo pools (a player's group picks are identical in
// demo-pre-tournament, demo-group-phase, demo-knockout-picking and
// demo-knockout-phase):
//
//   • WHICH matches a partial set has picked is chosen by ranking all 72
//     matches by a stable per-(player,set) hash and taking the first
//     `pickCount` — so growing `pickCount` only ever ADDS matches, never
//     reshuffles the earlier ones. A set with 35 picks in Pool 1 and the
//     "same" set fully picked in Pool 2 agree on those first 35.
//   • WHAT each pick is comes from weightedGroupPick(): a stable hash roll
//     compared against FIFA-rank-weighted home/draw/away thresholds. Same
//     matchup ⇒ same roll ⇒ same pick in every pool.
//
// `psKey` is the stable identity of the pick set (participant email + set
// index), NOT the pool-scoped pick_set UUID — that's what makes the output
// reproduce across pools. `rankByTeamId` maps this pool's team ids to FIFA
// ranks. The legacy `rng` parameter is retained for signature compatibility
// but no longer consumed for pick content.
async function createGroupPicks(
  pickSetId: string,
  groupMatches: any[],
  pickCount: number,
  _rng: () => number,
  psKey: string,
  rankByTeamId: Map<string, number>
) {
  // Deterministic match ordering for this pick set: sort by a stable hash of
  // (psKey, match_number). Independent of pool and of insertion order.
  const ordered = [...groupMatches].sort(
    (a, b) =>
      hashRoll(psKey, "gorder", a.match_number) -
      hashRoll(psKey, "gorder", b.match_number)
  );
  const toPick = ordered.slice(0, pickCount);

  const rows = toPick.map((m) => {
    const homeRank = rankByTeamId.get(m.home_team_id) ?? FALLBACK_RANK;
    const awayRank = rankByTeamId.get(m.away_team_id) ?? FALLBACK_RANK;
    const roll = hashRoll(psKey, "gpick", m.match_number);
    return {
      pick_set_id: pickSetId,
      match_id: m.id,
      pick: weightedGroupPick(roll, homeRank, awayRank),
    };
  });
  await insertInBatches("group_picks", rows);
  return rows.length;
}

// ----------------------------------------------------------------------------
// Seed Pre-Tournament 3rd Place picks for a pool.
//
// All demo pools have consolation_mode = 'preseason_pick' (see
// createDemoPool above). Per the seed spec, EXACTLY HALF of the pool's
// pick sets get a random 3rd-place pick from THIRD_PLACE_CANDIDATES; the
// other half are left without a row in third_place_picks so the "Not yet"
// indicator and "—" placeholder also have realistic representation on
// the standings/payments/about pages.
//
// The half-selection is deterministic given the rng seed: we pick the
// first floor(N/2) pick sets after a stable shuffle. Reseeding produces
// the same selection so demo screenshots stay reproducible.
//
// Returns the number of third_place_picks rows inserted (for logging).
async function seedThirdPlacePicks(
  poolId: string,
  pickSetIds: string[],
  rng: () => number
): Promise<number> {
  if (pickSetIds.length === 0) return 0;

  // Resolve the candidate team names → pool-scoped team ids. We query
  // the pool's own teams table (not the global one) because demo pools
  // get their own pool-scoped copy of teams in copyTournamentData. A
  // single .in() query with the eleven names is one indexed read.
  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name")
    .eq("pool_id", poolId)
    .in("name", THIRD_PLACE_CANDIDATES as readonly string[]);

  const teams = (teamRows ?? []) as { id: string; name: string }[];
  if (teams.length === 0) {
    // Shouldn't happen unless the candidate names drift from the
    // tournament seed data — warn rather than throw so a single
    // demo-data hiccup doesn't take down the whole seeder run.
    console.warn(
      `  ⚠️  No candidate teams found in pool ${poolId} for 3rd-place picks — skipping.`
    );
    return 0;
  }

  // Stable shuffle of pick set ids, then take the first half. Using
  // the same rng instance as the rest of the pool's seeding keeps
  // re-runs deterministic across the whole script.
  const shuffled = [...pickSetIds].sort(() => rng() - 0.5);
  const halfCount = Math.floor(shuffled.length / 2);
  const chosen = shuffled.slice(0, halfCount);

  // For each chosen pick set, draw a random team from the candidate
  // list. We don't try to balance the distribution across countries —
  // a slight bias toward whatever rng() lands on is fine and arguably
  // more believable than perfectly even bins.
  const rows = chosen.map((pickSetId) => {
    const team = teams[Math.floor(rng() * teams.length)];
    return {
      pick_set_id: pickSetId,
      picked_team_id: team.id,
      // is_correct stays NULL — the downstream scoring pipeline grades
      // these once the tournament resolves a 3rd-place finisher; for
      // demo data we leave it ungraded (matches the post-lock,
      // pre-tournament-finish state).
    };
  });

  await insertInBatches("third_place_picks", rows);
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
//
// Made DETERMINISTIC and pool-independent so the R32 field is identical in
// demo-knockout-picking and demo-knockout-phase — a prerequisite for
// knockout picks carrying forward between those two pools.
//
// Qualifier selection is also rank-aware: each team gets a score combining
// its FIFA strength with a stable per-team jitter, and the top 32 by score
// qualify. Stronger sides therefore almost always reach the bracket, but the
// jitter lets a few mid-table teams sneak in (and occasionally bumps a big
// name) so the field still looks plausibly noisy rather than pure chalk.
// Seeding into the 16 R32 slots is likewise by stable hash, so it's stable.
async function setupKnockoutBracket(
  knockoutMatches: any[],
  teamIdMap: Map<string, string>,
  _rng: () => number,
  teamNameById: Map<string, string>
) {
  const poolTeamIds = [...teamIdMap.values()];
  // Score every team: higher strength → higher score, plus ±jitter.
  const scored = poolTeamIds.map((id) => {
    const name = teamNameById.get(id) ?? "";
    const s = strength(rankOf(name)); // ~0.11 (#85) .. 1.0 (#1)
    const jitter = (hashRoll("r32qualify", name) - 0.5) * 0.35;
    return { id, score: s + jitter };
  });
  scored.sort((a, b) => b.score - a.score);
  const qualifiers = scored.slice(0, 32).map((x) => x.id);

  // Stable seeding into R32 slots: order qualifiers by a name-hash so the
  // home/away pairing is reproducible across pools.
  qualifiers.sort(
    (a, b) =>
      hashRoll("r32seed", teamNameById.get(a) ?? a) -
      hashRoll("r32seed", teamNameById.get(b) ?? b)
  );

  const r32 = knockoutMatches.filter((m) => m.phase === "r32").sort((a: any, b: any) => a.match_number - b.match_number);
  for (let i = 0; i < r32.length; i++) {
    const home = qualifiers[i * 2], away = qualifiers[i * 2 + 1];
    if (home && away) await supabase.from("matches").update({ home_team_id: home, away_team_id: away }).eq("id", r32[i].id);
  }
  console.log(`  ✅ 32 teams placed in R32 bracket`);
}

// ---- Create cascading knockout picks for a pick set ----
//
// Deterministic and pool-independent (same rationale as createGroupPicks):
// each match's winner is chosen by a stable hash roll keyed on
// (psKey, match_number) compared against FIFA-rank-weighted thresholds, with
// an upset floor so the demo bracket isn't pure chalk. Because the R32 field
// (setupKnockoutBracket) is now also deterministic, a player's full knockout
// bracket is identical in demo-knockout-picking and demo-knockout-phase, and
// builds directly on top of that player's (also carried-forward) group picks.
async function createCascadingKnockoutPicks(
  pickSetId: string,
  knockoutMatches: any[],
  matchNumberToId: Map<number, string>,
  roundsToPick: number,
  _rng: () => number,
  r32TeamsByMatchId: Map<string, { home_team_id: string | null; away_team_id: string | null }>,
  psKey: string,
  rankByTeamId: Map<string, number>
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

      // Rank-weighted, deterministic winner. The roll is stable per
      // (player+set, match_number) so it reproduces across pools.
      const homeRank = rankByTeamId.get(homeTeamId) ?? FALLBACK_RANK;
      const awayRank = rankByTeamId.get(awayTeamId) ?? FALLBACK_RANK;
      const [pHome] = knockoutPickWeights(homeRank, awayRank);
      const roll = hashRoll(psKey, "kpick", mn);
      const winner = roll < pHome ? homeTeamId : awayTeamId;
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
    // All demo pools showcase the Pre-Tournament 3rd Place Selection
    // feature (migration 024). The DB trigger keeps the legacy
    // consolation_match_enabled flag in sync — it'll be FALSE here
    // because the two features are mutually exclusive.
    consolation_mode: "preseason_pick",
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
    const { groupMatches, teamNameById } = await copyTournamentData(pool1.id);
    await createAdmin(pool1.id);
    const players1 = await createPlayers(pool1.id, DEMO_PLAYERS_PER_POOL);
    const rankById1 = buildRankByTeamId(teamNameById);

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
      const psKey = plan1[i].name;

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
        if (count > 0) await createGroupPicks(psId, groupMatches, count, rng1, psKey, rankById1);
        if (count >= 72) fullCount++;
        else if (count <= 0) emptyCount++;
        else partialCount++;
        continue;
      }

      if (pi < thirdCutoff) {
        await createGroupPicks(psId, groupMatches, 72, rng1, psKey, rankById1);
        fullCount++;
      } else if (pi < twoThirdsCutoff) {
        const count = 10 + Math.floor(rng1() * 51);
        await createGroupPicks(psId, groupMatches, count, rng1, psKey, rankById1);
        partialCount++;
      } else {
        emptyCount++;
      }
    }
    console.log(`  ✅ ${psIds1.length} pick sets (${fullCount} full, ${partialCount} partial, ${emptyCount} empty)`);
    const tp1 = await seedThirdPlacePicks(pool1.id, psIds1, rng1);
    console.log(`  ✅ ${tp1} 3rd-place picks seeded (target: half of ${psIds1.length})`);
    await seedHeatherFavorites(pool1.id, players1, plan1, psIds1, rng1);
    console.log(`  🏁 Done: /demo-pre-tournament\n`);
  }

  // ========================================================================
  // POOL 2: Group Phase in Progress
  // ========================================================================
  console.log("🌱 Pool 2: Group Phase in Progress");
  const rng2 = seededRandom(42);
  const pool2 = await createDemoPool("Demo 2 — Group Stage in Progress", "demo-group-phase", { groupLock: "2025-06-10T00:00:00Z" });
  if (pool2) {
    const { groupMatches, teamNameById } = await copyTournamentData(pool2.id);
    await createAdmin(pool2.id);
    const players2 = await createPlayers(pool2.id, DEMO_PLAYERS_PER_POOL);
    const rankById2 = buildRankByTeamId(teamNameById);

    const plan2 = planPickSets(players2, DEMO_MULTI_SET_PLAYERS, DEMO_MULTI_SET_COUNT);
    const psIds2 = await createPickSetsBatch(pool2.id, plan2);

    for (let i = 0; i < psIds2.length; i++) {
      await createGroupPicks(psIds2[i], groupMatches, 72, rng2, plan2[i].name, rankById2);
    }
    console.log(`  ✅ ${psIds2.length} pick sets with full group picks`);

    const completed2 = await simulateGroupResults(groupMatches, 0.5, rng2);
    await recalcGroupPicks(completed2);
    const tp2 = await seedThirdPlacePicks(pool2.id, psIds2, rng2);
    console.log(`  ✅ ${tp2} 3rd-place picks seeded (target: half of ${psIds2.length})`);
    await seedHeatherFavorites(pool2.id, players2, plan2, psIds2, rng2);
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
    const { groupMatches, knockoutMatches, teamIdMap, teamNameById, matchNumberToId } = await copyTournamentData(pool3.id);
    await createAdmin(pool3.id);
    const players3 = await createPlayers(pool3.id, DEMO_PLAYERS_PER_POOL);
    const rankById3 = buildRankByTeamId(teamNameById);

    const plan3 = planPickSets(players3, DEMO_MULTI_SET_PLAYERS, DEMO_MULTI_SET_COUNT);
    const psIds3 = await createPickSetsBatch(pool3.id, plan3);

    for (let i = 0; i < psIds3.length; i++) {
      await createGroupPicks(psIds3[i], groupMatches, 72, rng3, plan3[i].name, rankById3);
    }
    console.log(`  ✅ ${psIds3.length} pick sets with group picks`);

    const completed3 = await simulateGroupResults(groupMatches, 1.0, rng3);
    await recalcGroupPicks(completed3);
    await setupKnockoutBracket(knockoutMatches, teamIdMap, rng3, teamNameById);

    const r32Assignments3 = await fetchR32TeamAssignments(knockoutMatches);

    // KO picks distribution: first N% full, next N% partial, rest none
    const koFullEnd = Math.floor(psIds3.length * POOL3_KO_FULL_FRACTION);
    const koPartialEnd = koFullEnd + Math.floor(psIds3.length * POOL3_KO_PARTIAL_FRACTION);
    let full = 0, partial = 0, none = 0;

    for (let i = 0; i < psIds3.length; i++) {
      const psKey = plan3[i].name;
      if (i < koFullEnd) {
        await createCascadingKnockoutPicks(psIds3[i], knockoutMatches, matchNumberToId, 5, rng3, r32Assignments3, psKey, rankById3);
        full++;
      } else if (i < koPartialEnd) {
        const rounds = 1 + Math.floor(rng3() * 3);
        await createCascadingKnockoutPicks(psIds3[i], knockoutMatches, matchNumberToId, rounds, rng3, r32Assignments3, psKey, rankById3);
        partial++;
      } else {
        none++;
      }
    }
    console.log(`  ✅ KO picks: ${full} full, ${partial} partial, ${none} none`);
    const tp3 = await seedThirdPlacePicks(pool3.id, psIds3, rng3);
    console.log(`  ✅ ${tp3} 3rd-place picks seeded (target: half of ${psIds3.length})`);
    await seedHeatherFavorites(pool3.id, players3, plan3, psIds3, rng3);
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
    const { groupMatches, knockoutMatches, teamIdMap, teamNameById, matchNumberToId } = await copyTournamentData(pool4.id);
    await createAdmin(pool4.id);
    const players4 = await createPlayers(pool4.id, DEMO_PLAYERS_PER_POOL);
    const rankById4 = buildRankByTeamId(teamNameById);

    const plan4 = planPickSets(players4, DEMO_MULTI_SET_PLAYERS, DEMO_MULTI_SET_COUNT);
    const psIds4 = await createPickSetsBatch(pool4.id, plan4);

    for (let i = 0; i < psIds4.length; i++) {
      await createGroupPicks(psIds4[i], groupMatches, 72, rng4, plan4[i].name, rankById4);
    }
    console.log(`  ✅ ${psIds4.length} pick sets with group picks`);

    const completedGroup4 = await simulateGroupResults(groupMatches, 1.0, rng4);
    await recalcGroupPicks(completedGroup4);
    await setupKnockoutBracket(knockoutMatches, teamIdMap, rng4, teamNameById);

    const r32Assignments4 = await fetchR32TeamAssignments(knockoutMatches);

    // All pick sets get full cascading KO picks before matches are played
    for (let i = 0; i < psIds4.length; i++) {
      await createCascadingKnockoutPicks(psIds4[i], knockoutMatches, matchNumberToId, 5, rng4, r32Assignments4, plan4[i].name, rankById4);
    }
    console.log(`  ✅ All ${psIds4.length} pick sets have full knockout brackets`);

    await completeR32AndAdvance(knockoutMatches, rng4);
    await completePartialR16(knockoutMatches, rng4);
    await recalcKnockoutPicks(knockoutMatches);
    const tp4 = await seedThirdPlacePicks(pool4.id, psIds4, rng4);
    console.log(`  ✅ ${tp4} 3rd-place picks seeded (target: half of ${psIds4.length})`);
    await seedHeatherFavorites(pool4.id, players4, plan4, psIds4, rng4);
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
