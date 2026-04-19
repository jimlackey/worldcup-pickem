"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const basePath = `/${poolSlug}/admin`;

  return (
    <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
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
              "px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors tap-target",
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
  );
}
