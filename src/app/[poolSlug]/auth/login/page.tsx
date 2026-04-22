import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";
import type { Pool } from "@/types/database";

interface LoginPageProps {
  params: Promise<{ poolSlug: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { poolSlug } = await params;
  const { from } = await searchParams;

  // Fetch pool
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) {
    redirect("/");
  }

  // If already logged in, redirect to my-picks
  const session = await getPoolSession(pool.id, pool.slug);
  if (session) {
    redirect(`/${poolSlug}/my-picks`);
  }

  const typedPool = pool as Pool;
  const isDemo = typedPool.is_demo;
  const isMakePicksFlow = from === "make-picks" && !isDemo;

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            {pool.name}
          </h1>
          <p className="text-[var(--color-text-secondary)] mt-1 text-sm">
            {isDemo
              ? "Enter a demo player email to log in instantly."
              : isMakePicksFlow
                ? "Let's get you set up to make your picks."
                : "Enter your email to receive a login code."}
          </p>
        </div>

        {isMakePicksFlow && (
          <div className="mb-6 rounded-lg border border-pitch-200 bg-pitch-50 px-4 py-3 text-sm text-pitch-800">
            <p className="font-semibold mb-1">First time here?</p>
            <p className="text-pitch-700 leading-relaxed">
              No account needed — just enter the email address your pool admin
              added to the invite list. We&apos;ll send you a 6-digit code to
              confirm it&apos;s you, and you can start picking right away.
            </p>
          </div>
        )}

        <LoginForm pool={typedPool} />

        <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
          {isDemo
            ? "Demo pool — try mikejones@demo.example.com, sarahchen@demo.example.com, etc."
            : "Only whitelisted emails can log in. Contact the pool admin if you need access."}
        </p>
      </div>
    </main>
  );
}
