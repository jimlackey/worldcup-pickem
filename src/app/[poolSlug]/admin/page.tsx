import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";
// Date display uses the app-wide helper so this page renders the same
// DD/MM/YYYY format as the rest of the app (was toLocaleDateString()
// which produced US-style M/D/YYYY).
import { formatPacificDate } from "@/lib/utils/dates";

interface AdminOverviewProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function AdminOverview({ params }: AdminOverviewProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;

  // Real pools share global tournament data; demo pools have their own
  // copies. This flag controls (a) whether the per-pool Matches/Bracket
  // tiles appear in the quick-link grid, and (b) whether we show the
  // explanatory info card pointing real-pool admins to super-admin.
  const isDemo = Boolean(pool.is_demo);

  // Stats — completed/total group matches still read pool-scoped vs
  // global based on the pool's flag, just like the rest of the app's
  // tournament data fetches.
  const poolFilter = isDemo ? `pool_id.eq.${pool.id}` : "pool_id.is.null";

  const [members, pickSets, completedMatches, totalGroupMatches] =
    await Promise.all([
      supabaseAdmin
        .from("pool_memberships")
        .select("*", { count: "exact", head: true })
        .eq("pool_id", pool.id)
        .eq("is_active", true),
      supabaseAdmin
        .from("pick_sets")
        .select("*", { count: "exact", head: true })
        .eq("pool_id", pool.id)
        .eq("is_active", true),
      supabaseAdmin
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed")
        .eq("phase", "group")
        .or(poolFilter),
      supabaseAdmin
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("phase", "group")
        .or(poolFilter),
    ]);

  const stats = [
    { label: "Members", value: members.count ?? 0 },
    { label: "Pick Sets", value: pickSets.count ?? 0 },
    {
      label: "Group Matches",
      value: `${completedMatches.count ?? 0} / ${totalGroupMatches.count ?? 0}`,
    },
    {
      label: "Group Lock",
      // formatPacificDate returns null when the column is empty, so the
      // "Not set" fallback handles both the missing-data case and the
      // never-rare "the date string was somehow malformed" case.
      value: formatPacificDate(pool.group_lock_at) ?? "Not set",
    },
    {
      label: "Knockout",
      value: pool.knockout_open_at ? "Open" : "Not open",
    },
  ];

  // Tournament-management tiles only appear for demo pools — real pools
  // route those operations through the super-admin tournament surface.
  // The non-tournament tiles (Countries, Players, Settings, CSV, Audit)
  // apply equally to both kinds of pool and are always shown.
  type QuickLink = {
    href: string;
    label: string;
    description: string;
    demoOnly?: boolean;
  };

  const quickLinks: QuickLink[] = [
    {
      href: `/${poolSlug}/admin/matches`,
      label: "Enter Match Results",
      description: "Update scores and results for completed matches",
      demoOnly: true,
    },
    {
      href: `/${poolSlug}/admin/knockout-setup`,
      label: "Knockout Bracket Setup",
      description: "Assign teams to knockout round slots",
      demoOnly: true,
    },
    {
      href: `/${poolSlug}/admin/countries`,
      label: "Manage Countries",
      description: "Edit country names, short codes, and flag codes by group",
      demoOnly: true,
    },
    {
      href: `/${poolSlug}/admin/players`,
      label: "Manage Players",
      description: "View participants, edit pick sets, manage access",
    },
    // Payments tile sits next to Players on the grid because both deal
    // with the people in the pool, and admins typically alternate
    // between toggling paid status and looking up someone's picks.
    {
      href: `/${poolSlug}/admin/payments`,
      label: "Payments",
      description: "Track paid/unpaid per pick set, add notes, export CSV",
    },
    {
      href: `/${poolSlug}/admin/whitelist`,
      label: "Email Whitelist",
      description: "Manage which emails are allowed to join this pool",
    },
    // Broadcast email composer. Sits between Whitelist and Settings on the
    // tile grid for the same reason it sits there on the nav — both
    // Whitelist and Email are "talk to the players" operations.
    {
      href: `/${poolSlug}/admin/email`,
      label: "Email Active Players",
      description: "Send a broadcast message with optional standings widget",
    },
    {
      href: `/${poolSlug}/admin/settings`,
      label: "Pool Settings",
      description: "Scoring, lock dates, display preferences",
    },
    {
      href: `/${poolSlug}/admin/csv-import`,
      label: "CSV Import",
      description: "Bulk import picks from CSV file",
    },
    {
      href: `/${poolSlug}/admin/audit-log`,
      label: "Audit Log",
      description: "View all changes made to this pool",
    },
  ];

  const visibleLinks = quickLinks.filter((l) => !l.demoOnly || isDemo);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <p className="text-xs text-[var(--color-text-muted)] font-medium">
              {stat.label}
            </p>
            <p className="text-lg font-bold mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Info card for real pools: clarifies that tournament data — match
          scores, the knockout bracket, and the team roster — is managed
          centrally and not from this admin surface. The pool admins who
          land here don't necessarily know who the super-admin is, so we
          keep the wording neutral. */}
      {!isDemo && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 text-xs text-[var(--color-text-secondary)] space-y-1">
          <p className="font-medium text-[var(--color-text)]">
            Tournament data is managed centrally.
          </p>
          <p>
            Match scores, the knockout bracket, and the country roster are
            entered once by a super-admin and shared across every real
            pool. As pool admin you manage everything specific to this
            pool — players, scoring, CSV imports, and the audit log —
            from the tiles below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-pitch-400 hover:shadow-sm transition-all"
          >
            <h3 className="font-semibold text-sm">{link.label}</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
