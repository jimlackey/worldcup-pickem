"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const adminLinks = [
  { href: "", label: "Overview" },
  { href: "/matches", label: "Matches" },
  { href: "/knockout-setup", label: "Bracket" },
  { href: "/players", label: "Players" },
  { href: "/settings", label: "Settings" },
  { href: "/csv-import", label: "CSV Import" },
  { href: "/audit-log", label: "Audit Log" },
];

export function AdminNav({ poolSlug }: { poolSlug: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const basePath = `/${poolSlug}/admin`;

  // Resolve the currently active link by the deepest-prefix match. Matches the
  // logic the desktop tabs use so active state is consistent across form
  // factors.
  const activeLink = adminLinks.find((link) => {
    const fullHref = `${basePath}${link.href}`;
    return link.href === ""
      ? pathname === basePath
      : pathname.startsWith(fullHref);
  });

  return (
    <>
      {/* Mobile: native select. Below sm (640px) the 7 tab labels don't fit
          without clipping or overlapping, so we swap to a dropdown. Native
          <select> is fully accessible, renders OS-level picker UI, and shows
          every option with one tap. */}
      <div className="sm:hidden">
        <label className="block">
          <span className="sr-only">Admin section</span>
          <div className="relative">
            <select
              value={activeLink?.href ?? ""}
              onChange={(e: { target: { value: string } }) => router.push(`${basePath}${e.target.value}`)}
              className={cn(
                "w-full appearance-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]",
                "pl-3 pr-9 py-2 text-sm font-medium tap-target",
                "focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500"
              )}
            >
              {adminLinks.map((link) => (
                <option key={link.href} value={link.href}>
                  {link.label}
                </option>
              ))}
            </select>
            {/* Chevron — shown instead of the default select arrow which can
                look mismatched in dark mode. */}
            <svg
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </label>
      </div>

      {/* Desktop (sm and up): horizontal tab bar. Unchanged except that each
          link is now `shrink-0` so flex layout never compresses labels below
          their intrinsic width — prevents any future overlap even at
          awkward widths. */}
      <nav className="hidden sm:flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {adminLinks.map((link) => {
          const fullHref = `${basePath}${link.href}`;
          const isActive =
            link.href === ""
              ? pathname === basePath
              : pathname.startsWith(fullHref);

          return (
            <Link
              key={link.href}
              href={fullHref}
              className={cn(
                "shrink-0 px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors tap-target",
                isActive
                  ? "bg-pitch-600 text-white"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
