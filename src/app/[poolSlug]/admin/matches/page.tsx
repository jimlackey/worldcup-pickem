import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatches } from "@/lib/tournament/queries";
import { PHASE_LABELS } from "@/lib/utils/constants";
import type { Pool, MatchPhase } from "@/types/database";
import { MatchResultForm } from "./match-result-form";

interface MatchesPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function MatchesPage({ params }: MatchesPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;

  const matches = await getMatches(pool as Pool);

  // Group matches by phase
  const phaseOrder: MatchPhase[] = ["group", "r32", "r16", "qf", "sf", "final"];
  const grouped = new Map<MatchPhase, typeof matches>();
  for (const phase of phaseOrder) {
    const phaseMatches = matches.filter((m) => m.phase === phase);
    if (phaseMatches.length > 0) {
      grouped.set(phase, phaseMatches);
    }
  }

  return (
    <div className="space-y-8">
      {phaseOrder.map((phase) => {
        const phaseMatches = grouped.get(phase);
        if (!phaseMatches) return null;

        return (
          <section key={phase}>
            <h2 className="text-lg font-display font-bold mb-3">
              {PHASE_LABELS[phase]}
              <span className="text-sm font-normal text-[var(--color-text-muted)] ml-2">
                {phaseMatches.filter((m) => m.status === "completed").length}/
                {phaseMatches.length} completed
              </span>
            </h2>

            <div className="space-y-2">
              {phaseMatches.map((match) => (
                <MatchResultForm
                  key={match.id}
                  match={match}
                  poolId={pool.id}
                  poolSlug={poolSlug}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
