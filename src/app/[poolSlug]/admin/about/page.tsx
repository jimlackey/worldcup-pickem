import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Pool } from "@/types/database";
import { AboutConfigForm } from "./about-config-form";

interface AdminAboutPageProps {
  params: Promise<{ poolSlug: string }>;
}

/**
 * /{slug}/admin/about — pool-admin surface for editing the public
 * /{slug}/about page.
 *
 * The admin layout (src/app/[poolSlug]/admin/layout.tsx) already
 * enforces requirePoolAuth(pool.id, pool.slug, "admin") for everything
 * underneath it, so this page can assume the visitor is a pool admin
 * by the time it renders. No additional gate is needed here.
 *
 * Form layout mirrors the rendered About page top-to-bottom so the
 * admin's mental model maps cleanly between "the field I'm editing"
 * and "where that text shows up". The link in the intro lets the
 * admin pop the live page open in a new tab to preview saves.
 */
export default async function AdminAboutPage({
  params,
}: AdminAboutPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .single();

  if (!pool) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-display font-bold">About page</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Customise the copy that appears on{" "}
          <Link
            href={`/${poolSlug}/about`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pitch-600 hover:text-pitch-700 underline"
          >
            /{poolSlug}/about
          </Link>
          . Toggle individual sections on or off and rewrite the prose
          for your pool.
        </p>
      </div>

      <AboutConfigForm pool={pool as Pool} />
    </div>
  );
}
