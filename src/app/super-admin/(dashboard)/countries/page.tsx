import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { TOURNAMENT_ID } from "@/lib/utils/constants";
import type { Group, Team } from "@/types/database";
import { CountryManager } from "./country-manager";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Super-admin · Countries",
};

export default async function SuperAdminCountriesPage() {
  // Layout gates auth. Query the shared global rows (pool_id IS NULL) for
  // this tournament. Demo pools have their own copies with pool_id set,
  // which are intentionally excluded here.
  const [groupsRes, teamsRes] = await Promise.all([
    supabaseAdmin
      .from("groups")
      .select("*")
      .eq("tournament_id", TOURNAMENT_ID)
      .is("pool_id", null)
      .order("letter"),
    supabaseAdmin
      .from("teams")
      .select("*")
      .eq("tournament_id", TOURNAMENT_ID)
      .is("pool_id", null)
      .order("name"),
  ]);

  const groups = (groupsRes.data ?? []) as Group[];
  const teams = (teamsRes.data ?? []) as Team[];

  // Bucket by group, plus a dedicated bucket for teams with no group.
  const teamsByGroup = new Map<string, Team[]>();
  const ungrouped: Team[] = [];
  for (const team of teams) {
    if (!team.group_id) {
      ungrouped.push(team);
      continue;
    }
    const existing = teamsByGroup.get(team.group_id) ?? [];
    existing.push(team);
    teamsByGroup.set(team.group_id, existing);
  }
  for (const arr of teamsByGroup.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  ungrouped.sort((a, b) => a.name.localeCompare(b.name));

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
          Global Countries
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Edit the shared tournament country list. Changes apply site-wide to
          every real pool.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 text-xs text-[var(--color-text-secondary)] space-y-1">
        <p className="font-medium text-[var(--color-text)]">
          Heads up — these edits are global.
        </p>
        <p>
          Every real pool reads from this data. A typo in a flag code or
          country name will show up in every active pool&apos;s standings,
          picks, and bracket pages until it&apos;s corrected here.
        </p>
        <p>
          Demo pools keep their own private copies and aren&apos;t affected.
          Pool admins of demo pools edit their own data at{" "}
          <span className="font-mono">/{`{slug}`}/admin/countries</span>.
        </p>
      </div>

      <CountryManager
        groups={groups}
        teamsByGroup={teamsByGroup}
        ungrouped={ungrouped}
      />
    </div>
  );
}
