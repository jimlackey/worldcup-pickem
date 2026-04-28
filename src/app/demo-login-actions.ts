"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createPoolSession, destroyPoolSession } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Server actions used by the landing-page "View as Player / View as Admin"
 * buttons on demo pool tiles.
 *
 * These are deliberately separate from the per-pool /auth/actions.ts file
 * because:
 *
 *   1) They run from the root landing page (/), which has no pool layout
 *      and therefore no PoolProvider session context.
 *   2) They hard-gate on `is_demo = true` and pick the email server-side,
 *      so a malicious POST cannot cause us to create a session for an
 *      arbitrary user in a non-demo pool.
 *   3) The "demo skip-OTP" branch in requestOtpAction takes an email from
 *      the form payload; here we take a *role* and resolve the email on
 *      the server, which is the only safe way to expose this from a
 *      public landing page.
 *
 * Demo player/admin emails are seeded by scripts/seed-demo.ts:
 *   - admin@demo.example.com (Pool Admin)
 *   - heathercollins@demo.example.com (Heather Collins, player)
 *
 * Both are members of every demo pool created by the seeder.
 */

// Email lookups keyed by role. If you change these, also update the
// landing-page button copy and (if you rename Heather) update seed-demo.ts.
const DEMO_PLAYER_EMAIL = "heathercollins@demo.example.com";
const DEMO_ADMIN_EMAIL = "admin@demo.example.com";

const demoLoginSchema = z.object({
  poolId: z.string().uuid(),
  poolSlug: z.string().min(1),
  role: z.enum(["player", "admin"]),
});

/**
 * Log the visitor in as the canonical demo player or demo admin for the
 * given demo pool, then bounce them into the pool. On any failure (pool
 * not found, not a demo pool, demo not seeded) we redirect back to the
 * landing page with a `demo_error` query parameter so the user sees a
 * banner explaining what went wrong.
 *
 * Form fields: poolId, poolSlug, role ("player" | "admin").
 */
export async function loginAsDemoUserAction(formData: FormData): Promise<void> {
  const parsed = demoLoginSchema.safeParse({
    poolId: formData.get("poolId"),
    poolSlug: formData.get("poolSlug"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect(`/?demo_error=${encodeURIComponent("Invalid demo login request.")}`);
  }

  const { poolId, poolSlug, role } = parsed.data;

  // Verify the pool is actually a demo pool. This is the security gate
  // that prevents this action from being used to drop sessions into
  // non-demo pools by anyone who can craft a form POST.
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("id, slug, is_demo, is_active")
    .eq("id", poolId)
    .eq("slug", poolSlug)
    .single();

  if (!pool || !pool.is_active || !pool.is_demo) {
    redirect(`/?demo_error=${encodeURIComponent("That pool is not available for demo login.")}`);
  }

  const email = role === "admin" ? DEMO_ADMIN_EMAIL : DEMO_PLAYER_EMAIL;

  // Look up the canonical demo participant. If the seed script hasn't
  // been run, or the demo accounts have been deleted, this is where we
  // find out.
  const { data: participant } = await supabaseAdmin
    .from("participants")
    .select("id, email, display_name")
    .eq("email", email)
    .single();

  if (!participant) {
    redirect(
      `/?demo_error=${encodeURIComponent(
        `Demo account ${email} not found. Has the demo seed script been run?`
      )}`
    );
  }

  // And confirm they're an active member of this specific demo pool with
  // the expected role. We don't trust the form's role claim — the role
  // we set on the session comes from the DB membership row.
  const { data: membership } = await supabaseAdmin
    .from("pool_memberships")
    .select("role")
    .eq("pool_id", poolId)
    .eq("participant_id", participant.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    redirect(
      `/?demo_error=${encodeURIComponent(
        `Demo account ${email} is not a member of this pool.`
      )}`
    );
  }

  // Defensive sanity check: if someone clicks "View as Admin" but the
  // admin@demo email is somehow seeded as a player (or vice versa), bail
  // out rather than silently grant the wrong privilege level.
  if (role === "admin" && membership.role !== "admin") {
    redirect(
      `/?demo_error=${encodeURIComponent(
        "Demo admin account does not have admin role in this pool."
      )}`
    );
  }

  // If a stale session exists for this pool slug (e.g. the visitor was
  // previously logged in as the player and is now choosing admin), drop
  // it before creating the new one. createPoolSession would happily set
  // a new cookie on top, but the old DB session row would linger.
  await destroyPoolSession(poolSlug);

  await createPoolSession(
    poolId,
    poolSlug,
    participant.id,
    participant.email,
    participant.display_name,
    membership.role
  );

  redirect(`/${poolSlug}/my-picks`);
}
