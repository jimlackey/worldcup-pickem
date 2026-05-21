"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * Sub-nav for the /super-admin/tournament/* group. Two siblings: Matches
 * (score entry for global tournament matches) and Knockout Setup (assign
 * teams to knockout slots).
 *
 * Rendered by the tournament layout, above each page's body.
 */
export function TournamentSubNav() {
  const pathname = usePathname();

  const links = [
    { href: "/super-admin/tournament/matches", label: "Matches" },
    { href: "/super-admin/tournament/knockout-setup", label: "Knockout Setup" },
  ];

  return (
    <div className="flex items-center gap-1 text-sm border-b border-[var(--color-border)]">
      {links.map((link) => {
        const isActive = pathname === link.href;
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
