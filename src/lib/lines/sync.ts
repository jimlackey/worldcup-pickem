/**
 * Match-line write helper — propagates line values from the canonical
 * global match row (matches.pool_id IS NULL) to every demo-pool match row
 * that shares the same match_number and tournament.
 *
 * Why this exists
 * ---------------
 * Real pools read matches from the global rows directly, but demo pools
 * have their own private pool-scoped copies. If we only wrote to the
 * global row, demo pools would never see line updates. This helper
 * keeps the two in sync after every write originating from the
 * super-admin Match Lines page.
 *
 * The same join key used elsewhere in the codebase (match_number within
 * tournament_id) is used here — it's stable across pool copies because
 * the demo-pool seed script clones the full match set 1:1.
 *
 * Returns a count of affected rows for the caller's response message.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { TOURNAMENT_ID } from "@/lib/utils/constants";

export interface LineValues {
  home_money_line: number | null;
  draw_money_line: number | null;
  away_money_line: number | null;
}

/**
 * Write line values to the global match row identified by id, then
 * propagate the same values to every demo-pool copy of that match
 * (matched by match_number + tournament_id).
 *
 * Returns:
 *   - globalUpdated: 1 if the global row was written, 0 if it wasn't
 *     found (caller should treat this as an error).
 *   - demoUpdated:   how many demo-pool rows received the propagated
 *     values. May be 0 if there are no demo pools — that's fine.
 */
export async function writeLinesGlobalAndDemos(
  globalMatchId: string,
  values: LineValues
): Promise<{ globalUpdated: number; demoUpdated: number; matchNumber: number | null }> {
  // First, write to the global row and learn its match_number — needed
  // for the demo propagation step.
  const { data: updatedGlobal, error: globalErr } = await supabaseAdmin
    .from("matches")
    .update(values)
    .eq("id", globalMatchId)
    .is("pool_id", null)
    .select("id, match_number")
    .maybeSingle();

  if (globalErr) {
    throw new Error(`Failed to update global match: ${globalErr.message}`);
  }
  if (!updatedGlobal) {
    // The match either doesn't exist or has a non-NULL pool_id. Both
    // are caller errors but we surface them the same way.
    return { globalUpdated: 0, demoUpdated: 0, matchNumber: null };
  }

  // Propagate to all demo-pool copies of this match, keyed on
  // match_number. We use an EXISTS check against pools.is_demo so we
  // only ever touch rows owned by real demo pools (defence-in-depth —
  // a non-demo pool with a pool-scoped match row would be a corruption
  // case, but if one ever existed we'd want to skip it).
  if (updatedGlobal.match_number == null) {
    // Should never happen for our tournament rows (all matches have a
    // number) but guard anyway.
    return { globalUpdated: 1, demoUpdated: 0, matchNumber: null };
  }

  // Find every demo-pool match row with the same match_number, then
  // batch-update by ID. Two queries are necessary because Supabase's
  // PostgREST update doesn't support correlated subqueries the way raw
  // SQL would — and writing this as a single UPDATE...FROM would
  // require the SQL editor or an RPC.
  const { data: demoRows } = await supabaseAdmin
    .from("matches")
    .select("id, pool_id")
    .eq("tournament_id", TOURNAMENT_ID)
    .eq("match_number", updatedGlobal.match_number)
    .not("pool_id", "is", null);

  if (!demoRows || demoRows.length === 0) {
    return { globalUpdated: 1, demoUpdated: 0, matchNumber: updatedGlobal.match_number };
  }

  // Filter to rows whose pool_id belongs to a demo pool. Real pools
  // should NEVER have pool-scoped match rows (they read from globals)
  // but this filter makes the helper defensive against that misconfig.
  const poolIds = Array.from(new Set(demoRows.map((r) => r.pool_id))) as string[];
  const { data: demoPools } = await supabaseAdmin
    .from("pools")
    .select("id")
    .in("id", poolIds)
    .eq("is_demo", true);

  const demoPoolIds = new Set((demoPools ?? []).map((p) => p.id as string));
  const idsToUpdate = demoRows
    .filter((r) => r.pool_id && demoPoolIds.has(r.pool_id))
    .map((r) => r.id as string);

  if (idsToUpdate.length === 0) {
    return { globalUpdated: 1, demoUpdated: 0, matchNumber: updatedGlobal.match_number };
  }

  const { error: demoErr } = await supabaseAdmin
    .from("matches")
    .update(values)
    .in("id", idsToUpdate);

  if (demoErr) {
    // Global write already succeeded — surface the demo-write failure
    // but don't pretend the whole thing rolled back.
    throw new Error(
      `Global match updated, but failed to propagate to demo pools: ${demoErr.message}`
    );
  }

  return {
    globalUpdated: 1,
    demoUpdated: idsToUpdate.length,
    matchNumber: updatedGlobal.match_number,
  };
}
