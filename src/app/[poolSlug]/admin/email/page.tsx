import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolMembers } from "@/lib/pool/queries";
import { buildPreviewStandingsSummary } from "@/lib/email/standings-summary";
import type { Pool } from "@/types/database";
import { EmailForm } from "./email-form";

interface EmailPageProps {
  params: Promise<{ poolSlug: string }>;
}

/**
 * Admin → Email
 *
 * Lets a pool admin compose a single broadcast email — subject + body —
 * and send it to every active player in the pool.
 *
 * The body supports a small set of "widget" tokens, currently:
 *
 *   {{standings-summary}}
 *      → expands to a per-recipient block listing each of that
 *        recipient's pick sets with their current standing, group-
 *        phase progress, and knockout-phase progress. The format is
 *        plain text so it survives across mail clients.
 *
 * The page renders a live preview using dummy data so the admin can
 * see the exact format every player will receive before pressing
 * "Send". Real expansion is done per-recipient in the server action.
 *
 * Authorisation is handled by the admin layout, which already gates
 * this entire subtree on session.role === "admin".
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

  // Count only — we don't need the full member list on this page, but
  // the count tells the admin how many emails they're about to send.
  const members = await getPoolMembers(typedPool.id);
  const activeCount = members.filter(
    (m) =>
      m.is_active &&
      m.participant.is_active !== false &&
      m.participant.email &&
      m.participant.email.length > 0
  ).length;

  // Pre-computed once on the server so the preview pane on initial
  // render matches what real recipients will see for the widget. The
  // client form recomputes nothing for the preview — it just renders
  // this string wherever {{standings-summary}} appears in the body.
  const previewStandingsSummary = buildPreviewStandingsSummary();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold">
          Email Active Players
          <span className="text-sm font-normal text-[var(--color-text-muted)] ml-2">
            {activeCount} recipient{activeCount === 1 ? "" : "s"}
          </span>
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Compose a message that goes to every active player in this pool.
          Use widgets like{" "}
          <code className="font-mono text-[var(--color-text-secondary)]">
            {"{{standings-summary}}"}
          </code>{" "}
          to insert per-player data. Preview before sending.
        </p>
      </div>

      <EmailForm
        pool={typedPool}
        activeRecipientCount={activeCount}
        previewStandingsSummary={previewStandingsSummary}
      />
    </div>
  );
}
