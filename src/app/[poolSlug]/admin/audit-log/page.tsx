import { supabaseAdmin } from "@/lib/supabase/server";
import { AuditLogTable } from "./audit-log-table";

interface AuditLogPageProps {
  params: Promise<{ poolSlug: string }>;
  searchParams: Promise<{ page?: string; action?: string; actor?: string }>;
}

export default async function AuditLogPage({ params, searchParams }: AuditLogPageProps) {
  const { poolSlug } = await params;
  const filters = await searchParams;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("id")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;

  const page = parseInt(filters.page ?? "1", 10);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  let query = supabaseAdmin
    .from("audit_log")
    .select("*", { count: "exact" })
    .eq("pool_id", pool.id)
    .order("timestamp", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filters.action) {
    query = query.eq("action", filters.action);
  }
  if (filters.actor) {
    query = query.ilike("actor_email", `%${filters.actor}%`);
  }

  const { data: entries, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  // Get unique actions for filter dropdown
  const { data: actions } = await supabaseAdmin
    .from("audit_log")
    .select("action")
    .eq("pool_id", pool.id)
    .order("action");

  const uniqueActions = [...new Set((actions ?? []).map((a: any) => a.action as string))];

  return (
    <div className="space-y-4">
      <AuditLogTable
        entries={entries ?? []}
        uniqueActions={uniqueActions}
        currentPage={page}
        totalPages={totalPages}
        totalEntries={count ?? 0}
        poolSlug={poolSlug}
        currentFilters={filters}
      />
    </div>
  );
}
