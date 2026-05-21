"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

interface AdminLink {
  href: string;
  label: string;
  /**
   * If true, this link is only shown for demo pools. Real pools route
   * match and knockout management through the super-admin surface.
   */
  demoOnly?: boolean;
}

const ALL_LINKS: AdminLink[] = [
  { href: "", label: "Overview" },
  { href: "/matches", label: "Matches", demoOnly: true },
  { href: "/knockout-setup", label: "Bracket", demoOnly: true },
  // Countries: real pools share the global team roster managed at
  // /super-admin/countries. Only demo pools have private team rows to
  // edit here.
  { href: "/countries", label: "Countries", demoOnly: true },
  { href: "/players", label: "Players" },
  // Whitelist: extracted from Settings so admins can find it more easily.
  // Applies to both demo and real pools — every pool gates joins by
  // whitelist regardless of pool type.
  { href: "/whitelist", label: "Whitelist" },
  { href: "/settings", label: "Settings" },
  { href: "/csv-import", label: "CSV Import" },
  { href: "/audit-log", label: "Audit Log" },
];

export function AdminNav({
  poolSlug,
  isDemo,
}: {
  poolSlug: string;
  /** True when pool.is_demo === true. Used to filter demo-only entries. */
  isDemo: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const basePath = `/${poolSlug}/admin`;

  // Filter once based on demo status. The filtered list flows through both
  // the mobile <select> and the desktop tab bar so they stay in sync.
  const adminLinks = ALL_LINKS.filter((link) => !link.demoOnly || isDemo);

  const activeLink = adminLinks.find((link) => {
    const fullHref = `${basePath}${link.href}`;
    return link.href === ""
      ? pathname === basePath
      : pathname.startsWith(fullHref);
  });

  return (
    <>
      {/* Mobile: native select. */}
      <div className="sm:hidden">
        <label className="block">
          <span className="sr-only">Admin section</span>
          <div className="relative">
            <select
              value={activeLink?.href ?? ""}
              onChange={(e: { target: { value: string } }) =>
                router.push(`${basePath}${e.target.value}`)
              }
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

      {/* Desktop (sm and up): horizontal tab bar. */}
      <div className="hidden sm:flex items-center gap-1 border-b border-[var(--color-border)] overflow-x-auto">
        {adminLinks.map((link) => {
          const fullHref = `${basePath}${link.href}`;
          const isActive = activeLink?.href === link.href;
          return (
            <Link
              key={link.href}
              href={fullHref}
              className={cn(
                "px-3 py-2 -mb-px border-b-2 transition-colors text-sm whitespace-nowrap",
                isActive
                  ? "border-pitch-500 text-[var(--color-text)] font-medium"
                  : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
