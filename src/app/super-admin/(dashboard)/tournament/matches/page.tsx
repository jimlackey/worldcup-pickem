import { getGlobalMatches } from "@/lib/tournament/global-queries";
import { PHASE_LABELS } from "@/lib/utils/constants";
import type { MatchPhase } from "@/types/database";
import { MatchResultForm } from "./match-result-form";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Super-admin · Tournament Matches",
};

/**
 * Super-admin view for entering match results on the canonical global
 * tournament data. Real pools read these rows directly so a single update
 * here is reflected in every real pool's standings immediately.
 *
 * Demo pools have their own pool-scoped match rows and aren't affected
 * by edits here — demo pool admins use /{slug}/admin/matches instead.
 */
export default async function SuperAdminMatchesPage() {
  const matches = await getGlobalMatches();

  const phaseOrder: MatchPhase[] = [
    "group",
    "r32",
    "r16",
    "qf",
    "sf",
    "final",
    "consolation",
  ];

  const grouped = new Map<MatchPhase, typeof matches>();
  for (const phase of phaseOrder) {
    const phaseMatches = matches.filter((m) => m.phase === phase);
    if (phaseMatches.length > 0) grouped.set(phase, phaseMatches);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold">Scores</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Enter match results on the canonical global tournament data. Real
          pools read these rows directly, so a single update here is
          reflected in every real pool&apos;s standings immediately. Demo
          pools have their own pool-scoped match rows and aren&apos;t
          affected by edits here.
        </p>
      </div>

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
                <MatchResultForm key={match.id} match={match} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
