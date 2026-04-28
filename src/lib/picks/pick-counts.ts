import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Pagination size for Supabase queries.
 *
 * supabase-js / PostgREST silently caps `.select()` at 1000 rows when no
 * `.range()` is supplied. For per-pick-set count rollups across an entire
 * pool, that ceiling is hit easily:
 *
 *   14 pick sets × 72 group picks = 1008 rows  → already over the cap
 *
 * When the cap was being hit, pick sets whose rows fell outside the first
 * 1000 rows showed up as 0/72 in the standings progress column even though
 * the user had filled out all their picks. We page through with `.range()`
 * to make the count exhaustive.
 */
const PAGE_SIZE = 1000;
const MAX_ROWS = 1_000_000;

interface PickRow {
  pick_set_id: string;
}

/**
 * Count picks for a list of pick set IDs, grouped by pick_set_id.
 *
 * Used by both the standings page (counts across all players in the pool)
 * and the my-picks page (counts across the current user's pick sets).
 *
 * @param table        Either "group_picks" or "knockout_picks".
 * @param pickSetIds   Pick set IDs to count rows for.
 * @returns            { [pickSetId]: count }. Pick sets with zero rows are
 *                     omitted from the map; callers should default to 0.
 */
export async function countPicksByPickSet(
  table: "group_picks" | "knockout_picks",
  pickSetIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (pickSetIds.length === 0) return counts;

  let from = 0;
  while (from < MAX_ROWS) {
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabaseAdmin
      .from(table)
      .select("pick_set_id")
      .in("pick_set_id", pickSetIds)
      .range(from, to);

    const rows = (data ?? []) as PickRow[];
    for (const row of rows) {
      counts[row.pick_set_id] = (counts[row.pick_set_id] ?? 0) + 1;
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return counts;
}
