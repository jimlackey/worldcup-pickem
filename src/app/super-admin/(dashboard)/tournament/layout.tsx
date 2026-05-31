import Link from "next/link";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Super-admin · Tournament",
};

/**
 * Shared frame for /super-admin/tournament/* pages.
 *
 * Scores (match score entry) and Knockout Bracket (knockout slot assignment)
 * are now separate top-level options in the super-admin nav rather than tabs
 * under a single "Tournament" parent, so this layout no longer renders a
 * shared section title or sub-nav — just the common "back to dashboard"
 * link. Each child page renders its own heading and body.
 */
export default function TournamentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <Link
        href="/super-admin/dashboard"
        className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
      >
        ← Back to dashboard
      </Link>

      {children}
    </div>
  );
}
