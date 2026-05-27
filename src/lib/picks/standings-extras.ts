import { supabaseAdmin } from "@/lib/supabase/server";
import { FINAL_MATCH_NUMBER } from "@/lib/picks/bracket-wiring";

/**
 * Helpers for the Standings page columns added on top of migration 024.
 *
 * Two lookups, both keyed on pick_set_id, both shaped the same way
 * (team name + short_code + flag_code) so the rendering code can
 * iterate either map with the same component.
 *
 *   - Tournament Winner pick (the player's knockout pick for the
 *     Final, match #103). Shown in the Standings "Tourney winner"
 *     column. Surfaces only after the knockout phase locks; before
 *     that the cell renders empty.
 *
 *   - 3rd-Place pick (the optional pre-tournament pick stored in
 *     third_place_picks). Shown in the Standings "3rd Place" column
 *     once the group phase locks. Pre-lock the column renders an
 *     indicator (made-or-not) instead.
 *
 * Both helpers fan out one indexed read each and return Maps; the
 * caller serialises them to plain objects across the server →
 * client boundary.
 */

export interface PickedTeamSummary {
  /** Full team name (e.g. "Brazil"). */
  name: string;
  /** Short 3-letter code (e.g. "BRA"). */
  code: string;
  /** ISO alpha-2 or subdivision flag code (e.g. "br"). */
  flagCode: string;
}

/**
 * Fetch each pick set's pick for the Final match (#103), if any. The
 * resolution path mirrors getPaymentRows in src/lib/payments/queries.ts —
 * we prefer a pool-scoped Final row (demo pools) and fall back to the
 * global one (real pools).
 *
 * Pick sets without a Final pick aren't in the map; the caller treats
 * missing entries as "no pick yet".
 */
export async function getFinalPicksByPickSet(
  poolId: string,
  pickSetIds: string[]
): Promise<Map<string, PickedTeamSummary>> {
  const out = new Map<string, PickedTeamSummary>();
  if (pickSetIds.length === 0) return out;

  // Find the Final match for this pool. The matches table is partially
  // pool-scoped (demo pools have their own rows; real pools share the
  // global pool_id=NULL rows), so we look at both candidates and
  // prefer the demo one when both exist.
  const { data: finalMatchRows } = await supabaseAdmin
    .from("matches")
    .select("id, pool_id")
    .eq("match_number", FINAL_MATCH_NUMBER);

  const finalMatches = (finalMatchRows ?? []) as {
    id: string;
    pool_id: string | null;
  }[];
  const finalMatchId =
    finalMatches.find((m) => m.pool_id === poolId)?.id ??
    finalMatches.find((m) => m.pool_id === null)?.id ??
    null;

  if (!finalMatchId) return out;

  const { data: koPicks } = await supabaseAdmin
    .from("knockout_picks")
    .select(
      "pick_set_id, picked_team:teams(name, short_code, flag_code)"
    )
    .in("pick_set_id", pickSetIds)
    .eq("match_id", finalMatchId);

  // Same supabase-js to-one-relation defensive unwrap pattern used
  // elsewhere — the static types say array but the JSON is the
  // single object at runtime.
  for (const row of (koPicks ?? []) as Array<{
    pick_set_id: string;
    picked_team:
      | { name: string; short_code: string; flag_code: string }
      | { name: string; short_code: string; flag_code: string }[]
      | null;
  }>) {
    const team = Array.isArray(row.picked_team)
      ? row.picked_team[0]
      : row.picked_team;
    if (!team) continue;
    out.set(row.pick_set_id, {
      name: team.name,
      code: team.short_code,
      flagCode: team.flag_code,
    });
  }

  return out;
}
