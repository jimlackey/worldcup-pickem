"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import { TOURNAMENT_ID } from "@/lib/utils/constants";
import type { AdminActionResult } from "./actions";

// ---------------------------------------------------------------------------
// Toggle: show FIFA rankings on the group picks form
// ---------------------------------------------------------------------------

/**
 * Flip the per-pool `show_fifa_rankings` flag.
 *
 * When TRUE, the group picks form (/{slug}/my-picks/{pickSetId}) renders
 * each team's FIFA ranking inline beside the team name. Default FALSE.
 *
 * Lives in its own file (mirroring actions-privacy.ts and
 * actions-consolation.ts) so the much larger actions.ts doesn't have to
 * grow further.
 */
export async function togglePoolShowFifaRankingsAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const enabled = formData.get("enabled") === "true";

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select("show_fifa_rankings")
    .eq("id", poolId)
    .single();

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ show_fifa_rankings: enabled })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.TOGGLE_SHOW_FIFA_RANKINGS,
    AuditEntity.POOL,
    poolId,
    { show_fifa_rankings: oldPool?.show_fifa_rankings ?? null },
    { show_fifa_rankings: enabled }
  );

  revalidatePath(`/${poolSlug}`, "layout");

  return {
    success: true,
    message: enabled
      ? "FIFA rankings will now be shown on the picks form."
      : "FIFA rankings will no longer be shown on the picks form.",
  };
}

// ---------------------------------------------------------------------------
// Set: maximum pick sets per email address
// ---------------------------------------------------------------------------

/**
 * Update the per-pool `max_pick_sets_per_player` cap.
 *
 * This bounds how many pick sets a single email address can create in
 * the pool. The limit is per-email because every participant row is
 * keyed to a unique email (participants.email is CITEXT UNIQUE) and
 * createPickSetAction counts existing pick sets by participant_id before
 * allowing another. So the number set here is exactly the "X of N" cap
 * each player sees on their My Picks page.
 *
 * The DB column carries a CHECK (max_pick_sets_per_player BETWEEN 1 AND
 * 10); we re-validate that range here so a hand-crafted POST can't push
 * an out-of-range value that the database would reject (or, worse, that
 * would slip through if the constraint were ever relaxed). Lowering the
 * cap never deletes existing pick sets — it only gates new creations.
 *
 * Lives alongside the display toggles in actions-display.ts rather than
 * the much larger actions.ts, matching where the other per-pool settings
 * writes already live.
 */
export async function setPoolMaxPickSetsAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const raw = formData.get("maxPickSets");

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Coerce + validate. Must be an integer in [1, 10] to satisfy the
  // column CHECK constraint. Number("") is 0 and Number("abc") is NaN,
  // both of which fail the range test below, so empty / garbage input
  // is rejected with a clear message rather than a raw DB error.
  const next = Number(raw);
  if (!Number.isInteger(next) || next < 1 || next > 10) {
    return {
      success: false,
      error: "Pick sets per player must be a whole number from 1 to 10.",
    };
  }

  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select("max_pick_sets_per_player")
    .eq("id", poolId)
    .single();

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ max_pick_sets_per_player: next })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.SET_MAX_PICK_SETS,
    AuditEntity.POOL,
    poolId,
    { max_pick_sets_per_player: oldPool?.max_pick_sets_per_player ?? null },
    { max_pick_sets_per_player: next }
  );

  // Layout-level revalidate so both the admin settings page and any
  // player's My Picks page pick up the new cap on their next render.
  revalidatePath(`/${poolSlug}`, "layout");

  return {
    success: true,
    message: `Players can now create up to ${next} pick set${next === 1 ? "" : "s"} each.`,
  };
}

// ---------------------------------------------------------------------------
// Toggle: show match money lines on the group picks form
// ---------------------------------------------------------------------------

/**
 * Flip the per-pool `show_match_lines` flag.
 *
 * When TRUE, the group picks form renders each match's home / draw / away
 * money lines underneath the corresponding pick buttons. Default FALSE.
 *
 * Demo-pool behaviour
 * -------------------
 * Demo pools have their own pool-scoped match rows. The super-admin's
 * /super-admin/lines page edits global match rows (pool_id IS NULL) and
 * propagates group-phase lines to demo pools through the
 * writeLinesGlobalAndDemos sync helper. Knockout fixtures in a demo
 * pool can be rewired by the demo admin and therefore intentionally
 * never receive line propagation — they stay NULL forever.
 *
 * When a demo pool admin flips this toggle from OFF → ON, we perform a
 * one-time backfill of group-phase lines from the global match rows
 * into this demo pool's group-phase match rows (matched by
 * match_number within the tournament). Without this backfill, an admin
 * who enables the toggle wouldn't see any lines until the next time a
 * super-admin re-saved a line — which is the wrong UX.
 *
 * The backfill is idempotent (overwriting matching rows with the same
 * source-of-truth global values is a no-op), and it only touches THIS
 * demo pool's rows — other pools are untouched.
 */
export async function togglePoolShowMatchLinesAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const poolSlug = formData.get("poolSlug") as string;
  const poolId = formData.get("poolId") as string;
  const enabled = formData.get("enabled") === "true";

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Read previous flag + is_demo so we know (a) the audit diff and
  // (b) whether to run the backfill below.
  const { data: oldPool } = await supabaseAdmin
    .from("pools")
    .select("show_match_lines, is_demo")
    .eq("id", poolId)
    .single();

  const { error } = await supabaseAdmin
    .from("pools")
    .update({ show_match_lines: enabled })
    .eq("id", poolId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Demo-pool backfill: only on the OFF → ON transition for a demo pool.
  // We hydrate `backfilledCount` so the audit log can record it. Errors
  // here are non-fatal — the toggle has already flipped successfully;
  // worst case the admin sees an empty line section until the next
  // super-admin save propagates new values.
  let backfilledCount = 0;
  const wasOff = !oldPool?.show_match_lines;
  const isDemoPool = Boolean(oldPool?.is_demo);
  if (enabled && wasOff && isDemoPool) {
    backfilledCount = await backfillGroupLinesFromGlobal(poolId);
  }

  await logAdminAction(
    session,
    AuditAction.TOGGLE_SHOW_MATCH_LINES,
    AuditEntity.POOL,
    poolId,
    { show_match_lines: oldPool?.show_match_lines ?? null },
    {
      show_match_lines: enabled,
      // Surface the backfill count in the audit row so forensic review
      // can see when (and how many) demo-pool lines got synced as a
      // side-effect of the toggle flip.
      ...(backfilledCount > 0
        ? { backfilled_group_lines: backfilledCount }
        : {}),
    }
  );

  revalidatePath(`/${poolSlug}`, "layout");

  // Build the success message. The backfill suffix only appears when
  // the demo-pool one-time sync actually moved data, so a real-pool
  // toggle and a no-op demo toggle both get the plain message.
  const enabledMsg =
    backfilledCount > 0
      ? `Match lines will now be shown on the picks form. Synced ${backfilledCount} group-phase line${backfilledCount === 1 ? "" : "s"} from the global tournament data.`
      : "Match lines will now be shown on the picks form.";

  return {
    success: true,
    message: enabled
      ? enabledMsg
      : "Match lines will no longer be shown on the picks form.",
  };
}

// ---------------------------------------------------------------------------
// Helper: backfill group-phase lines from global → a demo pool
// ---------------------------------------------------------------------------

/**
 * Copy `home_money_line` / `draw_money_line` / `away_money_line` from
 * each global group-phase match into the matching pool-scoped row in
 * `targetPoolId`, keyed on `match_number + tournament_id`.
 *
 * Used only by the demo-pool OFF → ON path in togglePoolShowMatchLinesAction.
 * Idempotent — running it again with the same source data is a no-op
 * for unchanged rows.
 *
 * Returns the count of pool-scoped rows actually updated. Rows that
 * already had matching values (or for which the global has no line on
 * file) are still written but they don't change the resulting state.
 *
 * We intentionally write a row even when all three line columns are
 * NULL on the global — that way if the global was edited from "set" to
 * "cleared" between two backfills, the second backfill also clears the
 * demo copy. Side effect is minor: a no-op UPDATE per match. The set
 * of group matches is only 72 so the volume is small.
 *
 * If the helper fails partway through (e.g. transient network error
 * while writing one of the rows), it returns the count successfully
 * written so far rather than throwing. The caller treats this as
 * best-effort.
 */
async function backfillGroupLinesFromGlobal(
  targetPoolId: string
): Promise<number> {
  // 1. Fetch global group-phase match rows with their line values and
  //    match_number — these are the source of truth.
  const { data: globalRows } = await supabaseAdmin
    .from("matches")
    .select(
      "match_number, home_money_line, draw_money_line, away_money_line"
    )
    .eq("tournament_id", TOURNAMENT_ID)
    .is("pool_id", null)
    .eq("phase", "group");

  if (!globalRows || globalRows.length === 0) {
    return 0;
  }

  // 2. Fetch the target demo pool's group-phase match rows so we can
  //    update by id (PostgREST update doesn't support correlated joins
  //    in a single call).
  const { data: demoRows } = await supabaseAdmin
    .from("matches")
    .select("id, match_number")
    .eq("tournament_id", TOURNAMENT_ID)
    .eq("pool_id", targetPoolId)
    .eq("phase", "group");

  if (!demoRows || demoRows.length === 0) {
    return 0;
  }

  // Build match_number → demo row id lookup so we can pair source
  // values with their destination rows.
  const demoIdByMatchNumber = new Map<number, string>();
  for (const r of demoRows) {
    if (r.match_number != null) {
      demoIdByMatchNumber.set(r.match_number as number, r.id as string);
    }
  }

  let writeCount = 0;
  for (const g of globalRows) {
    if (g.match_number == null) continue;
    const targetId = demoIdByMatchNumber.get(g.match_number as number);
    if (!targetId) continue;

    const { error } = await supabaseAdmin
      .from("matches")
      .update({
        home_money_line: g.home_money_line,
        draw_money_line: g.draw_money_line,
        away_money_line: g.away_money_line,
      })
      .eq("id", targetId);

    if (!error) writeCount++;
    // Errors are swallowed deliberately — we want to backfill as many
    // rows as possible even if one fails, and we don't want to roll
    // back the toggle flip that's already happened.
  }

  return writeCount;
}
