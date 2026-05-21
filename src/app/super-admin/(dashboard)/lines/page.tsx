import Link from "next/link";
import { PHASE_LABELS } from "@/lib/utils/constants";
import type { MatchPhase, MatchWithTeams } from "@/types/database";
import { getGlobalMatchesForLines } from "./actions";
import { MatchLineRow } from "./match-line-row";
import { FetchLinesButton } from "./fetch-lines-button";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Super-admin · Match Lines",
};

/**
 * Super-admin page for editing money lines stored on each global match
 * row. Lines are tournament-level facts (Mexico vs South Africa has the
 * same opening line in every pool), so editing them once here propagates
 * to every pool — real pools read the global row directly, demo pools
 * receive a copy via the sync helper.
 *
 * Two ways to populate values:
 *
 *   1. "Fetch from The Odds API" — bulk-pulls lines for every World Cup
 *      match. Hidden unless THE_ODDS_API_KEY is set on the server. The
 *      action reports matched/unmatched counts plus how many demo-pool
 *      rows the propagation touched.
 *
 *   2. Manual edit — one inline 3-field editor per match row, expanded
 *      by clicking the row.
 *
 * Pool admins no longer have a line-editing surface; this page replaces
 * the old /{slug}/admin/matches "Match Lines" section.
 */
export default async function SuperAdminLinesPage() {
  const matches = (await getGlobalMatchesForLines()) as MatchWithTeams[];

  const phaseOrder: MatchPhase[] = [
    "group",
    "r32",
    "r16",
    "qf",
    "sf",
    "final",
    "consolation",
  ];

  const grouped = new Map<MatchPhase, MatchWithTeams[]>();
  for (const phase of phaseOrder) {
    const phaseMatches = matches.filter((m) => m.phase === phase);
    if (phaseMatches.length > 0) grouped.set(phase, phaseMatches);
  }

  // Surface the fetch button only when the server has a key configured.
  // We check on the server (this is a server component) so the rendered
  // client tree never includes a button that can't work.
  const hasOddsApiKey = Boolean(process.env.THE_ODDS_API_KEY);

  // Counts for the page header — tells the admin at a glance how many
  // matches have full lines on file.
  const totalWithAnyLine = matches.filter(
    (m) =>
      m.home_money_line != null ||
      m.draw_money_line != null ||
      m.away_money_line != null
  ).length;
  const totalWithAllThreeLines = matches.filter(
    (m) =>
      m.home_money_line != null &&
      m.draw_money_line != null &&
      m.away_money_line != null
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/super-admin/dashboard"
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
        >
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-display font-bold mt-2">
          Global Match Lines
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Edit the money lines stored on each match. Pools with the match-
          lines display flag enabled read these values directly.{" "}
          <span className="text-[var(--color-text-muted)]">
            {totalWithAllThreeLines}/{matches.length} matches have all three
            lines, {totalWithAnyLine}/{matches.length} have any line.
          </span>
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 text-xs text-[var(--color-text-secondary)] space-y-1.5">
        <p className="font-medium text-[var(--color-text)]">
          Heads up — these edits are global.
        </p>
        <p>
          Every real pool reads from this data and every demo pool
          receives a propagated copy. A wrong line entered here will show
          up across every active pool until corrected.
        </p>
        <p>
          Pool admins no longer have a per-pool line-editing surface — if
          a specific pool needs different lines, surface the request and
          we&apos;ll either fix the data here or add a pool-level
          override.
        </p>
      </div>

      {hasOddsApiKey && <FetchLinesButton />}

      {phaseOrder.map((phase) => {
        const phaseMatches = grouped.get(phase);
        if (!phaseMatches) return null;

        // Within each phase, count how many already have lines so the
        // section header gives a quick progress signal.
        const haveAllLines = phaseMatches.filter(
          (m) =>
            m.home_money_line != null &&
            m.draw_money_line != null &&
            m.away_money_line != null
        ).length;

        return (
          <section key={phase}>
            <h2 className="text-lg font-display font-bold mb-3">
              {PHASE_LABELS[phase]}
              <span className="text-sm font-normal text-[var(--color-text-muted)] ml-2">
                {haveAllLines}/{phaseMatches.length} fully populated
              </span>
            </h2>
            <div className="space-y-2">
              {phaseMatches.map((match) => (
                <MatchLineRow key={match.id} match={match} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
