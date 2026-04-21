import Link from "next/link";

export default function PoolNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-5xl font-display font-bold text-[var(--color-text-muted)]">
          404
        </div>
        <h1 className="text-xl font-display font-bold">Pool not found</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          This pool doesn&apos;t exist or is no longer active.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 transition-colors"
        >
          View all pools
        </Link>
      </div>
    </div>
  );
}
