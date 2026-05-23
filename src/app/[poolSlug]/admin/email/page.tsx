import { supabaseAdmin } from "@/lib/supabase/server";
import { loadEmailContext, type EmailContext } from "@/lib/email/load-context";
import { expandWidgetsForParticipant } from "@/lib/email/expand-widgets";
import { pickPreviewParticipantId } from "@/lib/email/preview-selection";
import type { Pool } from "@/types/database";
import { EmailForm } from "./email-form";
import type {
  PreviewBundle,
  RecipientOption,
  PerListData,
} from "./email-form";
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
 * Preview workflow:
 *   1. The page pre-renders ONE bundle per recipient list (using the
 *      system-picked sample participant for that list). This is the
 *      bundle shown when the admin first lands on the page, or when
 *      they switch the "Send to" dropdown — no extra round-trip.
 *
 *   2. The preview pane also exposes a per-recipient dropdown showing
 *      every player in the selected list. When the admin picks a
 *      different player, the form calls previewRecipientAction to fetch
 *      that player's bundle on demand, then caches it client-side so
 *      re-selecting is instant.
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

  // ---- Per-list bundle of preview data ----------------------------------
  // For each list we ship the form three things:
  //
  //   1. recipientOptions  — every player in this list, for the
  //                          per-recipient dropdown inside the preview.
  //   2. seedParticipantId — which player to auto-select on entry
  //                          (matches what pickPreviewParticipantId
  //                          chose, so the preview "lands on someone"
  //                          without an extra fetch).
  //   3. seedBundle        — the pre-rendered bundle for that seed
  //                          player. Client cache is seeded with this
  //                          so the first preview render is instant.
  //
  // Iterating RECIPIENT_LIST_VALUES (instead of hand-keying entries)
  // means a new list option only requires extending that const and
  // updating the action's filter branch — the page picks up the new
  // entry automatically.
  const perListData = Object.fromEntries(
    RECIPIENT_LIST_VALUES.map((list) => [list, buildPerListData(ctx, list)])
  ) as Record<RecipientListValue, PerListData>;

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
        perListData={perListData}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-list data builder
// ---------------------------------------------------------------------------

function buildPerListData(
  ctx: EmailContext,
  list: RecipientListValue
): PerListData {
  // Members who'd actually receive this list — same predicates the
  // action uses for the real send. The preview's "who could be a
  // recipient here" must match the send's "who will be a recipient
  // here" exactly, or the admin can preview someone who won't get the
  // mail.
  const membersInList = ctx.activeMembers.filter((m) => {
    if (list === "all") return true;
    const rollup = ctx.rollupByParticipant.get(m.participant_id);
    if (!rollup) return false;
    if (list === "incomplete-group") return rollup.hasGroupIncomplete;
    if (list === "incomplete-knockout") return rollup.hasKnockoutIncomplete;
    return false;
  });

  // recipientOptions for the in-preview dropdown — sorted by email so
  // the admin can scan alphabetically. Includes every member of the
  // list, even ones with zero pick sets (those won't drive an
  // interesting preview, but the admin should still see them as
  // recipients).
  const recipientOptions: RecipientOption[] = membersInList
    .map((m) => ({
      participantId: m.participant_id,
      email: m.participant.email,
      displayName: m.participant.display_name || null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  // For the seed (auto-picked) participant: prefer someone with ≥1 pick
  // set so the widget render is interesting. If nobody in the list has
  // any pick sets, leave the seed null — the preview pane shows the
  // empty-state.
  const candidates = membersInList
    .map((m) => ({
      participantId: m.participant_id,
      pickSetCount:
        ctx.rollupByParticipant.get(m.participant_id)?.pickSets.length ?? 0,
    }))
    .filter((c) => c.pickSetCount > 0);

  const seedParticipantId = pickPreviewParticipantId(candidates);
  const seedBundle = renderBundle(ctx, seedParticipantId);

  return { recipientOptions, seedParticipantId, seedBundle };
}

/**
 * Render the three widgets for one specific participant. Returns an
 * empty bundle (participantName null, all strings empty) when
 * participantId is null OR the participant isn't an active member of
 * the pool — caller renders the empty-state.
 */
function renderBundle(
  ctx: EmailContext,
  participantId: string | null
): PreviewBundle {
  // Single empty-bundle factory so the two null branches stay in sync
  // with PreviewBundle's growing shape.
  const empty: PreviewBundle = {
    participantName: null,
    standingsSummary: "",
    missingGroupPicks: "",
    missingKnockoutPicks: "",
    groupPhasePicks: "",
    knockoutRoundPicks: "",
  };

  if (!participantId) return empty;

  const member = ctx.activeMembers.find(
    (m) => m.participant_id === participantId
  );
  if (!member) return empty;

  const rollup = ctx.rollupByParticipant.get(participantId);
  const widgets = expandWidgetsForParticipant({
    standings: ctx.standings,
    groupMatches: ctx.groupMatches,
    knockoutMatches: ctx.knockoutMatches,
    teamsById: ctx.teamsById,
    knockoutPhaseStarted: ctx.knockoutPhaseStarted,
    participantPickSets: rollup?.pickSets ?? [],
  });

  return {
    participantName:
      member.participant.display_name || member.participant.email || null,
    standingsSummary: widgets.standingsSummary,
    missingGroupPicks: widgets.missingGroupPicks,
    missingKnockoutPicks: widgets.missingKnockoutPicks,
    groupPhasePicks: widgets.groupPhasePicks,
    knockoutRoundPicks: widgets.knockoutRoundPicks,
  };
}
