"use client";

import { useState } from "react";
import Link from "next/link";
import { usePool } from "@/lib/pool/context";
import { logoutAction } from "@/app/[poolSlug]/auth/actions";
import { isGroupPhaseOpen } from "@/lib/picks/validation";
import { cn } from "@/lib/utils/cn";

export function NavBar() {
  const { pool, session } = usePool();
  const [mobileOpen, setMobileOpen] = useState(false);

  // "Make Picks" is a first-time-user-friendly shortcut to the login page.
  // Only makes sense BEFORE games begin (group phase still open) AND when no
  // one is currently logged in. Once picks are locked or the user is in, the
  // "Log in" / "My Picks" / "Log out" controls cover everything.
  const showMakePicks = !session && isGroupPhaseOpen(pool);

  const navLinks = [
    { href: `/${pool.slug}/standings`, label: "Standings" },
    { href: `/${pool.slug}/matches`, label: "Matches" },
  ];

  const authLinks = session
    ? [{ href: `/${pool.slug}/my-picks`, label: "My Picks" }]
    : [];

  const adminLinks =
    session?.role === "admin"
      ? [{ href: `/${pool.slug}/admin`, label: "Admin" }]
      : [];

  const allLinks = [...navLinks, ...authLinks, ...adminLinks];

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/80">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Pool name / logo */}
          <Link
            href={`/${pool.slug}/standings`}
            className="font-display font-bold text-lg tracking-tight hover:opacity-80 transition-opacity"
          >
            {pool.name}
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                {link.label}
              </Link>
            ))}

            <div className="ml-2 pl-2 border-l border-[var(--color-border)] flex items-center gap-2">
              {session ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-text-muted)] max-w-[160px] truncate">
                    {session.displayName || session.email}
                  </span>
                  <form action={logoutAction}>
                    <input type="hidden" name="poolSlug" value={pool.slug} />
                    <button
                      type="submit"
                      className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-2 py-1 rounded hover:bg-[var(--color-surface-raised)] transition-colors"
                    >
                      Log out
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  {showMakePicks && (
                    <Link
                      href={`/${pool.slug}/auth/login?from=make-picks`}
                      className="text-sm font-semibold bg-pitch-600 text-white hover:bg-pitch-700 px-3 py-1.5 rounded-md transition-colors"
                    >
                      Make Picks
                    </Link>
                  )}
                  <Link
                    href={`/${pool.slug}/auth/login`}
                    className="text-sm font-semibold text-pitch-600 hover:text-pitch-700 px-3 py-1.5 rounded-md hover:bg-pitch-50 transition-colors"
                  >
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 -mr-2 rounded-md hover:bg-[var(--color-surface-raised)] transition-colors tap-target"
            aria-label="Toggle menu"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        <div
          className={cn(
            "md:hidden overflow-hidden transition-all duration-200",
            mobileOpen ? "max-h-96 pb-4" : "max-h-0"
          )}
        >
          <div className="flex flex-col gap-1 pt-2">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-surface-raised)] transition-colors tap-target"
              >
                {link.label}
              </Link>
            ))}

            {!session && showMakePicks && (
              <Link
                href={`/${pool.slug}/auth/login?from=make-picks`}
                onClick={() => setMobileOpen(false)}
                className="mt-1 block px-3 py-2.5 text-sm font-semibold bg-pitch-600 text-white hover:bg-pitch-700 rounded-md transition-colors tap-target text-center"
              >
                Make Picks
              </Link>
            )}

            <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
              {session ? (
                <div className="px-3 py-1">
                  <p className="text-xs text-[var(--color-text-muted)] mb-2">
                    {session.displayName || session.email}
                    {session.role === "admin" && (
                      <span className="ml-1.5 text-2xs font-medium px-1.5 py-0.5 rounded-full bg-gold-100 text-gold-700">
                        admin
                      </span>
                    )}
                  </p>
                  <form action={logoutAction}>
                    <input type="hidden" name="poolSlug" value={pool.slug} />
                    <button
                      type="submit"
                      className="text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                    >
                      Log out
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  href={`/${pool.slug}/auth/login`}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2.5 text-sm font-semibold text-pitch-600 hover:text-pitch-700 rounded-md hover:bg-pitch-50 transition-colors tap-target"
                >
                  Log in
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
