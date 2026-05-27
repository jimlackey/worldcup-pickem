import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Server-side helpers for the optional Pre-Tournament 3rd-Place pick
 * (migration 024).
 *
 * The feature is gated on `pool.consolation_mode === 'preseason_pick'`.
 * Callers are expected to check that flag before invoking these helpers
 * — they don't re-check it themselves so the same helpers can also be
 * driven from migration / admin tooling that legitimately wants to
 * read/write the rows regardless of pool mode.
 *
 * Authorization (player ownership / admin role) happens in the calling
 * server actions; these helpers use the service-role client and bypass
 * RLS.
 */

export interface ThirdPlacePickRow {
  pickSetId: string;
  pickedTeamId: string;
  pickedTeamName: string;
  pickedTeamCode: string;
  pickedTeamFlagCode: string;
  isCorrect: boolean | null;
}

/**
 * Fetch a single pick set's 3rd-place pick joined with the team it
 * points at. Returns null when the player hasn't made the pick (or
 * cleared it later) — the row literally doesn't exist in that case.
 */
export async function getThirdPlacePick(
  pickSetId: string
): Promise<ThirdPlacePickRow | null> {
  const { data } = await supabaseAdmin
    .from("third_place_picks")
    .select(
      "pick_set_id, picked_team_id, is_correct, team:teams(name, short_code, flag_code)"
    )
    .eq("pick_set_id", pickSetId)
    .maybeSingle();

  if (!data) return null;

  // supabase-js types nested-select relations as arrays; the runtime
  // shape for a to-one FK is the single object. Handle both defensively,
  // same pattern as the payments/queries.ts unwrap.
  const team = Array.isArray(data.team)
    ? (data.team[0] as
        | { name: string; short_code: string; flag_code: string }
        | undefined)
    : (data.team as
        | { name: string; short_code: string; flag_code: string }
        | null
        | undefined);

  if (!team) return null;

  return {
    pickSetId: data.pick_set_id as string,
    pickedTeamId: data.picked_team_id as string,
    pickedTeamName: team.name,
    pickedTeamCode: team.short_code,
    pickedTeamFlagCode: team.flag_code,
    isCorrect: (data.is_correct as boolean | null) ?? null,
  };
}

/**
 * Bulk variant — fetch the 3rd-place pick for every pick set in the
 * given list. Returns a Map keyed by pick_set_id so the caller can
 * stitch into a parent list without an O(n) scan per row. Pick sets
 * with no pick are simply absent from the map.
 *
 * The Map shape matches the per-pick-set lookup pattern used elsewhere
 * (see countPicksByPickSet, winnerByPickSet in payments/queries.ts).
 */
export async function getThirdPlacePicksByPickSet(
  pickSetIds: string[]
): Promise<Map<string, ThirdPlacePickRow>> {
  const out = new Map<string, ThirdPlacePickRow>();
  if (pickSetIds.length === 0) return out;

  const { data } = await supabaseAdmin
    .from("third_place_picks")
    .select(
      "pick_set_id, picked_team_id, is_correct, team:teams(name, short_code, flag_code)"
    )
    .in("pick_set_id", pickSetIds);

  for (const row of (data ?? []) as Array<{
    pick_set_id: string;
    picked_team_id: string;
    is_correct: boolean | null;
    team:
      | { name: string; short_code: string; flag_code: string }
      | { name: string; short_code: string; flag_code: string }[]
      | null;
  }>) {
    const team = Array.isArray(row.team) ? row.team[0] : row.team;
    if (!team) continue;
    out.set(row.pick_set_id, {
      pickSetId: row.pick_set_id,
      pickedTeamId: row.picked_team_id,
      pickedTeamName: team.name,
      pickedTeamCode: team.short_code,
      pickedTeamFlagCode: team.flag_code,
      isCorrect: row.is_correct ?? null,
    });
  }

  return out;
}

/**
 * Upsert a pick set's 3rd-place pick. Returns the previous team id (or
 * null if there was no prior pick) so the caller can write a clean
 * old → new diff to the audit log.
 *
 * The upsert keys on pick_set_id (UNIQUE in the DB) so we don't need
 * to read-then-write here — Postgres handles the insert-or-update in a
 * single round-trip. We still do a separate read to capture the
 * previous value because the audit-log entry needs both sides.
 */
export async function setThirdPlacePick(
  pickSetId: string,
  teamId: string
): Promise<{ previousTeamId: string | null }> {
  const { data: existing } = await supabaseAdmin
    .from("third_place_picks")
    .select("picked_team_id")
    .eq("pick_set_id", pickSetId)
    .maybeSingle();

  const previousTeamId = (existing?.picked_team_id as string | undefined) ?? null;

  const { error } = await supabaseAdmin.from("third_place_picks").upsert(
    {
      pick_set_id: pickSetId,
      picked_team_id: teamId,
      // Clear is_correct on every write — a player changing their pick
      // re-opens it for grading. The downstream scoring pipeline will
      // re-set it when the tournament resolves a 3rd-place finisher.
      is_correct: null,
    },
    { onConflict: "pick_set_id" }
  );

  if (error) {
    throw new Error(`Failed to save 3rd-place pick: ${error.message}`);
  }

  return { previousTeamId };
}

/**
 * Delete a pick set's 3rd-place pick. Used when the player explicitly
 * clears their selection from the picks form. Returns the previous
 * team id (or null if there was nothing to clear).
 *
 * Tolerates "no row to delete" — clearing an empty slot is a no-op,
 * not an error.
 */
export async function clearThirdPlacePick(
  pickSetId: string
): Promise<{ previousTeamId: string | null }> {
  const { data: existing } = await supabaseAdmin
    .from("third_place_picks")
    .select("picked_team_id")
    .eq("pick_set_id", pickSetId)
    .maybeSingle();

  const previousTeamId = (existing?.picked_team_id as string | undefined) ?? null;
  if (previousTeamId === null) {
    return { previousTeamId: null };
  }

  const { error } = await supabaseAdmin
    .from("third_place_picks")
    .delete()
    .eq("pick_set_id", pickSetId);

  if (error) {
    throw new Error(`Failed to clear 3rd-place pick: ${error.message}`);
  }

  return { previousTeamId };
}
