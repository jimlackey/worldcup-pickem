import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { PoolProvider } from "./pool-provider";
import { NavBar } from "@/components/layout/nav-bar";
import type { Pool } from "@/types/database";

interface PoolLayoutProps {
  children: React.ReactNode;
  params: Promise<{ poolSlug: string }>;
}

export default async function PoolLayout({ children, params }: PoolLayoutProps) {
  const { poolSlug } = await params;

  // Fetch pool by slug
  const { data: pool, error } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (error || !pool) {
    notFound();
  }

  // Try to get existing session for this pool
  const session = await getPoolSession(pool.id, pool.slug);

  return (
    <PoolProvider pool={pool as Pool} session={session}>
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </PoolProvider>
  );
}

export async function generateMetadata({ params }: PoolLayoutProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("name")
    .eq("slug", poolSlug)
    .single();

  return {
    title: pool?.name ?? "Pool",
  };
}
