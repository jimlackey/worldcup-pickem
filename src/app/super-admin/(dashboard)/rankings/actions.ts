"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSuperAdminSession } from "@/lib/auth/super-admin-session";
import { logAuditEvent, AuditAction, AuditEntity } from "@/lib/audit";

// ---- Types ----

export type RankingActionResult = {
  success: boolean;
  error?: string;
  message?: string;
};

// ---- Schemas ----

/**
 * One ranking update from the manual edit form. The form posts as
 * repeated fields:
 *   teamId[]=<uuid>&fifaRanking[]=<int or "">
 *
 * An empty `fifaRanking` clears the column (writes NULL); a valid integer
 * 1..250 sets it. The CHECK constraint in migration 014 enforces the same
 * range at the DB level.
 */
const rankingRowSchema = z.object({
  teamId: z.string().uuid(),
  fifaRanking: z
    .union([z.literal(""), z.string()])
    .transform((s) => (s === "" ? null : s))
    .refine(
      (v) => v === null || /^\d+$/.test(v),
      "Rankings must be whole numbers."
    )
    .transform((v) => (v === null ? null : Number(v)))
    .refine(
      (n) => n === null || (n >= 1 && n <= 250),
      "Rankings must be between 1 and 250."
    ),
});

// ---------------------------------------------------------------------------
// Bulk update via the rankings form
// ---------------------------------------------------------------------------

/**
 * Bulk-update FIFA rankings for global teams (teams.pool_id IS NULL).
 *
 * The form posts every team's current ranking value back, even ones that
 * weren't edited. We diff against the existing rows and only WRITE for
 * teams whose value actually changed — so an admin who only edits one
 * row generates one update + one audit entry rather than 48.
 *
 * Auth: super-admin only. Auditable per row (one EDIT_GLOBAL_TEAM_RANKING
 * event per change).
 *
 * Initial values are populated by migration 015 (one-time seed of the
 * April 2026 FIFA release). FIFA publishes new rankings ~4x per year;
 * the workflow is to refresh through this form after each release.
 *
 * Demo pools are NOT touched by this action — they have their own
 * pool-scoped teams rows. If a demo pool admin wants per-demo rankings
 * they can be added to the existing /{slug}/admin/countries surface in a
 * later iteration.
 */
export async function updateRankingsAction(
  _prev: RankingActionResult,
  formData: FormData
): Promise<RankingActionResult> {
  const session = await getSuperAdminSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const teamIds = formData.getAll("teamId");
  const rankings = formData.getAll("fifaRanking");

  if (teamIds.length === 0 || teamIds.length !== rankings.length) {
    return {
      success: false,
      error: "Form data mismatch. Reload the page and try again.",
    };
  }

  // Parse + validate each row. Bail on the first invalid row so the
  // admin gets actionable feedback rather than a partial save.
  const parsedRows: Array<{ teamId: string; fifaRanking: number | null }> = [];
  for (let i = 0; i < teamIds.length; i++) {
    const parsed = rankingRowSchema.safeParse({
      teamId: teamIds[i],
      fifaRanking: rankings[i],
    });
    if (!parsed.success) {
      return {
        success: false,
        error: `Row ${i + 1}: ${parsed.error.issues[0].message}`,
      };
    }
    parsedRows.push(parsed.data);
  }

  // Load current rows so we can diff. Restrict to global rows
  // (pool_id IS NULL) — never let this action touch demo-pool team rows.
  const ids = parsedRows.map((r) => r.teamId);
  const { data: existing } = await supabaseAdmin
    .from("teams")
    .select("id, name, fifa_ranking, pool_id")
    .in("id", ids)
    .is("pool_id", null);

  if (!existing || existing.length === 0) {
    return {
      success: false,
      error: "No global teams found for those IDs.",
    };
  }

  const existingMap = new Map(existing.map((t) => [t.id, t]));

  // Apply each diff. We loop rather than batch upsert because we need a
  // per-row audit entry on actual changes (and 48 rows is fine).
  let updates = 0;
  for (const row of parsedRows) {
    const prev = existingMap.get(row.teamId);
    if (!prev) continue; // skip teams not in the global set
    if (prev.fifa_ranking === row.fifaRanking) continue; // no-op

    const { error } = await supabaseAdmin
      .from("teams")
      .update({ fifa_ranking: row.fifaRanking })
      .eq("id", row.teamId)
      .is("pool_id", null);

    if (error) {
      return {
        success: false,
        error: `Failed to update ${prev.name}: ${error.message}`,
      };
    }

    await logAuditEvent({
      poolId: null,
      actor: { id: null, email: session.email, role: "super_admin" },
      action: AuditAction.EDIT_GLOBAL_TEAM_RANKING,
      entityType: AuditEntity.TEAM,
      entityId: row.teamId,
      oldValue: { fifa_ranking: prev.fifa_ranking, name: prev.name },
      newValue: { fifa_ranking: row.fifaRanking },
    });

    updates++;
  }

  revalidatePath("/super-admin/rankings");
  // Real pools read from the same global rows the picks form renders, so
  // an updated ranking should show up there too. Revalidate broadly.
  revalidatePath("/", "layout");

  return {
    success: true,
    message:
      updates === 0
        ? "No changes to save."
        : `${updates} ranking${updates === 1 ? "" : "s"} updated.`,
  };
}
