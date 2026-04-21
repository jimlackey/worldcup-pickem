import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-6xl font-display font-bold text-[var(--color-text-muted)]">
          404
        </div>
        <h1 className="text-xl font-display font-bold">Page not found</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          The page you&apos;re looking for doesn&apos;t exist or the pool may have been removed.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 transition-colors"
        >
          Go to home page
        </Link>
      </div>
    </div>
  );
}
