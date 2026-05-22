import { supabaseAdmin } from "@/lib/supabase/server";
import { loadEmailContext, type EmailContext } from "@/lib/email/load-context";
import { expandWidgetsForParticipant } from "@/lib/email/expand-widgets";
import { pickPreviewParticipantId } from "@/lib/email/preview-selection";
import type { Pool } from "@/types/database";
import { EmailForm } from "./email-form";
import type { PreviewBundle } from "./email-form";
import {
  RECIPIENT_LIST_VALUES,
  type RecipientListValue,
} from "./recipient-lists";

interface EmailPageProps {
  params: Promise<{ poolSlug: string }>;
}

/**
 * Admin → Email
 *
 * Lets a pool admin compose a single broadcast email — subject + body —
 * and send it to a chosen list of active players in the pool.
 *
 * Available recipient lists (see ./recipient-lists.ts):
 *
 *   - all                  : every active player.
 *   - incomplete-group     : players who own at least one pick set with
 *                            an incomplete Group Phase.
 *   - incomplete-knockout  : players who own at least one pick set with
 *                            an incomplete Knockout Phase bracket.
 *
 * Supported body widgets:
 *
 *   {{standings-summary}}
 *      Per-recipient block: each pick set with current rank and points.
 *
 *   {{missing-group-picks}}
 *      Per-recipient block: each pick set with a bulleted list of group
 *      matches the player hasn't picked yet.
 *
 *   {{missing-knockout-picks}}
 *      Per-recipient block: each pick set with a bulleted list of
 *      knockout matches the player hasn't picked yet, scoped to matches
 *      where both teams are determinable (TBDs are skipped).
 *
 * The preview pane renders REAL data, picked from whichever recipient
 * list the admin currently has selected in the dropdown. We pre-compute
 * one PreviewBundle per list on the server so the form can swap
 * instantly when the dropdown changes — no extra round-trip.
 *
 * Authorisation is handled by the parent admin layout, which gates this
 * whole subtree on session.role === "admin".
 */
export default async function AdminEmailPage({ params }: EmailPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;
  const typedPool = pool as Pool;

  // ---- Load the same pool-wide context the action uses ------------------
  // Single source of truth — anything that drifts here would also drift in
  // the real send.
  const ctx = await loadEmailContext(typedPool);

  // ---- Per-list recipient counts ---------------------------------------
  // Drives the inline count next to each option in the dropdown.
  const incompleteGroupCount = ctx.activeMembers.filter(
    (m) => ctx.rollupByParticipant.get(m.participant_id)?.hasGroupIncomplete
  ).length;
  const incompleteKnockoutCount = ctx.activeMembers.filter(
    (m) =>
      ctx.rollupByParticipant.get(m.participant_id)?.hasKnockoutIncomplete
  ).length;

  const recipientCounts: Record<RecipientListValue, number> = {
    all: ctx.activeMembers.length,
    "incomplete-group": incompleteGroupCount,
    "incomplete-knockout": incompleteKnockoutCount,
  };

  // ---- One preview bundle per list ---------------------------------------
  // For each list, narrow the pool to "members in this list" and pick a
  // representative participant (prefer multiple pick sets, fall back to
  // single, empty bundle if the list has nobody with any pick sets). Same
  // pipeline the real send loop uses, so what the admin previews is what
  // a recipient in that list would actually receive.
  //
  // Iterating RECIPIENT_LIST_VALUES (instead of hand-keying the three
  // entries) means adding a new list option only requires extending that
  // const and updating the action's filter branch — this page picks up
  // the new entry automatically.
  const previewBundles = Object.fromEntries(
    RECIPIENT_LIST_VALUES.map((list) => [list, buildPreviewBundle(ctx, list)])
  ) as Record<RecipientListValue, PreviewBundle>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold">
          Email Players
          <span className="text-sm font-normal text-[var(--color-text-muted)] ml-2">
            {recipientCounts.all} active player
            {recipientCounts.all === 1 ? "" : "s"}
          </span>
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Compose a message and choose who receives it. Use widgets like{" "}
          <code className="font-mono text-[var(--color-text-secondary)]">
            {"{{standings-summary}}"}
          </code>{" "}
          to insert per-player data. Preview before sending.
        </p>
      </div>

      <EmailForm
        pool={typedPool}
        recipientCounts={recipientCounts}
        previewBundles={previewBundles}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-list preview-bundle builder
// ---------------------------------------------------------------------------

/**
 * Pick a representative participant from THIS list's membership and
 * render their widget bundle. Returns an empty bundle when the list has
 * no eligible participants.
 */
function buildPreviewBundle(
  ctx: EmailContext,
  list: RecipientListValue
): PreviewBundle {
  // First narrow active members to those who are actually IN this list.
  // We re-use the same predicates the action uses for the real send so
  // the preview's "who could be a recipient here" matches the send's
  // "who will be a recipient here" exactly.
  const membersInList = ctx.activeMembers.filter((m) => {
    if (list === "all") return true;
    const rollup = ctx.rollupByParticipant.get(m.participant_id);
    if (!rollup) return false;
    if (list === "incomplete-group") return rollup.hasGroupIncomplete;
    if (list === "incomplete-knockout") return rollup.hasKnockoutIncomplete;
    return false;
  });

  // Then keep only those who actually have at least one pick set — a
  // participant with zero pick sets technically belongs to the
  // incomplete-* lists (they haven't picked anything!) but can't drive
  // a meaningful preview because the widgets have nothing to render.
  // The preview-selection helper would refuse them anyway; filtering
  // here keeps the candidate count honest.
  const candidates = membersInList
    .map((m) => ({
      participantId: m.participant_id,
      pickSetCount:
        ctx.rollupByParticipant.get(m.participant_id)?.pickSets.length ?? 0,
    }))
    .filter((c) => c.pickSetCount > 0);

  const previewParticipantId = pickPreviewParticipantId(candidates);
  if (!previewParticipantId) {
    return {
      participantName: null,
      standingsSummary: "",
      missingGroupPicks: "",
      missingKnockoutPicks: "",
    };
  }

  const previewMember = ctx.activeMembers.find(
    (m) => m.participant_id === previewParticipantId
  );
  const participantName =
    previewMember?.participant.display_name ||
    previewMember?.participant.email ||
    null;

  const rollup = ctx.rollupByParticipant.get(previewParticipantId);
  const widgets = expandWidgetsForParticipant({
    standings: ctx.standings,
    groupMatches: ctx.groupMatches,
    knockoutMatches: ctx.knockoutMatches,
    teamsById: ctx.teamsById,
    knockoutPhaseStarted: ctx.knockoutPhaseStarted,
    participantPickSets: rollup?.pickSets ?? [],
  });

  return {
    participantName,
    standingsSummary: widgets.standingsSummary,
    missingGroupPicks: widgets.missingGroupPicks,
    missingKnockoutPicks: widgets.missingKnockoutPicks,
  };
}
