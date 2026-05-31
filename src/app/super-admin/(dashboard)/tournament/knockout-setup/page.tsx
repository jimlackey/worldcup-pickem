import {
  getGlobalGroups,
  getGlobalMatches,
  getGlobalTeams,
} from "@/lib/tournament/global-queries";
import { KnockoutSetupForm } from "./knockout-setup-form";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Super-admin · Knockout Setup",
};

/**
 * Super-admin view for assigning teams to the global knockout bracket. The
 * R32 slots are the only ones that take manual input — once the R32 round
 * is wired, the score-entry page auto-advances winners through R16 → QF →
 * SF → Final (and feeds SF losers into the consolation match).
 *
 * Demo pools have their own pool-scoped knockout bracket and use the
 * per-pool /admin/knockout-setup page.
 */
export default async function SuperAdminKnockoutSetupPage() {
  const [matches, teams, groups] = await Promise.all([
    getGlobalMatches(),
    getGlobalTeams(),
    getGlobalGroups(),
  ]);

  const knockoutMatches = matches.filter((m) => m.phase !== "group");

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Assign teams to each knockout slot after the group phase completes.
        Real pools read this bracket directly — assignments here propagate
        to every real pool immediately.
      </p>

      <KnockoutSetupForm
        matches={knockoutMatches}
        teams={teams}
        groups={groups}
      />
    </div>
  );
}
