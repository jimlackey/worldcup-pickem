import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js middleware runs on every request.
 *
 * Current responsibilities:
 * - Pass-through for static assets, API routes, and Next.js internals
 * - Session cookies are validated in server components / server actions,
 *   not here, since we need DB access which middleware doesn't have easily.
 *
 * Future: could add IP-based rate limiting for OTP routes.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // static files (favicon, etc.)
  ) {
    return NextResponse.next();
  }

  // Add security headers
  const response = NextResponse.next();
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
