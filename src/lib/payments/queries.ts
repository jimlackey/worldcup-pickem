import { supabaseAdmin } from "@/lib/supabase/server";
import { FINAL_MATCH_NUMBER } from "@/lib/picks/bracket-wiring";

/**
 * Server-side helpers for the per-pool admin payments view.
 *
 * The admin Payments page shows one row per pick set with:
 *   - participant email
 *   - participant display name
 *   - pick set name (a participant may have several)
 *   - the team the player picked to win the Final (or null)
 *   - paid flag
 *   - admin notes
 *
 * Authorization happens in the caller (the admin page checks
 * requirePoolAuth(..., "admin")). These helpers use the service-role
 * client and bypass RLS.
 */

export interface PaymentRow {
  pickSetId: string;
  pickSetName: string;
  participantId: string;
  email: string;
  displayName: string | null;
  /**
   * Team name the player picked to win the Final (match #103). Null
   * if they haven't made that pick yet, or if no team has been
   * assigned to that slot yet — both render as a blank cell.
   */
  winnerTeamName: string | null;
  /**
   * Short three-letter code for the winner team (e.g. "USA"). Useful
   * for the CSV export and the compact mobile layout. Null when
   * winnerTeamName is null.
   */
  winnerTeamCode: string | null;
  isPaid: boolean;
  notes: string;
}

/**
 * Build the full list of payment rows for the pool — one per active
 * pick set. The query fans out three lookups and stitches them in JS
 * because Supabase's relational select doesn't let us combine a
 * "filter to match_number = 103" condition on a nested table with
 * the parent select; doing it in pieces is clearer and still cheap
 * (each is one indexed read).
 *
 * Returns rows in stable order (creation order of the pick sets) so
 * the caller-side sort UI starts from a deterministic baseline.
 */
export async function getPaymentRows(
  poolId: string
): Promise<PaymentRow[]> {
  // 1. All active pick sets in the pool, joined with their participant.
  //    We rely on the existing public_read policies + service role for
  //    access; no RLS gating to worry about here.
  //
  //    Type note: Supabase-js types every nested-select relation as an
  //    array because it can't infer to-one vs to-many from the query
  //    string alone. The `participants` table has `id` as primary key
  //    and `pick_sets.participant_id` is the foreign key, so the
  //    relation is in fact to-one — but the type still lands as `[]`.
  //    Rather than cast through `unknown` to override that (which the
  //    TS compiler now flags as a non-overlapping conversion), we
  //    accept the array shape here and unwrap with `[0]` at the
  //    access site below.
  const { data: pickSetRows } = await supabaseAdmin
    .from("pick_sets")
    .select(
      "id, name, participant_id, created_at, participant:participants(email, display_name)"
    )
    .eq("pool_id", poolId)
    .eq("is_active", true)
    .order("created_at");

  const pickSets = (pickSetRows ?? []) as {
    id: string;
    name: string;
    participant_id: string;
    created_at: string;
    participant: { email: string; display_name: string | null }[];
  }[];

  if (pickSets.length === 0) return [];

  const pickSetIds = pickSets.map((ps) => ps.id);

  // 2. The Final match for this pool. For demo pools, matches are
  //    pool-scoped; for real pools, pool_id IS NULL and the global
  //    canonical row carries match_number 103. The pool layout
  //    distinguishes the two via Pool.is_demo, but for this query we
  //    can lean on the fact that the player's knockout_pick already
  //    references the right pool's matches table — we just need the
  //    match_id of the Final to filter on.
  //
  //    We fetch the candidate Final rows (either the pool-scoped one
  //    or the global one) and pick whichever exists for this pool.
  //    A null result simply means "no Final row yet" and the winnerTeam
  //    cells will all be blank.
  const { data: finalMatchRows } = await supabaseAdmin
    .from("matches")
    .select("id, pool_id")
    .eq("match_number", FINAL_MATCH_NUMBER);

  const finalMatches = (finalMatchRows ?? []) as {
    id: string;
    pool_id: string | null;
  }[];
  // Prefer a pool-scoped Final row (demo pools); fall back to the
  // global one (real pools).
  const finalMatchId =
    finalMatches.find((m) => m.pool_id === poolId)?.id ??
    finalMatches.find((m) => m.pool_id === null)?.id ??
    null;

  // 3. The Final pick for each pick set, joined with the picked team.
  //    Only fires if we found a Final match — otherwise all winner
  //    cells are null anyway.
  const winnerByPickSet = new Map<
    string,
    { name: string; code: string }
  >();

  if (finalMatchId) {
    const { data: koPicks } = await supabaseAdmin
      .from("knockout_picks")
      .select("pick_set_id, picked_team:teams(name, short_code)")
      .in("pick_set_id", pickSetIds)
      .eq("match_id", finalMatchId);

    // Same Supabase-js typing/runtime mismatch as the pick-sets join
    // below — the type says array, the JSON comes back as a single
    // object for to-one relations. Defensive unwrap handles both
    // shapes so the data lands correctly regardless.
    for (const row of (koPicks ?? []) as {
      pick_set_id: string;
      picked_team: { name: string; short_code: string }[];
    }[]) {
      const team = Array.isArray(row.picked_team)
        ? row.picked_team[0]
        : (row.picked_team as
            | { name: string; short_code: string }
            | null
            | undefined);
      if (team) {
        winnerByPickSet.set(row.pick_set_id, {
          name: team.name,
          code: team.short_code,
        });
      }
    }
  }

  // 4. Existing payment rows. Pick sets without a row yet default to
  //    is_paid=false, notes="" (matches the table defaults). This
  //    means we don't need to pre-create payment rows on pick-set
  //    creation; the admin's first toggle/note write is also the
  //    first insert.
  const { data: paymentRows } = await supabaseAdmin
    .from("pool_payments")
    .select("pick_set_id, is_paid, notes")
    .eq("pool_id", poolId);

  const paymentByPickSet = new Map<
    string,
    { is_paid: boolean; notes: string }
  >();
  for (const row of (paymentRows ?? []) as {
    pick_set_id: string;
    is_paid: boolean;
    notes: string;
  }[]) {
    paymentByPickSet.set(row.pick_set_id, {
      is_paid: row.is_paid,
      notes: row.notes,
    });
  }

  // 5. Stitch.
  return pickSets.map((ps) => {
    const payment = paymentByPickSet.get(ps.id);
    const winner = winnerByPickSet.get(ps.id);
    // Supabase-js types every nested-select relation as an array, but
    // for a to-one foreign key the JSON it actually returns at runtime
    // is the single object — not a one-element array. The static type
    // says array (which is why we type it as `[]` above to keep the
    // compiler happy), but `ps.participant[0]` returns `undefined`
    // when the runtime value is a plain object, which manifests as
    // empty email/name cells on the admin Payments page.
    //
    // Handle both shapes defensively so we get correct data regardless
    // of whether supabase-js ever aligns its JSON output with its
    // generated types. The same pattern applies to the picked_team
    // unwrap inside the winner-pick loop above.
    const participant = Array.isArray(ps.participant)
      ? ps.participant[0]
      : (ps.participant as { email: string; display_name: string | null } | null | undefined);
    return {
      pickSetId: ps.id,
      pickSetName: ps.name,
      participantId: ps.participant_id,
      email: participant?.email ?? "",
      displayName: participant?.display_name ?? null,
      winnerTeamName: winner?.name ?? null,
      winnerTeamCode: winner?.code ?? null,
      isPaid: payment?.is_paid ?? false,
      notes: payment?.notes ?? "",
    };
  });
}

/**
 * Upsert paid flag for a pick set. Returns the previous state for
 * the audit-log entry (so the audit row records both old and new).
 *
 * A pick set with no existing payment row is treated as { is_paid:
 * false, notes: "" } for the purposes of the "old value".
 */
export async function setPickSetPaid(
  poolId: string,
  pickSetId: string,
  isPaid: boolean,
  updatedBy: string
): Promise<{ previousPaid: boolean; previousNotes: string }> {
  // Read current state (default to false / "" if no row yet).
  const { data: existing } = await supabaseAdmin
    .from("pool_payments")
    .select("is_paid, notes")
    .eq("pick_set_id", pickSetId)
    .maybeSingle();

  const previousPaid = (existing?.is_paid as boolean | undefined) ?? false;
  const previousNotes = (existing?.notes as string | undefined) ?? "";

  const { error } = await supabaseAdmin.from("pool_payments").upsert(
    {
      pool_id: poolId,
      pick_set_id: pickSetId,
      is_paid: isPaid,
      // Preserve any existing notes — upsert replaces the whole row
      // by default, so we must explicitly carry the current notes
      // through. (Otherwise a paid-toggle would wipe the notes.)
      notes: previousNotes,
      updated_by: updatedBy,
    },
    { onConflict: "pick_set_id" }
  );

  if (error) {
    throw new Error(`Failed to set paid flag: ${error.message}`);
  }

  return { previousPaid, previousNotes };
}

/**
 * Upsert notes for a pick set. Returns the previous notes string for
 * the audit log.
 *
 * Same pattern as setPickSetPaid — read current, write new, preserve
 * the unrelated column.
 */
export async function setPickSetPaymentNotes(
  poolId: string,
  pickSetId: string,
  notes: string,
  updatedBy: string
): Promise<{ previousPaid: boolean; previousNotes: string }> {
  const { data: existing } = await supabaseAdmin
    .from("pool_payments")
    .select("is_paid, notes")
    .eq("pick_set_id", pickSetId)
    .maybeSingle();

  const previousPaid = (existing?.is_paid as boolean | undefined) ?? false;
  const previousNotes = (existing?.notes as string | undefined) ?? "";

  const { error } = await supabaseAdmin.from("pool_payments").upsert(
    {
      pool_id: poolId,
      pick_set_id: pickSetId,
      is_paid: previousPaid,
      notes,
      updated_by: updatedBy,
    },
    { onConflict: "pick_set_id" }
  );

  if (error) {
    throw new Error(`Failed to set payment notes: ${error.message}`);
  }

  return { previousPaid, previousNotes };
}
