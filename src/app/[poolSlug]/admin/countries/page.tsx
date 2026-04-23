import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getGroups, getTeams } from "@/lib/tournament/queries";
import type { Pool } from "@/types/database";
import { CountryManager } from "./country-manager";

interface CountriesPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function CountriesPage({ params }: CountriesPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;

  const typedPool = pool as Pool;

  const [groups, teams] = await Promise.all([
    getGroups(typedPool),
    getTeams(typedPool),
  ]);

  // Group teams by group_id for rendering. Teams without a group are
  // surfaced in their own bucket so admins can still fix them.
  const teamsByGroup = new Map<string, typeof teams>();
  const ungrouped: typeof teams = [];
  for (const team of teams) {
    if (!team.group_id) {
      ungrouped.push(team);
      continue;
    }
    const existing = teamsByGroup.get(team.group_id) ?? [];
    existing.push(team);
    teamsByGroup.set(team.group_id, existing);
  }

  // Stable alphabetical-by-name order within each group.
  for (const arr of teamsByGroup.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  ungrouped.sort((a, b) => a.name.localeCompare(b.name));

  // Real pools all share the same global team rows. Letting pool admins
  // mutate those would affect every other pool, so real-pool admins get a
  // read-only view here and must go to /super-admin/countries to make
  // edits (enforced by the server action too).
  const readOnly = !typedPool.is_demo;

  return (
    <div className="space-y-4">
      {readOnly ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 text-sm space-y-1">
          <p className="font-medium">
            Countries in this pool are read-only.
          </p>
          <p className="text-[var(--color-text-secondary)]">
            This pool uses the shared global tournament data. Country name,
            short code, and flag code edits are site-wide and must be made
            by a super-admin at{" "}
            <Link
              href="/super-admin/countries"
              className="underline font-medium hover:text-[var(--color-text)]"
            >
              /super-admin/countries
            </Link>
            .
          </p>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Edit each country&apos;s display name, 3-letter short code, and flag
          code. Changes apply everywhere that country is shown — standings,
          picks, matches, and the bracket.
        </p>
      )}

      <CountryManager
        groups={groups}
        teamsByGroup={teamsByGroup}
        ungrouped={ungrouped}
        poolId={pool.id}
        poolSlug={poolSlug}
        readOnly={readOnly}
      />
    </div>
  );
}
