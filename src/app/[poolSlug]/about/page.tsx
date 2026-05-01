import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatches, getScoringConfig } from "@/lib/tournament/queries";
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

  // Fetch matches and scoring in parallel. Matches give us the per-phase
  // date ranges; scoring gives us the per-phase point values.
  const [matches, scoring] = await Promise.all([
    getMatches(typedPool),
    getScoringConfig(pool.id),
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

  return (
    <AboutView
      pool={typedPool}
      groupRangeStart={groupRange.start}
      groupRangeEnd={groupRange.end}
      knockoutRangeStart={knockoutRange.start}
      knockoutRangeEnd={knockoutRange.end}
      scoring={scoringRows}
    />
  );
}
