import { redirect } from "next/navigation";
import Link from "next/link";
import { getSuperAdminSession } from "@/lib/auth/super-admin-session";
import { superAdminLogoutAction } from "../actions";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function SuperAdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSuperAdminSession();
  if (!session) {
    redirect("/super-admin");
  }

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <nav className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 flex h-14 items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            {/* Brand → /super-admin/dashboard. The dashboard URL is now
                a tile-grid landing page (previously the pools list).
                Clicking the brand text is the equivalent of "go home"
                across the super-admin surface. */}
            <Link
              href="/super-admin/dashboard"
              className="font-display font-bold text-lg tracking-tight hover:opacity-80 transition-opacity shrink-0"
            >
              Super-admin
            </Link>

            {/* Section links.
                
                "Tournament" is a parent for the matches and knockout-setup
                pages — clicking it lands on /super-admin/tournament which
                redirects to /matches. The sub-page distinction is handled
                by the tournament layout's own sub-nav.
                
                Rankings/Lines/Countries each operate on global tournament
                data of their own (FIFA rankings, money lines, country
                rosters) so they sit alongside Tournament as peers.

                "Pools" now points at /super-admin/pools (the dedicated
                pools list). Previously it shared a URL with the
                landing page; after splitting the two, each section in
                this strip has its own canonical destination. */}
            <div className="flex items-center gap-1 text-sm">
              <Link
                href="/super-admin/pools"
                className="px-2 py-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Pools
              </Link>
              <Link
                href="/super-admin/tournament/matches"
                className="px-2 py-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Tournament
              </Link>
              <Link
                href="/super-admin/rankings"
                className="px-2 py-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Rankings
              </Link>
              <Link
                href="/super-admin/lines"
                className="px-2 py-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Lines
              </Link>
              <Link
                href="/super-admin/countries"
                className="px-2 py-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Countries
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-[var(--color-text-muted)] max-w-[200px] truncate hidden sm:inline">
              {session.email}
            </span>
            <form action={superAdminLogoutAction}>
              <button
                type="submit"
                className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-2 py-1 rounded hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
