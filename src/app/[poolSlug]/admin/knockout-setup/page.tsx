import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatches, getTeams } from "@/lib/tournament/queries";
import type { Pool } from "@/types/database";
import { KnockoutSetupForm } from "./knockout-setup-form";

interface KnockoutSetupPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function KnockoutSetupPage({ params }: KnockoutSetupPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) return null;

  const typedPool = pool as Pool;

  const [matches, teams] = await Promise.all([
    getMatches(typedPool),
    getTeams(typedPool),
  ]);

  const knockoutMatches = matches.filter((m) => m.phase !== "group");

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Assign teams to each knockout match slot after the group phase is complete.
      </p>

      <KnockoutSetupForm
        matches={knockoutMatches}
        teams={teams}
        poolId={pool.id}
        poolSlug={poolSlug}
      />
    </div>
  );
}
