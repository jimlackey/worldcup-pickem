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
 *
 * Used to derive the date *range* shown for each tournament stage on the
 * About page. The pool's lock dates (group_lock_at, knockout_open_at,
 * knockout_lock_at) tell us when picking opens/closes; the actual match
 * schedules tell us when each round of games is played.
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

  // Per-phase scoring: fall back to defaults if a row is missing for any
  // phase (e.g. a brand-new pool that hasn't had initialize_pool_scoring
  // run yet). The user-facing copy on this page should never be blank.
  const phases: MatchPhase[] = ["group", "r32", "r16", "qf", "sf", "final"];
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
