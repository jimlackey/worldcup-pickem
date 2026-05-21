import Link from "next/link";
import { TournamentSubNav } from "./tournament-sub-nav";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Super-admin · Tournament",
};

/**
 * Shared frame for /super-admin/tournament/* pages. Renders the page
 * header, "back" link, and the sub-nav that lets the super-admin switch
 * between the Matches (score entry) and Knockout Setup pages.
 *
 * Each child page renders its own body inside this layout.
 */
export default function TournamentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/super-admin/dashboard"
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
        >
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-display font-bold mt-2">
          Tournament Management
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Edit the canonical tournament data — match results and the
          knockout bracket. Real pools read this data directly; demo pools
          have their own pool-scoped copies that admins manage from each
          pool&apos;s own admin page.
        </p>
      </div>

      <TournamentSubNav />

      {children}
    </div>
  );
}
