/**
 * scripts/setup-pool.ts
 *
 * Create a new pool with an admin user, whitelist, and default scoring.
 * Run with: npx tsx scripts/setup-pool.ts
 *
 * Automatically loads .env.local from the project root.
 * Idempotent — safe to re-run. Will skip creation if pool slug already exists.
 */

import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
loadEnvFile();

// ---- Config ----
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TOURNAMENT_ID = process.env.NEXT_PUBLIC_TOURNAMENT_ID || "00000000-0000-0000-0000-000000000001";

// Default tournament dates — kept in sync with DEFAULT_POOL_DATES in
// src/lib/utils/constants.ts. They're hardcoded here (not imported) because
// this script is run standalone via tsx and we don't want it to drag in any
// app-side dependencies. If you change one place, change the other.
//
//   group_lock_at     2026-06-11 13:00 PT  →  2026-06-11T20:00:00Z
//   knockout_open_at  2026-06-27 21:00 PT  →  2026-06-28T04:00:00Z
//   knockout_lock_at  2026-06-29 09:00 PT  →  2026-06-29T16:00:00Z
const DEFAULT_GROUP_LOCK_AT = "2026-06-11T20:00:00Z";
const DEFAULT_KNOCKOUT_OPEN_AT = "2026-06-28T04:00:00Z";
const DEFAULT_KNOCKOUT_LOCK_AT = "2026-06-29T16:00:00Z";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("   Make sure .env.local exists in the project root with these values set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- Interactive prompts ----
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((res) => rl.question(q, (a) => res(a.trim())));

async function main() {
  console.log("\n🏆 World Cup Pick'em — Pool Setup\n");

  // Gather inputs
  const poolName = await ask("Pool name (e.g. 'Work Pool'): ");
  const poolSlug = await ask("Pool slug (e.g. 'work-pool'): ");
  const adminEmail = await ask("Admin email: ");
  const adminName = await ask("Admin display name: ");
  const maxPickSets = await ask("Max pick sets per player (1-10, default 5): ");
  const whitelistInput = await ask(
    "Additional whitelist emails (comma-separated, or blank): "
  );

  const maxSets = parseInt(maxPickSets, 10) || 5;
  const whitelistEmails = whitelistInput
    ? whitelistInput.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];

  // Always add admin to whitelist
  if (!whitelistEmails.includes(adminEmail.toLowerCase())) {
    whitelistEmails.push(adminEmail.toLowerCase());
  }

  console.log("\n📋 Summary:");
  console.log(`   Name: ${poolName}`);
  console.log(`   Slug: ${poolSlug}`);
  console.log(`   Admin: ${adminEmail} (${adminName})`);
  console.log(`   Max pick sets: ${maxSets}`);
  console.log(`   Whitelist: ${whitelistEmails.join(", ")}`);
  console.log(`   Group lock:    ${DEFAULT_GROUP_LOCK_AT}  (Jun 11 2026, 1:00 PM PT)`);
  console.log(`   Knockout open: ${DEFAULT_KNOCKOUT_OPEN_AT}  (Jun 27 2026, 9:00 PM PT)`);
  console.log(`   Knockout lock: ${DEFAULT_KNOCKOUT_LOCK_AT}  (Jun 29 2026, 9:00 AM PT)`);

  const confirm = await ask("\nProceed? (y/n): ");
  if (confirm.toLowerCase() !== "y") {
    console.log("Cancelled.");
    rl.close();
    return;
  }

  // ---- Check if pool already exists ----
  const { data: existing } = await supabase
    .from("pools")
    .select("id")
    .eq("slug", poolSlug)
    .single();

  if (existing) {
    console.log(`\n⚠️  Pool with slug '${poolSlug}' already exists (${existing.id}).`);
    console.log("   Skipping pool creation. Re-run with a different slug.");
    rl.close();
    return;
  }

  // ---- Create pool ----
  // Tournament dates pre-filled with the canonical defaults. The pool admin
  // can override any of these from /{slug}/admin/settings if their pool is
  // running on a different schedule.
  const { data: pool, error: poolError } = await supabase
    .from("pools")
    .insert({
      name: poolName,
      slug: poolSlug,
      tournament_id: TOURNAMENT_ID,
      max_pick_sets_per_player: maxSets,
      is_demo: false,
      is_active: true,
      group_lock_at: DEFAULT_GROUP_LOCK_AT,
      knockout_open_at: DEFAULT_KNOCKOUT_OPEN_AT,
      knockout_lock_at: DEFAULT_KNOCKOUT_LOCK_AT,
    })
    .select()
    .single();

  if (poolError || !pool) {
    console.error("❌ Failed to create pool:", poolError?.message);
    rl.close();
    return;
  }
  console.log(`\n✅ Pool created: ${pool.id}`);

  // ---- Initialize scoring config ----
  const { error: scoringError } = await supabase.rpc("initialize_pool_scoring", {
    p_pool_id: pool.id,
  });
  if (scoringError) {
    console.error("⚠️  Scoring config error:", scoringError.message);
  } else {
    console.log("✅ Default scoring config applied");
  }

  // ---- Create admin participant ----
  let participant: { id: string };
  const { data: existingParticipant } = await supabase
    .from("participants")
    .select("id")
    .eq("email", adminEmail.toLowerCase())
    .single();

  if (existingParticipant) {
    participant = existingParticipant;
    console.log(`✅ Admin participant already exists: ${participant.id}`);
  } else {
    const { data: newParticipant, error: partError } = await supabase
      .from("participants")
      .insert({
        email: adminEmail.toLowerCase(),
        display_name: adminName,
      })
      .select("id")
      .single();

    if (partError || !newParticipant) {
      console.error("❌ Failed to create participant:", partError?.message);
      rl.close();
      return;
    }
    participant = newParticipant;
    console.log(`✅ Admin participant created: ${participant.id}`);
  }

  // ---- Create admin membership ----
  const { error: memberError } = await supabase.from("pool_memberships").upsert(
    {
      pool_id: pool.id,
      participant_id: participant.id,
      role: "admin",
      is_approved: true,
      is_active: true,
    },
    { onConflict: "pool_id,participant_id" }
  );

  if (memberError) {
    console.error("⚠️  Membership error:", memberError.message);
  } else {
    console.log("✅ Admin membership created");
  }

  // ---- Add whitelist entries ----
  const whitelistRows = whitelistEmails.map((email) => ({
    pool_id: pool.id,
    email,
  }));

  const { error: wlError } = await supabase
    .from("pool_whitelist")
    .upsert(whitelistRows, { onConflict: "pool_id,email" });

  if (wlError) {
    console.error("⚠️  Whitelist error:", wlError.message);
  } else {
    console.log(`✅ ${whitelistEmails.length} email(s) added to whitelist`);
  }

  // ---- Done ----
  console.log(`\n🎉 Pool ready! Access at: /${poolSlug}`);
  console.log(`   Pool ID: ${pool.id}`);
  console.log(`   Admin login: ${adminEmail}`);
  console.log("");
  rl.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
