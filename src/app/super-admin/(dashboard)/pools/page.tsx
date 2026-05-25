import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Pool } from "@/types/database";

/**
 * Super-admin Pools list.
 *
 * Previously this content lived at /super-admin/dashboard. That URL is
 * now a tile-grid landing page; the full pools list moved here so the
 * landing stays uncluttered and "Pools" earns its own dedicated route
 * matching the nav structure.
 *
 * The `?created=slug` flash banner (shown after a successful Create
 * New Pool) is rendered here because the create-pool action now
 * redirects to /super-admin/pools?created=… instead of the old
 * /super-admin/dashboard?created=… URL.
 */

interface PoolsPageProps {
  searchParams: Promise<{ created?: string }>;
}

export default async function SuperAdminPoolsPage({
  searchParams,
}: PoolsPageProps) {
  const { created } = await searchParams;

  const { data: pools } = await supabaseAdmin
    .from("pools")
    .select("*")
    .order("is_demo", { ascending: true })
    .order("created_at", { ascending: false });

  const poolList = (pools ?? []) as Pool[];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">All Pools</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {poolList.length} pool{poolList.length !== 1 ? "s" : ""}
          </p>
        </div>

        <Link
          href="/super-admin/pools/new"
          className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 transition-colors"
        >
          + Create New Pool
        </Link>
      </div>

      {created && (
        <div className="rounded-lg border border-pitch-200 bg-pitch-50 px-4 py-3 text-sm text-pitch-800">
          <p className="font-semibold">Pool created.</p>
          <p className="text-pitch-700 mt-0.5">
            &quot;{created}&quot; is live. You&apos;ve been granted admin access —
            head to{" "}
            <Link
              href={`/${created}/admin`}
              className="underline font-medium hover:text-pitch-900"
            >
              /{created}/admin
            </Link>{" "}
            to configure scoring, dates, and whitelist.
          </p>
        </div>
      )}

      {poolList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)]">
            No pools yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
          {poolList.map((pool) => (
            <PoolRow key={pool.id} pool={pool} />
          ))}
        </div>
      )}
    </div>
  );
}

function PoolRow({ pool }: { pool: Pool }) {
  const status: { label: string; color: string } = (() => {
    if (!pool.is_active) return { label: "Inactive", color: "bg-gray-100 text-gray-600" };
    if (pool.is_demo) return { label: "Demo", color: "bg-gold-100 text-gold-700" };
    if (!pool.is_listed) return { label: "Unlisted", color: "bg-gray-100 text-gray-600" };
    return { label: "Active", color: "bg-pitch-100 text-pitch-700" };
  })();

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-raised)] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{pool.name}</p>
          <span
            className={`text-2xs font-medium px-1.5 py-0.5 rounded-full ${status.color}`}
          >
            {status.label}
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono">
          /{pool.slug}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/${pool.slug}/standings`}
          className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-2 py-1 rounded hover:bg-[var(--color-surface-raised)] transition-colors"
        >
          View
        </Link>
        <Link
          href={`/${pool.slug}/admin`}
          className="text-xs font-medium text-pitch-600 hover:text-pitch-700 px-2 py-1 rounded hover:bg-pitch-50 transition-colors"
        >
          Admin →
        </Link>
      </div>
    </div>
  );
}
