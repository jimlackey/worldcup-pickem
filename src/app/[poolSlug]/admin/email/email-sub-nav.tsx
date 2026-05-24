"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * Sub-nav for the `/{poolSlug}/admin/email/*` group. Two siblings:
 *
 *   - Send Email     (/{poolSlug}/admin/email)
 *   - Manage Widgets (/{poolSlug}/admin/email/widgets)
 *
 * Visual conventions match the super-admin Tournament sub-nav so the
 * two sub-navs read as the same pattern: muted base text, pitch-coloured
 * underline on the active tab. Rendered by the email layout above each
 * page's body.
 *
 * The component is a client component because it needs usePathname to
 * decide which tab is active; the layout that hosts it is a server
 * component (it gates auth and fetches the pool slug). Splitting them
 * is the same shape the rest of the admin nav surfaces use.
 */
export function EmailSubNav({ poolSlug }: { poolSlug: string }) {
  const pathname = usePathname();
  const basePath = `/${poolSlug}/admin/email`;

  const links = [
    { href: basePath, label: "Send Email" },
    { href: `${basePath}/widgets`, label: "Manage Widgets" },
  ];

  // Exact-match on the Send Email link so it doesn't ALSO light up when
  // the admin is on /widgets. Sub-routes off of /widgets (none today, but
  // possible later) still resolve correctly via startsWith.
  return (
    <div className="flex items-center gap-1 text-sm border-b border-[var(--color-border)]">
      {links.map((link) => {
        const isActive =
          link.href === basePath
            ? pathname === basePath
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "px-3 py-2 -mb-px border-b-2 transition-colors",
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
  );
}
