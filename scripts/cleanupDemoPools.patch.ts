// ============================================================================
// REPLACEMENT FOR THE `cleanupDemoPools` FUNCTION in scripts/seed-demo.ts
// ============================================================================
// Find the existing function that begins with `async function cleanupDemoPools`
// in scripts/seed-demo.ts and replace it with the version below. Nothing else
// in the file needs to change.
//
// What's different from before:
//   1. Each delete step checks its error return. If a step fails, the script
//      now throws immediately with a clear message naming the table and pool.
//      Previously errors were silently swallowed — a cascade failure would
//      leave the pool row in place but the "🗑️" log line would still print,
//      and the next pool create with the same slug would die on a unique
//      constraint violation.
//   2. The log line for each deleted pool is printed AFTER the delete actually
//      succeeds, not before.
// ============================================================================

async function cleanupDemoPools() {
  console.log("🧹 Cleaning existing demo pools...");

  const demoSlugs = [
    "demo-pre-tournament",
    "demo-group-phase",
    "demo-knockout-picking",
    "demo-knockout-phase",
  ];
  const { data: existingDemos, error: listError } = await supabase
    .from("pools")
    .select("id, slug")
    .or(`is_demo.eq.true,slug.in.(${demoSlugs.join(",")})`);

  if (listError) {
    throw new Error(`Failed to list demo pools: ${listError.message}`);
  }

  for (const pool of existingDemos ?? []) {
    // Helper: run a delete and throw on error with a clear label.
    const del = async (
      label: string,
      promise: PromiseLike<{ error: { message: string } | null }>
    ) => {
      const { error } = await promise;
      if (error) {
        throw new Error(
          `Cleanup failed while deleting ${label} for pool ${pool.slug}: ${error.message}`
        );
      }
    };

    // Fetch pick set IDs for this pool so we can cascade them explicitly.
    const { data: pickSets, error: psError } = await supabase
      .from("pick_sets")
      .select("id")
      .eq("pool_id", pool.id);
    if (psError) {
      throw new Error(
        `Cleanup failed listing pick_sets for ${pool.slug}: ${psError.message}`
      );
    }
    const pickSetIds = ((pickSets ?? []) as Array<{ id: string }>).map((p) => p.id);

    if (pickSetIds.length > 0) {
      // .in(...) caps near 1000 items. We're under that today, but chunk
      // defensively in case demo scale grows.
      for (let i = 0; i < pickSetIds.length; i += 500) {
        const chunk = pickSetIds.slice(i, i + 500);
        await del(
          "group_picks",
          supabase.from("group_picks").delete().in("pick_set_id", chunk)
        );
        await del(
          "knockout_picks",
          supabase.from("knockout_picks").delete().in("pick_set_id", chunk)
        );
      }
      for (let i = 0; i < pickSetIds.length; i += 500) {
        const chunk = pickSetIds.slice(i, i + 500);
        await del(
          "pick_sets",
          supabase.from("pick_sets").delete().in("id", chunk)
        );
      }
    }

    // Pool-scoped dependent rows, deleted in dependency order.
    await del(
      "pool_memberships",
      supabase.from("pool_memberships").delete().eq("pool_id", pool.id)
    );
    await del(
      "scoring_config",
      supabase.from("scoring_config").delete().eq("pool_id", pool.id)
    );
    await del(
      "matches",
      supabase.from("matches").delete().eq("pool_id", pool.id)
    );
    await del(
      "teams",
      supabase.from("teams").delete().eq("pool_id", pool.id)
    );
    await del(
      "groups",
      supabase.from("groups").delete().eq("pool_id", pool.id)
    );

    // NOTE: We do NOT explicitly delete pool_whitelist, otp_requests,
    // sessions, or audit_log here. They all have ON DELETE CASCADE from
    // pools(id), so the DELETE FROM pools below will cascade them.
    // audit_log's BEFORE DELETE trigger now allows cascades (see
    // migration 008) — direct deletes on audit_log still fail.

    await del(
      "pools",
      supabase.from("pools").delete().eq("id", pool.id)
    );
    console.log(`  🗑️  ${pool.slug}`);
  }
}
