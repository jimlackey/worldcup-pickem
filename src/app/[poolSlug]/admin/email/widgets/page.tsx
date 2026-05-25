import { supabaseAdmin } from "@/lib/supabase/server";
import { loadEmailContext, type EmailContext } from "@/lib/email/load-context";
import { pickPreviewParticipantId } from "@/lib/email/preview-selection";
import { getCustomWidgetsForPool } from "@/lib/email/custom-widgets";
import { buildRecipientTemplateData } from "@/lib/email/recipient-data";
import type { CustomEmailWidget, Pool } from "@/types/database";
import { WidgetsManager } from "./widgets-manager";
import type {
  PreviewBundle,
  RecipientOption,
  PerListData,
} from "../email-form";
import {
  RECIPIENT_LIST_VALUES,
  type RecipientListValue,
} from "../recipient-lists";

interface WidgetsPageProps {
  params: Promise<{ poolSlug: string }>;
}

/**
 * Admin → Email → Manage Widgets
 *
 * Lets pool admins create / edit / delete custom HTML widgets that can
 * be inserted into broadcast emails as `{{slug}}`. The widgets sit
 * alongside the code-defined built-ins (standings-summary, missing-
 * picks, etc.) — both are spread into the same html token bucket the
 * email body renderer consumes.
 *
 * The Preview panel mirrors the Send Email page's preview down to the
 * "Preview As" recipient picker, so when an admin authors a widget that
 * embeds a built-in widget by reference (e.g. their custom widget HTML
 * includes `{{standings-summary}}` inline) they can see it expanded
 * against a real recipient. To make that work, this page does the same
 * loadEmailContext / per-list bundle work as the Send Email page so the
 * client component receives identical preview data.
 *
 * Authorisation flows through the parent admin layout — admin only.
 */
export default async function ManageWidgetsPage({ params }: WidgetsPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;
  const typedPool = pool as Pool;

  // ---- Load the same context the Send Email page does -----------------
  // The preview pane here is identical to the Send Email pane: same
  // envelope (From/To/Subject), same Preview As recipient picker, same
  // server-side render of the built-in widgets. The only difference is
  // what's BEING previewed — a single widget HTML body rather than a
  // freeform composed email.
  const ctx = await loadEmailContext(typedPool);

  const incompleteGroupCount = ctx.activeMembers.filter(
    (m) => ctx.rollupByParticipant.get(m.participant_id)?.hasGroupIncomplete
  ).length;
  const incompleteKnockoutCount = ctx.activeMembers.filter(
    (m) =>
      ctx.rollupByParticipant.get(m.participant_id)?.hasKnockoutIncomplete
  ).length;
  const unpaidPickSetCount = ctx.activeMembers.filter(
    (m) => ctx.rollupByParticipant.get(m.participant_id)?.hasUnpaidPickSet
  ).length;

  const recipientCounts: Record<RecipientListValue, number> = {
    all: ctx.activeMembers.length,
    "incomplete-group": incompleteGroupCount,
    "incomplete-knockout": incompleteKnockoutCount,
    "unpaid-pickset": unpaidPickSetCount,
  };

  const perListData = Object.fromEntries(
    RECIPIENT_LIST_VALUES.map((list) => [
      list,
      buildPerListData(ctx, list, typedPool.name),
    ])
  ) as Record<RecipientListValue, PerListData>;

  // ---- This pool's existing custom widgets -----------------------------
  const widgets = await getCustomWidgetsForPool(typedPool.id);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold">
          Manage Email Widgets
          <span className="text-sm font-normal text-[var(--color-text-muted)] ml-2">
            {widgets.length} custom widget{widgets.length === 1 ? "" : "s"}
          </span>
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Define reusable HTML snippets that you can insert into emails
          as <code className="font-mono text-[var(--color-text-secondary)]">{"{{slug}}"}</code>.
          Built-in widgets like{" "}
          <code className="font-mono text-[var(--color-text-secondary)]">{"{{standings-summary}}"}</code>{" "}
          can be referenced inside your custom HTML and will expand per
          recipient when an email is sent.
        </p>
      </div>

      <WidgetsManager
        pool={typedPool}
        widgets={widgets as CustomEmailWidget[]}
        recipientCounts={recipientCounts}
        perListData={perListData}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-list data builder
//
// Verbatim copy of the helper in ../page.tsx (Send Email). Duplicated
// here because both pages need this server-side projection and pulling
// it into a shared module would require the EmailContext type, the
// preview-selection helper, AND the PerListData types to all migrate to
// a neutral location — more churn than the small duplication warrants.
//
// If a third caller emerges, fold both copies into a sibling helper
// module under src/app/[poolSlug]/admin/email/.
// ---------------------------------------------------------------------------

function buildPerListData(
  ctx: EmailContext,
  list: RecipientListValue,
  poolName: string
): PerListData {
  const membersInList = ctx.activeMembers.filter((m) => {
    if (list === "all") return true;
    const rollup = ctx.rollupByParticipant.get(m.participant_id);
    if (!rollup) return false;
    if (list === "incomplete-group") return rollup.hasGroupIncomplete;
    if (list === "incomplete-knockout") return rollup.hasKnockoutIncomplete;
    if (list === "unpaid-pickset") return rollup.hasUnpaidPickSet;
    return false;
  });

  const recipientOptions: RecipientOption[] = membersInList
    .map((m) => ({
      participantId: m.participant_id,
      email: m.participant.email,
      displayName: m.participant.display_name || null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  const candidates = membersInList
    .map((m) => ({
      participantId: m.participant_id,
      pickSetCount:
        ctx.rollupByParticipant.get(m.participant_id)?.pickSets.length ?? 0,
    }))
    .filter((c) => c.pickSetCount > 0);

  const seedParticipantId = pickPreviewParticipantId(candidates);
  const seedBundle = renderBundle(ctx, seedParticipantId, poolName);

  return { recipientOptions, seedParticipantId, seedBundle };
}

function renderBundle(
  ctx: EmailContext,
  participantId: string | null,
  poolName: string
): PreviewBundle {
  const empty: PreviewBundle = {
    participantName: null,
    templateData: null,
  };

  if (!participantId) return empty;

  const member = ctx.activeMembers.find(
    (m) => m.participant_id === participantId
  );
  if (!member) return empty;

  const rollup = ctx.rollupByParticipant.get(participantId);
  const participantName =
    member.participant.display_name || member.participant.email || null;

  const templateData = buildRecipientTemplateData({
    ctx,
    participantId,
    rollup: { pickSets: rollup?.pickSets ?? [] },
    recipientName: participantName ?? member.participant.email,
    recipientEmail: member.participant.email,
    poolName,
  });

  return {
    participantName,
    templateData,
  };
}
