import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatches, getScoringConfig } from "@/lib/tournament/queries";
import { getPaymentConfig } from "@/lib/payments/config-queries";
import { getAboutPayoutCounts } from "@/lib/payments/about-payout-summary";
import { isGroupPhaseOpen } from "@/lib/picks/validation";
import { PHASE_LABELS, DEFAULT_SCORING } from "@/lib/utils/constants";
import type { Pool, MatchPhase, MatchWithTeams } from "@/types/database";
import { AboutView } from "./about-view";

interface AboutPageProps {
  params: Promise<{ poolSlug: string }>;
}

/**
 * Compute the earliest and latest scheduled_at across a set of matches.
 * Returns nulls if the set is empty or no matches have a scheduled time.
 */
function dateRange(matches: MatchWithTeams[]): {
  start: string | null;
  end: string | null;
} {
  const stamps = matches
    .map((m) => m.scheduled_at)
    .filter((s): s is string => !!s)
    .map((s) => new Date(s).getTime())
    .filter((t) => !Number.isNaN(t));

  if (stamps.length === 0) return { start: null, end: null };

  const min = Math.min(...stamps);
  const max = Math.max(...stamps);

  return {
    start: new Date(min).toISOString(),
    end: new Date(max).toISOString(),
  };
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) notFound();
  const typedPool = pool as Pool;

  // Fetch matches, scoring, payment config, and the per-pool paid /
  // consolation-pick counts in parallel. The payment config + counts
  // drive the new Payout grid (entry-fee pot, per-place payouts,
  // optional consolation pot row). All four reads are pool-scoped
  // and cheap.
  const [matches, scoring, paymentConfig, payoutCounts] = await Promise.all([
    getMatches(typedPool),
    getScoringConfig(pool.id),
    getPaymentConfig(pool.id),
    getAboutPayoutCounts(pool.id),
  ]);

  // Group matches by phase so we can compute date ranges per stage.
  const groupMatches = matches.filter((m) => m.phase === "group");
  const knockoutMatches = matches.filter((m) => m.phase !== "group");

  const groupRange = dateRange(groupMatches);
  const knockoutRange = dateRange(knockoutMatches);

  // Per-phase scoring rows. Includes the consolation phase only when the
  // pool has the consolation match enabled — when it's off, players never
  // score consolation points so showing the row would be misleading. We
  // fall back to DEFAULT_SCORING for any phase missing from scoring_config.
  const phases: MatchPhase[] = ["group", "r32", "r16", "qf", "sf", "final"];
  if (typedPool.consolation_match_enabled) {
    phases.push("consolation");
  }
  const scoringRows = phases.map((phase) => ({
    phase,
    label: PHASE_LABELS[phase],
    points: scoring[phase] ?? DEFAULT_SCORING[phase],
  }));

  // The amount column in the Payout grid only renders once the group
  // phase has locked — the spec says the percentages are visible
  // beforehand but the dollar figures are not. Computed here (server-
  // side) rather than in AboutView so the component stays a pure
  // presentational tree without time-of-day dependencies.
  const groupLocked = !isGroupPhaseOpen(typedPool);

  return (
    <AboutView
      pool={typedPool}
      groupRangeStart={groupRange.start}
      groupRangeEnd={groupRange.end}
      knockoutRangeStart={knockoutRange.start}
      knockoutRangeEnd={knockoutRange.end}
      scoring={scoringRows}
      paymentConfig={paymentConfig}
      paidPickSetCount={payoutCounts.paidCount}
      consolationPickCount={payoutCounts.consolationPickCount}
      groupLocked={groupLocked}
    />
  );
}
