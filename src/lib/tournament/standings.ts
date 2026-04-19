import { supabaseAdmin } from "@/lib/supabase/server";
import type { StandingsRow } from "@/types/database";

/**
 * Calculate standings for a pool using the DB function.
 * Returns ranked rows with pick set names, scores, and breakdowns.
 */
export async function getStandings(poolId: string): Promise<StandingsRow[]> {
  const { data, error } = await supabaseAdmin.rpc("calculate_standings", {
    p_pool_id: poolId,
  });

  if (error) {
    console.error("Standings calculation error:", error);
    return [];
  }

  // Add rank (handle ties — same points = same rank)
  const rows = (data ?? []) as StandingsRow[];
  let currentRank = 1;

  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].total_points < rows[i - 1].total_points) {
      currentRank = i + 1;
    }
    rows[i].rank = currentRank;
  }

  return rows;
}
