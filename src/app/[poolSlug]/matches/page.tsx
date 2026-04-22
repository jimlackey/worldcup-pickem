import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatches, getGroups } from "@/lib/tournament/queries";
import type { Pool } from "@/types/database";
import { MatchBrowser } from "./match-browser";

interface MatchesPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function MatchesPage({ params }: MatchesPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) return <p>Pool not found.</p>;
  const typedPool = pool as Pool;

  const [matches, groups] = await Promise.all([
    getMatches(typedPool),
    getGroups(typedPool),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Matches</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Select a match to see how everyone picked it.
        </p>
      </div>

      <MatchBrowser
        matches={matches}
        groups={groups}
        poolSlug={poolSlug}
      />
    </div>
  );
}
