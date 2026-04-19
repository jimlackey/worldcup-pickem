import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";

export default async function HomePage() {
  const { data: pools } = await supabaseAdmin
    .from("pools")
    .select("id, name, slug, is_demo, is_active")
    .eq("is_active", true)
    .order("is_demo", { ascending: true })
    .order("name");

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
            World Cup Pick&apos;em
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            Choose a pool to view standings or log in.
          </p>
        </div>

        <div className="space-y-3">
          {pools?.map((pool) => (
            <Link
              key={pool.id}
              href={`/${pool.slug}`}
              className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-pitch-400 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display font-semibold text-lg">
                    {pool.name}
                  </h2>
                  <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
                    /{pool.slug}
                  </p>
                </div>
                {pool.is_demo && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-gold-100 text-gold-700">
                    Demo
                  </span>
                )}
              </div>
            </Link>
          ))}

          {(!pools || pools.length === 0) && (
            <p className="text-center text-[var(--color-text-muted)] py-8">
              No pools configured yet. Run the seed script to create demo pools.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
