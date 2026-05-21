import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { TOURNAMENT_ID } from "@/lib/utils/constants";
import type { Group, Team } from "@/types/database";
import { RankingsManager } from "./rankings-manager";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Super-admin · Rankings",
};

/**
 * Super-admin page for editing the FIFA rankings stored on each global
 * team row (teams.pool_id IS NULL).
 *
 * Initial values come from migration 015, a one-time seed of the April
 * 2026 FIFA release. FIFA publishes new rankings approximately four
 * times per year; the workflow is to refresh through this form after
 * each release.
 *
 * We considered auto-fetching from fifa.com but their public surface
 * only embeds 4 highlight cards on the ranking page — the full list is
 * fetched client-side via a request we can't reliably replicate from
 * the server. Every keyed alternative (RapidAPI, Zyla, API-Football)
 * adds dependency surface that isn't justified for a quarterly refresh.
 * The manual workflow at fifa.com → here is ~5 minutes per quarter.
 *
 * Demo pools have their own pool-scoped team rows and aren't touched by
 * this page (matches the precedent set by /super-admin/countries).
 */
export default async function SuperAdminRankingsPage() {
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

  // Bucket by group, with a dedicated bucket for unassigned teams.
  // Within each bucket, sort by current ranking (nulls last) so the
  // strongest team in a group floats to the top — handy when scanning
  // for "did I miss a country in this group" against a FIFA list.
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
  const byRanking = (a: Team, b: Team) => {
    const ar = a.fifa_ranking ?? Number.POSITIVE_INFINITY;
    const br = b.fifa_ranking ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  };
  for (const arr of teamsByGroup.values()) arr.sort(byRanking);
  ungrouped.sort(byRanking);

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
          Global FIFA Rankings
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Edit the men&apos;s FIFA world ranking stored on each team. Pools
          with the FIFA-rankings display flag enabled read these values
          directly.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 text-xs text-[var(--color-text-secondary)] space-y-1.5">
        <p className="font-medium text-[var(--color-text)]">
          How to keep rankings current
        </p>
        <p>
          Initial values are seeded from the April 1, 2026 FIFA release
          (migration 015). FIFA publishes new rankings roughly four times
          per year — check{" "}
          <a
            href="https://inside.fifa.com/fifa-world-ranking/men"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--color-text)]"
          >
            inside.fifa.com/fifa-world-ranking/men
          </a>{" "}
          after each release and edit the changed teams below.
        </p>
        <p>
          Only rows whose value actually changes are written, so it&apos;s
          fine to click <strong>Save Rankings</strong> after touching just
          one or two inputs. Leave a row blank to clear it — the picks
          form simply skips the ranking badge for teams with no value.
        </p>
      </div>

      <RankingsManager
        groups={groups}
        teamsByGroup={teamsByGroup}
        ungrouped={ungrouped}
      />
    </div>
  );
}
