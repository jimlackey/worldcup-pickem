/**
 * scripts/seed-demo.ts
 *
 * Seed four demo pools:
 *   1. demo-pre-tournament     — 15 users, varied pick progress, picks open
 *   2. demo-group-phase        — 50 users, group stage ~50% completed
 *   3. demo-knockout-picking   — 50 users, group done, bracket set, varied KO picks
 *   4. demo-knockout-phase     — 50 users, knockout underway
 *
 * Each pool gets admin@demo.example.com as a non-player admin.
 * A few users in each pool have 3 pick sets to demo multi-entry.
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
const PLAYER_NAMES = [
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
];

function getPlayerName(index: number): string {
  return PLAYER_NAMES[index % PLAYER_NAMES.length];
}

function nameToEmail(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "") + "@demo.example.com";
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

// ---- Cleanup ----
async function cleanupDemoPools() {
  console.log("🧹 Cleaning existing demo pools...");
  
  // Find all demo pools (by is_demo flag OR by known demo slugs as fallback)
  const demoSlugs = ["demo-pre-tournament", "demo-group-phase", "demo-knockout-picking", "demo-knockout-phase"];
  const { data: existingDemos } = await supabase
    .from("pools").select("id, slug")
    .or(`is_demo.eq.true,slug.in.(${demoSlugs.join(",")})`);

  for (const pool of existingDemos ?? []) {
    console.log(`  Deleting pool: ${pool.slug} (${pool.id})`);
    
    // Delete audit_log first — the append-only trigger blocks normal deletes
    try {
      await supabase.rpc('cleanup_demo_audit_log', { p_pool_id: pool.id });
    } catch {
      // Function might not exist yet, that's fine
    }
    
    // Fallback direct delete (works if trigger was disabled by RPC above)
    try {
      await supabase.from("audit_log").delete().eq("pool_id", pool.id);
    } catch {
      // May fail due to trigger, that's ok if RPC handled it
    }
    
    await supabase.from("pool_memberships").delete().eq("pool_id", pool.id);
    await supabase.from("scoring_config").delete().eq("pool_id", pool.id);
    await supabase.from("pool_whitelist").delete().eq("pool_id", pool.id);
    await supabase.from("otp_requests").delete().eq("pool_id", pool.id);
    await supabase.from("sessions").delete().eq("pool_id", pool.id);
    
    const { data: ps } = await supabase.from("pick_sets").select("id").eq("pool_id", pool.id);
    if (ps?.length) {
      const ids = ps.map((p) => p.id);
      await supabase.from("group_picks").delete().in("pick_set_id", ids);
      await supabase.from("knockout_picks").delete().in("pick_set_id", ids);
    }
    await supabase.from("pick_sets").delete().eq("pool_id", pool.id);
    await supabase.from("matches").delete().eq("pool_id", pool.id);
    await supabase.from("teams").delete().eq("pool_id", pool.id);
    await supabase.from("groups").delete().eq("pool_id", pool.id);
    await supabase.from("pools").delete().eq("id", pool.id);
  }
  
  await supabase.from("participants").delete().like("email", "%@demo.example.com");
  console.log("✅ Cleaned up.\n");
}

// ---- Copy tournament data ----
async function copyTournamentData(poolId: string) {
  const { data: gGroups } = await supabase.from("groups").select("*").eq("tournament_id", TOURNAMENT_ID).is("pool_id", null).order("letter");
  const { data: gTeams } = await supabase.from("teams").select("*").eq("tournament_id", TOURNAMENT_ID).is("pool_id", null).order("id");
  const { data: gMatches } = await supabase.from("matches").select("*").eq("tournament_id", TOURNAMENT_ID).is("pool_id", null).order("match_number");
  if (!gGroups || !gTeams || !gMatches) throw new Error("Global data not found.");

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
  // matchNumberToId: match_number → new match id (for bracket wiring)
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

// ---- Create players ----
async function createPlayers(poolId: string, count: number, startIndex: number = 0) {
  const participants: { id: string; email: string; displayName: string }[] = [];
  for (let i = 0; i < count; i++) {
    const name = getPlayerName(startIndex + i);
    const email = nameToEmail(name);
    const { data } = await supabase.from("participants")
      .upsert({ email, display_name: name }, { onConflict: "email" }).select("id").single();
    if (data) {
      participants.push({ id: data.id, email, displayName: name });
      await supabase.from("pool_memberships").upsert(
        { pool_id: poolId, participant_id: data.id, role: "player", is_approved: true, is_active: true },
        { onConflict: "pool_id,participant_id" }
      );
    }
  }
  console.log(`  ✅ ${participants.length} players`);
  return participants;
}

// ---- Create pick set ----
async function createPickSet(poolId: string, participantId: string, name: string) {
  const { data } = await supabase.from("pick_sets")
    .insert({ pool_id: poolId, participant_id: participantId, name }).select("id").single();
  return data?.id ?? null;
}

// ---- Create group picks (optionally partial) ----
async function createGroupPicks(pickSetId: string, groupMatches: any[], pickCount: number, rng: () => number) {
  const shuffled = [...groupMatches].sort(() => rng() - 0.5);
  const toPick = shuffled.slice(0, pickCount);
  const rows = toPick.map((m) => ({ pick_set_id: pickSetId, match_id: m.id, pick: randomResult(rng) }));
  for (let i = 0; i < rows.length; i += 50) {
    await supabase.from("group_picks").insert(rows.slice(i, i + 50));
  }
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
// Simulates the bracket-picking flow: pick R32 winners, those become R16 teams, pick R16 winners, etc.
async function createCascadingKnockoutPicks(
  pickSetId: string,
  knockoutMatches: any[],
  matchNumberToId: Map<number, string>,
  roundsToPick: number, // how many rounds to fill (5=all, 1=R32 only, etc.)
  rng: () => number
) {
  const matchByNumber = new Map<number, any>();
  for (const m of knockoutMatches) {
    if (m.match_number) matchByNumber.set(m.match_number, m);
  }

  // Track picked winners: matchNumber → winning teamId
  const pickedWinners = new Map<number, string>();
  const pickRows: { pick_set_id: string; match_id: string; picked_team_id: string }[] = [];

  const roundOrder = [
    [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88], // R32
    [89,90,91,92,93,94,95,96],                           // R16
    [97,98,99,100],                                       // QF
    [101,102],                                             // SF
    [103],                                                 // Final
  ];

  for (let roundIdx = 0; roundIdx < Math.min(roundsToPick, roundOrder.length); roundIdx++) {
    for (const mn of roundOrder[roundIdx]) {
      const match = matchByNumber.get(mn);
      if (!match) continue;

      let homeTeamId: string | null = null;
      let awayTeamId: string | null = null;

      const feeders = BRACKET_FEEDERS[mn];
      if (!feeders) {
        // R32: get admin-assigned teams from the match itself
        const { data } = await supabase.from("matches").select("home_team_id, away_team_id").eq("id", match.id).single();
        homeTeamId = data?.home_team_id;
        awayTeamId = data?.away_team_id;
      } else {
        // Later round: teams come from picked winners of feeder matches
        homeTeamId = pickedWinners.get(feeders[0]) ?? null;
        awayTeamId = pickedWinners.get(feeders[1]) ?? null;
      }

      if (!homeTeamId || !awayTeamId) continue;

      // Pick a random winner
      const winner = rng() > 0.5 ? homeTeamId : awayTeamId;
      pickedWinners.set(mn, winner);

      pickRows.push({ pick_set_id: pickSetId, match_id: match.id, picked_team_id: winner });
    }
  }

  for (let i = 0; i < pickRows.length; i += 50) {
    await supabase.from("knockout_picks").insert(pickRows.slice(i, i + 50));
  }
  return pickRows.length;
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
  console.log("\n🏆 World Cup Pick'em — Demo Pool Seeder\n");
  await cleanupDemoPools();

  // ========================================================================
  // POOL 1: Group Stage Picking — 15 users, varied group pick progress
  // ========================================================================
  console.log("🌱 Pool 1: Group Stage Picking");
  const rng1 = seededRandom(10);
  const pool1 = await createDemoPool("Demo 1 — Group Stage Picking", "demo-pre-tournament", {});
  if (pool1) {
    const { groupMatches } = await copyTournamentData(pool1.id);
    await createAdmin(pool1.id);
    const players1 = await createPlayers(pool1.id, 15);

    for (let i = 0; i < 15; i++) {
      const p = players1[i];
      // Players 0,1 get 3 pick sets (multi-entry demo)
      const pickSetCount = i < 2 ? 3 : 1;
      for (let ps = 0; ps < pickSetCount; ps++) {
        const psName = pickSetCount > 1 ? `${p.displayName} ${ps + 1}` : p.displayName;
        const psId = await createPickSet(pool1.id, p.id, psName);
        if (!psId) continue;

        if (i < 5) {
          await createGroupPicks(psId, groupMatches, 72, rng1);
        } else if (i < 10) {
          const count = 10 + Math.floor(rng1() * 51);
          await createGroupPicks(psId, groupMatches, count, rng1);
        }
        // i >= 10: no picks
      }
    }
    console.log(`  ✅ Pick sets created (5 full, 5 partial, 5 empty; 2 players with 3 sets)`);
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
    const players2 = await createPlayers(pool2.id, 50);

    for (let i = 0; i < players2.length; i++) {
      const p = players2[i];
      const pickSetCount = i < 3 ? 3 : 1;
      for (let ps = 0; ps < pickSetCount; ps++) {
        const psName = pickSetCount > 1 ? `${p.displayName} ${ps + 1}` : p.displayName;
        const psId = await createPickSet(pool2.id, p.id, psName);
        if (psId) await createGroupPicks(psId, groupMatches, 72, rng2);
      }
    }
    console.log(`  ✅ Pick sets with group picks (3 players with 3 sets)`);

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
    const players3 = await createPlayers(pool3.id, 50);

    // All get full group picks
    const pickSetIds: string[] = [];
    for (let i = 0; i < players3.length; i++) {
      const p = players3[i];
      const pickSetCount = i < 3 ? 3 : 1;
      for (let ps = 0; ps < pickSetCount; ps++) {
        const psName = pickSetCount > 1 ? `${p.displayName} ${ps + 1}` : p.displayName;
        const psId = await createPickSet(pool3.id, p.id, psName);
        if (psId) {
          await createGroupPicks(psId, groupMatches, 72, rng3);
          pickSetIds.push(psId);
        }
      }
    }
    console.log(`  ✅ ${pickSetIds.length} pick sets with group picks`);

    const completed3 = await simulateGroupResults(groupMatches, 1.0, rng3);
    await recalcGroupPicks(completed3);
    await setupKnockoutBracket(knockoutMatches, teamIdMap, rng3);

    // Varied KO picks using cascading logic:
    // First 10 pick sets: all 5 rounds (31 picks)
    // Next 10: partial (1-3 rounds)
    // Remaining: no KO picks
    for (let i = 0; i < pickSetIds.length; i++) {
      if (i < 10) {
        await createCascadingKnockoutPicks(pickSetIds[i], knockoutMatches, matchNumberToId, 5, rng3);
      } else if (i < 20) {
        const rounds = 1 + Math.floor(rng3() * 3); // 1-3 rounds
        await createCascadingKnockoutPicks(pickSetIds[i], knockoutMatches, matchNumberToId, rounds, rng3);
      }
    }
    console.log(`  ✅ KO picks: 10 full bracket, 10 partial, rest none`);
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
    const players4 = await createPlayers(pool4.id, 50);

    const p4PickSetIds: string[] = [];
    for (let i = 0; i < players4.length; i++) {
      const p = players4[i];
      const pickSetCount = i < 3 ? 3 : 1;
      for (let ps = 0; ps < pickSetCount; ps++) {
        const psName = pickSetCount > 1 ? `${p.displayName} ${ps + 1}` : p.displayName;
        const psId = await createPickSet(pool4.id, p.id, psName);
        if (psId) {
          await createGroupPicks(psId, groupMatches, 72, rng4);
          p4PickSetIds.push(psId);
        }
      }
    }
    console.log(`  ✅ ${p4PickSetIds.length} pick sets with group picks`);

    const completedGroup4 = await simulateGroupResults(groupMatches, 1.0, rng4);
    await recalcGroupPicks(completedGroup4);
    await setupKnockoutBracket(knockoutMatches, teamIdMap, rng4);

    // All players get full cascading KO picks before matches are played
    for (const psId of p4PickSetIds) {
      await createCascadingKnockoutPicks(psId, knockoutMatches, matchNumberToId, 5, rng4);
    }
    console.log(`  ✅ All players have full knockout brackets`);

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
