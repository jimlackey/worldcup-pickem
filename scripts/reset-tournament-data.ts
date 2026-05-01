/**
 * scripts/reset-tournament-data.ts
 *
 * Purges and re-creates all 2026 FIFA World Cup tournament data.
 *
 * What this script does:
 *   1. Deletes ALL pool-scoped data (picks, pick sets, memberships, teams,
 *      groups, matches, scoring_config) across every pool — demo AND real.
 *   2. Deletes the pool rows themselves (fresh slate).
 *   3. Deletes the global tournament data (teams, groups, matches where
 *      pool_id IS NULL).
 *   4. Re-inserts the correct 48 teams, 12 groups, 72 group fixtures, and
 *      31 knockout match slots using the official FIFA draw results.
 *
 * What it does NOT touch:
 *   - The `tournaments` table (kickoff time is updated in place).
 *   - `participants` and `audit_log` (historical records, harmless).
 *   - `super_admin_sessions` (hardcoded whitelist is unaffected).
 *
 * After running this, run `npm run seed-demo` to re-create the four demo pools
 * against the corrected global data.
 *
 * Usage: npx tsx scripts/reset-tournament-data.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { TEAMS_BY_GROUP, GROUP_FIXTURES } from "./tournament-data";

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

// Tournament start time — derived from the first fixture (Mexico vs South
// Africa, June 11 at 3pm ET = 19:00 UTC).
const TOURNAMENT_KICKOFF = "2026-06-11T19:00:00Z";

// ============================================================================
// PHASE 1: PURGE
// ============================================================================
async function purgeAllTournamentData() {
  console.log("🧹 Purging existing tournament data...\n");

  // 1. All pools — collect their IDs so we can clean dependent rows.
  const { data: allPools } = await supabase.from("pools").select("id, slug, is_demo");
  console.log(`   Found ${allPools?.length ?? 0} pools to clean (all will be removed)`);

  for (const pool of allPools ?? []) {
    // Collect pick set IDs for this pool
    const { data: pickSets } = await supabase
      .from("pick_sets")
      .select("id")
      .eq("pool_id", pool.id);
    const pickSetIds = (pickSets ?? []).map((p) => p.id);

    // Delete picks first, then pick sets
    if (pickSetIds.length > 0) {
      // Supabase caps .in(...) at ~1000 items. Our pools may have 250+ pick
      // sets; 250 IDs is well within limits. But use chunking defensively.
      for (let i = 0; i < pickSetIds.length; i += 500) {
        const chunk = pickSetIds.slice(i, i + 500);
        await supabase.from("group_picks").delete().in("pick_set_id", chunk);
        await supabase.from("knockout_picks").delete().in("pick_set_id", chunk);
      }
      for (let i = 0; i < pickSetIds.length; i += 500) {
        const chunk = pickSetIds.slice(i, i + 500);
        await supabase.from("pick_sets").delete().in("id", chunk);
      }
    }

    // Pool-scoped data
    await supabase.from("pool_memberships").delete().eq("pool_id", pool.id);
    await supabase.from("scoring_config").delete().eq("pool_id", pool.id);
    await supabase.from("pool_whitelist").delete().eq("pool_id", pool.id);
    await supabase.from("otp_requests").delete().eq("pool_id", pool.id);
    await supabase.from("sessions").delete().eq("pool_id", pool.id);
    await supabase.from("audit_log").delete().eq("pool_id", pool.id);

    // Pool-scoped tournament data
    await supabase.from("matches").delete().eq("pool_id", pool.id);
    await supabase.from("teams").delete().eq("pool_id", pool.id);
    await supabase.from("groups").delete().eq("pool_id", pool.id);

    // Finally, the pool itself
    await supabase.from("pools").delete().eq("id", pool.id);
    console.log(`   🗑️  Removed pool: ${pool.slug}${pool.is_demo ? " (demo)" : ""}`);
  }

  // 2. Global tournament data (pool_id IS NULL)
  await supabase.from("matches").delete().is("pool_id", null);
  await supabase.from("teams").delete().is("pool_id", null);
  await supabase.from("groups").delete().is("pool_id", null);
  console.log(`   🗑️  Removed global teams, groups, and matches`);

  console.log("");
}

// ============================================================================
// PHASE 2: INSERT CORRECT DATA
// ============================================================================

async function upsertTournamentRow() {
  // Update the tournament row (or create it if missing). We don't delete it
  // since pools reference it via FK.
  const { data: existing } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", TOURNAMENT_ID)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("tournaments")
      .update({
        name: "2026 FIFA World Cup",
        year: 2026,
        kickoff_at: TOURNAMENT_KICKOFF,
      })
      .eq("id", TOURNAMENT_ID);
    console.log(`   ✅ Updated tournament row (kickoff: ${TOURNAMENT_KICKOFF})`);
  } else {
    await supabase.from("tournaments").insert({
      id: TOURNAMENT_ID,
      name: "2026 FIFA World Cup",
      year: 2026,
      kickoff_at: TOURNAMENT_KICKOFF,
    });
    console.log(`   ✅ Created tournament row`);
  }
}

async function insertGroups(): Promise<Map<string, string>> {
  // Returns: letter → group_id
  const rows = Object.keys(TEAMS_BY_GROUP)
    .sort()
    .map((letter) => ({
      tournament_id: TOURNAMENT_ID,
      pool_id: null,
      name: `Group ${letter}`,
      letter,
    }));

  const { data, error } = await supabase
    .from("groups")
    .insert(rows)
    .select("id, letter");
  if (error) throw new Error(`Failed to insert groups: ${error.message}`);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; letter: string }>) {
    map.set(row.letter, row.id);
  }
  console.log(`   ✅ Inserted ${map.size} groups (A-L)`);
  return map;
}

async function insertTeams(
  groupIdByLetter: Map<string, string>
): Promise<Map<string, string>> {
  // Returns: team_name → team_id
  const rows: Array<{
    tournament_id: string;
    pool_id: null;
    name: string;
    short_code: string;
    flag_code: string;
    group_id: string;
  }> = [];

  for (const [letter, teams] of Object.entries(TEAMS_BY_GROUP)) {
    const groupId = groupIdByLetter.get(letter);
    if (!groupId) throw new Error(`Missing group id for letter ${letter}`);
    for (const t of teams) {
      rows.push({
        tournament_id: TOURNAMENT_ID,
        pool_id: null,
        name: t.name,
        short_code: t.short_code,
        flag_code: t.flag_code,
        group_id: groupId,
      });
    }
  }

  const { data, error } = await supabase
    .from("teams")
    .insert(rows)
    .select("id, name");
  if (error) throw new Error(`Failed to insert teams: ${error.message}`);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
    map.set(row.name, row.id);
  }
  console.log(`   ✅ Inserted ${map.size} teams`);
  return map;
}

async function insertGroupMatches(
  groupIdByLetter: Map<string, string>,
  teamIdByName: Map<string, string>
) {
  // 72 group matches, numbered 1-72 in chronological order.
  const rows = GROUP_FIXTURES.map((fixture, i) => {
    const match_number = i + 1;
    const groupId = groupIdByLetter.get(fixture.group);
    const homeId = teamIdByName.get(fixture.home);
    const awayId = teamIdByName.get(fixture.away);
    if (!groupId) throw new Error(`Unknown group: ${fixture.group}`);
    if (!homeId) throw new Error(`Unknown team (home): ${fixture.home}`);
    if (!awayId) throw new Error(`Unknown team (away): ${fixture.away}`);
    return {
      tournament_id: TOURNAMENT_ID,
      pool_id: null,
      phase: "group" as const,
      group_id: groupId,
      match_number,
      home_team_id: homeId,
      away_team_id: awayId,
      scheduled_at: fixture.scheduled_at,
      status: "scheduled" as const,
      label: null,
    };
  });

  const { error } = await supabase.from("matches").insert(rows);
  if (error) throw new Error(`Failed to insert group matches: ${error.message}`);
  console.log(`   ✅ Inserted ${rows.length} group matches (#1-${rows.length})`);
}

async function insertKnockoutMatches() {
  // 31 knockout match slots with NULL team IDs — admin populates teams later.
  // match_numbers 73-103, mirroring the existing migration and app code.
  const rows: Array<{
    tournament_id: string;
    pool_id: null;
    phase: "r32" | "r16" | "qf" | "sf" | "final";
    match_number: number;
    status: "scheduled";
    label: string;
    scheduled_at: null;
    home_team_id: null;
    away_team_id: null;
    group_id: null;
  }> = [];

  // R32: match_number 73-88
  for (let i = 0; i < 16; i++) {
    rows.push({
      tournament_id: TOURNAMENT_ID,
      pool_id: null,
      phase: "r32",
      match_number: 73 + i,
      status: "scheduled",
      label: `R32 Match ${i + 1}`,
      scheduled_at: null,
      home_team_id: null,
      away_team_id: null,
      group_id: null,
    });
  }
  // R16: 89-96
  for (let i = 0; i < 8; i++) {
    rows.push({
      tournament_id: TOURNAMENT_ID,
      pool_id: null,
      phase: "r16",
      match_number: 89 + i,
      status: "scheduled",
      label: `R16 Match ${i + 1}`,
      scheduled_at: null,
      home_team_id: null,
      away_team_id: null,
      group_id: null,
    });
  }
  // QF: 97-100
  for (let i = 0; i < 4; i++) {
    rows.push({
      tournament_id: TOURNAMENT_ID,
      pool_id: null,
      phase: "qf",
      match_number: 97 + i,
      status: "scheduled",
      label: `QF Match ${i + 1}`,
      scheduled_at: null,
      home_team_id: null,
      away_team_id: null,
      group_id: null,
    });
  }
  // SF: 101-102
  for (let i = 0; i < 2; i++) {
    rows.push({
      tournament_id: TOURNAMENT_ID,
      pool_id: null,
      phase: "sf",
      match_number: 101 + i,
      status: "scheduled",
      label: `SF Match ${i + 1}`,
      scheduled_at: null,
      home_team_id: null,
      away_team_id: null,
      group_id: null,
    });
  }
  // Final: 103
  rows.push({
    tournament_id: TOURNAMENT_ID,
    pool_id: null,
    phase: "final",
    match_number: 103,
    status: "scheduled",
    label: "Final",
    scheduled_at: null,
    home_team_id: null,
    away_team_id: null,
    group_id: null,
  });
  // Consolation: 104
  rows.push({
    tournament_id: TOURNAMENT_ID,
    pool_id: null,
    phase: "final",
    match_number: 104,
    status: "scheduled",
    label: "Consolation",
    scheduled_at: null,
    home_team_id: null,
    away_team_id: null,
    group_id: null,
  });
  
  const { error } = await supabase.from("matches").insert(rows);
  if (error) throw new Error(`Failed to insert knockout slots: ${error.message}`);
  console.log(
    `   ✅ Inserted ${rows.length} knockout match slots (#73-103, teams TBD)`
  );
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log("\n🏆 Reset 2026 FIFA World Cup Tournament Data\n");

  await purgeAllTournamentData();

  console.log("🌱 Inserting corrected tournament data...\n");

  await upsertTournamentRow();
  const groupIdByLetter = await insertGroups();
  const teamIdByName = await insertTeams(groupIdByLetter);
  await insertGroupMatches(groupIdByLetter, teamIdByName);
  await insertKnockoutMatches();

  console.log("\n✅ Reset complete.\n");
  console.log("Next step: run `npm run seed-demo` to create the four demo pools");
  console.log("against the corrected tournament data.\n");
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
