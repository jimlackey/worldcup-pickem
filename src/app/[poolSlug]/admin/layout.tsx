import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePoolAuth } from "@/lib/auth/middleware";
import { AdminNav } from "./admin-nav";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ poolSlug: string }>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) {
    return <p>Pool not found.</p>;
  }

  // Gate: must be admin
  await requirePoolAuth(pool.id, pool.slug, "admin");

  // Pool-level Matches and Knockout Setup pages only make sense for demo
  // pools — real pools share the global tournament data managed by the
  // super-admin at /super-admin/tournament/*. The nav (and the dashboard's
  // quick-link grid) hides those entries for real pools. The actions
  // themselves also refuse to write to non-pool-scoped rows, so even if a
  // real-pool admin reaches the URL directly the action will reject.
  const isDemo = Boolean(pool.is_demo);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Admin Panel</h1>
      </div>
      <AdminNav poolSlug={poolSlug} isDemo={isDemo} />
      {children}
    </div>
  );
}
