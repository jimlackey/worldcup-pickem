import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  getAccessRequestByToken,
  markAccessRequestGranted,
  addToWhitelist,
} from "@/lib/pool/queries";
import { sendAccessGrantedEmail } from "@/lib/email/resend";
import { logAuditEvent } from "@/lib/audit";
import { AuditAction, AuditEntity } from "@/lib/audit/constants";
import { headers } from "next/headers";

// This page is reached from the tokenised "Grant access" link emailed to
// pool admins. It lives under /{slug}/auth/ so the privacy proxy treats it
// as an auth-surface route and lets it through WITHOUT a session — admins
// open it straight from their inbox. Authorisation is the unguessable
// token, not a session.
//
// The grant is performed server-side as part of rendering:
//   1. Resolve the token -> access_requests row.
//   2. Atomically flip pending -> granted (markAccessRequestGranted only
//      touches a still-pending row, so a second admin clicking the same
//      link is a no-op and we render "already granted").
//   3. Add the email to the pool whitelist (idempotent upsert).
//   4. Email the requestor that they're in.
//
// Steps 2–4 only run for a fresh grant. Re-opening the link (or a second
// admin opening it) skips straight to the success/idempotent message.

interface GrantAccessPageProps {
  params: Promise<{ poolSlug: string }>;
  searchParams: Promise<{ token?: string }>;
}

type Outcome =
  | { kind: "granted"; email: string; poolName: string }
  | { kind: "already"; email: string; poolName: string }
  | { kind: "invalid" }
  | { kind: "wrong-pool" };

async function resolveBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") ??
    headersList.get("host") ??
    "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

async function processGrant(
  poolSlug: string,
  token: string | undefined
): Promise<Outcome> {
  if (!token) return { kind: "invalid" };

  const request = await getAccessRequestByToken(token);
  if (!request) return { kind: "invalid" };

  // Fetch the pool this request belongs to (and confirm it matches the
  // slug in the URL — defends against a token being replayed under the
  // wrong pool path).
  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("id, name, slug")
    .eq("id", request.pool_id)
    .single();

  if (!pool) return { kind: "invalid" };
  if (pool.slug !== poolSlug) return { kind: "wrong-pool" };

  // Already resolved? Show the idempotent message.
  if (request.status !== "pending") {
    return { kind: "already", email: request.email, poolName: pool.name };
  }

  // The admin opening the link is, by construction, an admin (they got the
  // email). We don't have their session here, so we record the grant as
  // performed via the link. granted_by_email is best-effort: we don't know
  // exactly which admin clicked, so we leave it as a marker. If you later
  // want per-admin attribution, gate this page behind admin login instead.
  const didGrant = await markAccessRequestGranted(request.id, "link");
  if (!didGrant) {
    // Lost the race to another admin's click — treat as already granted.
    return { kind: "already", email: request.email, poolName: pool.name };
  }

  // Add to whitelist (idempotent) so the requestor can log in.
  await addToWhitelist(pool.id, request.email);

  // Notify the requestor.
  const loginUrl = `${await resolveBaseUrl()}/${pool.slug}/auth/login`;
  await sendAccessGrantedEmail(request.email, {
    poolName: pool.name,
    loginUrl,
  });

  // Audit the grant.
  await logAuditEvent({
    poolId: pool.id,
    actor: { id: null, email: "link", role: "admin" },
    action: AuditAction.GRANT_ACCESS,
    entityType: AuditEntity.ACCESS_REQUEST,
    entityId: request.id,
    newValue: { email: request.email },
  });

  return { kind: "granted", email: request.email, poolName: pool.name };
}

export default async function GrantAccessPage({
  params,
  searchParams,
}: GrantAccessPageProps) {
  const { poolSlug } = await params;
  const { token } = await searchParams;

  // Confirm the pool exists at all; otherwise bounce home.
  const { data: poolExists } = await supabaseAdmin
    .from("pools")
    .select("id")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!poolExists) {
    redirect("/");
  }

  const outcome = await processGrant(poolSlug, token);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        {outcome.kind === "granted" && (
          <>
            <SuccessIcon />
            <h1 className="text-2xl font-display font-bold tracking-tight mt-4">
              Access granted
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-2 text-sm leading-relaxed">
              <span className="font-medium text-[var(--color-text)]">
                {outcome.email}
              </span>{" "}
              has been added to the invite list for{" "}
              <span className="font-medium text-[var(--color-text)]">
                {outcome.poolName}
              </span>
              . We&apos;ve emailed them to let them know they can log in.
            </p>
          </>
        )}

        {outcome.kind === "already" && (
          <>
            <SuccessIcon />
            <h1 className="text-2xl font-display font-bold tracking-tight mt-4">
              Already granted
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-2 text-sm leading-relaxed">
              <span className="font-medium text-[var(--color-text)]">
                {outcome.email}
              </span>{" "}
              already has access to{" "}
              <span className="font-medium text-[var(--color-text)]">
                {outcome.poolName}
              </span>
              . Another admin may have approved this request already — no
              further action needed.
            </p>
          </>
        )}

        {(outcome.kind === "invalid" || outcome.kind === "wrong-pool") && (
          <>
            <ErrorIcon />
            <h1 className="text-2xl font-display font-bold tracking-tight mt-4">
              Link not valid
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-2 text-sm leading-relaxed">
              This access link is invalid or has expired. If you were trying
              to approve a request, ask the person to submit a new one from
              the login page.
            </p>
          </>
        )}

        <a
          href={`/${poolSlug}/auth/login`}
          className="inline-block mt-6 text-sm text-pitch-600 hover:text-pitch-700 font-medium transition-colors"
        >
          Go to login
        </a>
      </div>
    </main>
  );
}

function SuccessIcon() {
  return (
    <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
      <svg
        className="w-7 h-7 text-green-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 12.75l6 6 9-13.5"
        />
      </svg>
    </div>
  );
}

function ErrorIcon() {
  return (
    <div className="mx-auto w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
      <svg
        className="w-7 h-7 text-red-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </div>
  );
}
