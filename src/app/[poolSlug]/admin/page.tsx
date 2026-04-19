import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";

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

  // Gather stats
  const poolFilter = pool.is_demo ? `pool_id.eq.${pool.id}` : "pool_id.is.null";

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
      value: pool.group_lock_at
        ? new Date(pool.group_lock_at).toLocaleDateString()
        : "Not set",
    },
    {
      label: "Knockout",
      value: pool.knockout_open_at ? "Open" : "Not open",
    },
  ];

  const quickLinks = [
    {
      href: `/${poolSlug}/admin/matches`,
      label: "Enter Match Results",
      description: "Update scores and results for completed matches",
    },
    {
      href: `/${poolSlug}/admin/knockout-setup`,
      label: "Knockout Bracket Setup",
      description: "Assign teams to knockout round slots",
    },
    {
      href: `/${poolSlug}/admin/players`,
      label: "Manage Players",
      description: "View participants, edit pick sets, manage access",
    },
    {
      href: `/${poolSlug}/admin/settings`,
      label: "Pool Settings",
      description: "Scoring, lock dates, whitelist",
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {quickLinks.map((link) => (
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
