import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Super-admin landing page.
 *
 * Previously this URL rendered the full Pools list. The list has been
 * moved to /super-admin/pools so this page can serve as a true
 * landing — five tiles, one per top-level super-admin section,
 * mirroring the nav strip in the layout. Same destinations, two
 * different ways of getting there.
 *
 * Each tile shows a count or small status hint where there's something
 * cheap to surface (pool count, demo-pool count, tournament progress).
 * The data fetches are all `head: true` count queries — no full row
 * reads, so the page stays light even with hundreds of pools or
 * thousands of matches.
 */

interface DashboardPageProps {
  searchParams: Promise<{ created?: string }>;
}

interface TileSection {
  href: string;
  label: string;
  description: string;
  /** Optional small text under the description — e.g. "3 active pools". */
  hint?: string;
}

export default async function SuperAdminDashboardPage({
  searchParams,
}: DashboardPageProps) {
  // The `?created=slug` flash banner used to render here back when the
  // dashboard WAS the pools list and the create-pool action redirected
  // straight to it. After splitting the list out to /super-admin/pools
  // that flash now lives over there. We intentionally do NOT honor a
  // `?created` query param at this URL anymore — if it shows up
  // (e.g. someone bookmarked the old redirect), we ignore it rather
  // than misleadingly flashing a banner outside the pools list.
  void searchParams;

  // Lightweight counts. Each is a head:true query so we only pull a
  // count, not rows. All fire in parallel.
  const [poolsCount, demoPoolsCount, matchesCompletedCount, totalMatchesCount] =
    await Promise.all([
      supabaseAdmin
        .from("pools")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      supabaseAdmin
        .from("pools")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_demo", true),
      // Global (non-demo) tournament matches only — pool-scoped matches
      // live on demo pools and aren't relevant to the super-admin's
      // tournament-management surface.
      supabaseAdmin
        .from("matches")
        .select("*", { count: "exact", head: true })
        .is("pool_id", null)
        .eq("status", "completed"),
      supabaseAdmin
        .from("matches")
        .select("*", { count: "exact", head: true })
        .is("pool_id", null),
    ]);

  const totalPools = poolsCount.count ?? 0;
  const demoPools = demoPoolsCount.count ?? 0;
  const realPools = totalPools - demoPools;

  const completed = matchesCompletedCount.count ?? 0;
  const totalMatches = totalMatchesCount.count ?? 0;

  const sections: TileSection[] = [
    {
      href: "/super-admin/pools",
      label: "Pools",
      description: "Create new pools, view existing pools, and jump into per-pool admin",
      hint:
        totalPools === 0
          ? "No pools yet"
          : `${realPools} real · ${demoPools} demo`,
    },
    {
      href: "/super-admin/tournament/matches",
      label: "Tournament",
      description: "Enter match scores and assign teams to the knockout bracket",
      hint:
        totalMatches === 0
          ? undefined
          : `${completed} / ${totalMatches} matches completed`,
    },
    {
      href: "/super-admin/rankings",
      label: "Rankings",
      description: "Manage FIFA-style team rankings shown alongside picks",
    },
    {
      href: "/super-admin/lines",
      label: "Lines",
      description: "Edit moneylines and totals shown on the match list",
    },
    {
      href: "/super-admin/countries",
      label: "Countries",
      description: "Edit team names, short codes, and flag codes in the global roster",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Super-admin</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Manage tournament-wide data and pools.
        </p>
      </div>

      {/* Tile grid. Two columns on sm+, one on mobile — same shape the
          pool admin overview uses for its quick-links so the two
          surfaces feel like siblings.

          Hover treatment matches the pool-admin tiles: subtle border
          tint + a slight shadow on hover. Each tile is one big <Link>
          so the entire surface is clickable. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-pitch-400 hover:shadow-sm transition-all"
          >
            <h3 className="font-semibold text-sm">{section.label}</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {section.description}
            </p>
            {section.hint && (
              <p className="text-2xs text-[var(--color-text-muted)] mt-2 tabular-nums">
                {section.hint}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
