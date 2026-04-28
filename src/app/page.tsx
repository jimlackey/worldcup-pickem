import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { loginAsDemoUserAction } from "./demo-login-actions";

interface HomePageProps {
  searchParams: Promise<{ demo_error?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { demo_error } = await searchParams;

  const { data: pools } = await supabaseAdmin
    .from("pools")
    .select("id, name, slug, is_demo, is_active, is_listed, group_lock_at, knockout_open_at, knockout_lock_at")
    .eq("is_active", true)
    .eq("is_listed", true)
    .order("is_demo", { ascending: true })
    .order("name");

  // Get member counts per pool
  const poolIds = (pools ?? []).map((p) => p.id);
  let memberCounts: Record<string, number> = {};
  if (poolIds.length > 0) {
    const { data: memberships } = await supabaseAdmin
      .from("pool_memberships")
      .select("pool_id")
      .in("pool_id", poolIds)
      .eq("is_active", true)
      .eq("role", "player");

    for (const m of memberships ?? []) {
      memberCounts[m.pool_id] = (memberCounts[m.pool_id] ?? 0) + 1;
    }
  }

  function getPhaseLabel(pool: {
    group_lock_at: string | null;
    knockout_open_at: string | null;
    knockout_lock_at: string | null;
  }): { label: string; color: string } {
    const now = new Date();
    const groupLocked = pool.group_lock_at && now >= new Date(pool.group_lock_at);
    const knockoutOpen = pool.knockout_open_at && now >= new Date(pool.knockout_open_at);
    const knockoutLocked = pool.knockout_lock_at && now >= new Date(pool.knockout_lock_at);

    if (knockoutLocked) return { label: "Tournament in progress", color: "bg-gold-100 text-gold-700" };
    if (knockoutOpen) return { label: "Knockout picks open", color: "bg-pitch-100 text-pitch-700" };
    if (groupLocked) return { label: "Group stage underway", color: "bg-pitch-100 text-pitch-700" };
    return { label: "Accepting picks", color: "bg-pitch-100 text-pitch-700" };
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
            World Cup Pick&apos;em
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm">
            2026 FIFA World Cup prediction pools
          </p>
        </div>

        {demo_error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold mb-0.5">Demo login failed</p>
            <p className="text-red-600">{demo_error}</p>
          </div>
        )}

        <div className="space-y-3">
          {pools?.map((pool) => {
            const phase = getPhaseLabel(pool);
            const members = memberCounts[pool.id] ?? 0;

            // Non-demo pools: keep the original single-link tile.
            if (!pool.is_demo) {
              return (
                <Link
                  key={pool.id}
                  href={`/${pool.slug}`}
                  className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-pitch-400 hover:shadow-md group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display font-semibold text-lg group-hover:text-pitch-600 transition-colors truncate">
                        {pool.name}
                      </h2>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={cn("text-2xs font-medium px-2 py-0.5 rounded-full", phase.color)}>
                          {phase.label}
                        </span>
                        {members > 0 && (
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {members} player{members !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <svg className="h-4 w-4 text-[var(--color-text-muted)] group-hover:text-pitch-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            }

            // Demo pools: same header, but a three-button action row below
            // instead of wrapping the whole card in a single link.
            // Buttons are inside <form action={...}> so the public-only
            // action ("View as Public") is a plain link/anchor while the
            // two session-creating actions are POST forms invoking
            // loginAsDemoUserAction.
            return (
              <div
                key={pool.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-pitch-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display font-semibold text-lg truncate">
                      {pool.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={cn("text-2xs font-medium px-2 py-0.5 rounded-full", phase.color)}>
                        {phase.label}
                      </span>
                      {members > 0 && (
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {members} player{members !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-gold-100 text-gold-700 shrink-0">
                    Demo
                  </span>
                </div>

                {/* Action row.
                    On narrow screens (mobile) the three buttons stack to
                    full-width tap targets. On sm+ they sit side-by-side. */}
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <Link
                    href={`/${pool.slug}`}
                    className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-semibold text-center text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] hover:border-pitch-400 transition-colors tap-target"
                  >
                    View as Public
                  </Link>

                  <form action={loginAsDemoUserAction} className="flex-1">
                    <input type="hidden" name="poolId" value={pool.id} />
                    <input type="hidden" name="poolSlug" value={pool.slug} />
                    <input type="hidden" name="role" value="player" />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-pitch-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pitch-700 transition-colors tap-target"
                    >
                      View as Player
                    </button>
                  </form>

                  <form action={loginAsDemoUserAction} className="flex-1">
                    <input type="hidden" name="poolId" value={pool.id} />
                    <input type="hidden" name="poolSlug" value={pool.slug} />
                    <input type="hidden" name="role" value="admin" />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-gold-600 px-3 py-2 text-xs font-semibold text-white hover:bg-gold-700 transition-colors tap-target"
                    >
                      View as Admin
                    </button>
                  </form>
                </div>
              </div>
            );
          })}

          {(!pools || pools.length === 0) && (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
              <p className="text-[var(--color-text-secondary)]">
                No pools configured yet.
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Run <code className="font-mono bg-[var(--color-surface-raised)] px-1 rounded">npx tsx scripts/seed-demo.ts</code> to create demo pools.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-2xs text-[var(--color-text-muted)]">
          2026 FIFA World Cup Pick&apos;em
        </p>
      </div>
    </main>
  );
}
