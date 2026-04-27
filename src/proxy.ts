import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js proxy (formerly "middleware" pre-Next 16). Runs on every request.
 *
 * Responsibilities:
 *
 *   1. Pass-through for static assets, API routes, and Next.js internals.
 *   2. Surface the current pathname as an `x-pathname` header for any
 *      server component that wants to route off it (we keep this even
 *      though the privacy gate has moved here — other code may rely on
 *      it later).
 *   3. PRIVACY GATE: for any request to /{poolSlug}/... that is NOT an
 *      auth-surface route, look up the pool's `requires_login_to_view`
 *      flag. If the pool requires login AND there's no session cookie
 *      for that pool, return a real HTTP redirect to the login page.
 *   4. Add baseline security headers to every response.
 *
 * Why the gate moved out of [poolSlug]/layout.tsx:
 *
 *   Calling redirect() inside a layout during a *client-side* App Router
 *   navigation triggers a known issue in Next 16 where the RSC client
 *   keeps re-fetching the redirect target's payload in a loop (visible
 *   in the Network tab as hundreds of `?_rsc=...` fetches to the login
 *   URL). A real HTTP 307 from the proxy avoids the loop entirely
 *   because the App Router resolves it at the request boundary, before
 *   any RSC payload is built.
 *
 * Performance:
 *
 *   The Supabase REST lookup adds one ~50ms request per gated route.
 *   We only do it when there is no session cookie for the pool — so
 *   logged-in users pay nothing. We could cache the flag per pool
 *   server-side later if needed.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface PoolPrivacyRow {
  requires_login_to_view: boolean;
  is_active: boolean;
}

async function fetchPoolPrivacy(slug: string): Promise<PoolPrivacyRow | null> {
  // Direct REST call to PostgREST — works in the edge runtime where the
  // supabase-js client we use elsewhere isn't available without bundling.
  const url = `${SUPABASE_URL}/rest/v1/pools?slug=eq.${encodeURIComponent(
    slug
  )}&select=requires_login_to_view,is_active`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Accept: "application/json",
      },
      // Don't let Next cache this aggressively in dev — admin can flip
      // the flag and we want it to take effect immediately.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as PoolPrivacyRow[];
    return rows[0] ?? null;
  } catch {
    // If the lookup fails, fail OPEN (let the request through) rather
    // than locking everyone out. The layout-level fallback will redirect
    // unauthenticated users for private pools on the next request.
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals, static files, and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // static files (favicon, etc.)
  ) {
    return NextResponse.next();
  }

  // Forward the pathname so server components can read it via headers().
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Determine pool slug, if any. Pool routes look like /{slug}/... where
  // {slug} is anything that isn't a top-level reserved route.
  const segments = pathname.split("/").filter(Boolean);
  const slug = segments[0];
  const isPoolRoute =
    slug &&
    slug !== "super-admin" && // top-level super-admin route, no pool gate
    slug !== "auth" && // safety net; not actually a top-level route today
    !slug.startsWith("_");

  if (isPoolRoute) {
    // Auth surface for this pool must remain reachable so users can log in.
    const isAuthSurface =
      pathname === `/${slug}/auth` ||
      pathname.startsWith(`/${slug}/auth/`);

    if (!isAuthSurface) {
      // Cheap cookie check: do we already have a session for THIS pool?
      // The session cookie is namespaced per-slug in src/lib/auth/session.ts.
      const hasSessionCookie = !!request.cookies.get(`wcp_session_${slug}`);

      if (!hasSessionCookie) {
        // Only now do we incur the DB round-trip: is this pool private?
        const pool = await fetchPoolPrivacy(slug);
        if (pool && pool.is_active && pool.requires_login_to_view) {
          const loginUrl = request.nextUrl.clone();
          loginUrl.pathname = `/${slug}/auth/login`;
          loginUrl.search = ""; // strip any rsc/prefetch params
          return NextResponse.redirect(loginUrl, 307);
        }
      }
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Baseline security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
