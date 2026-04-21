"use client";

import { useEffect } from "react";

export default function PoolError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Pool error:", error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-display font-bold">Something went wrong</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          An error occurred while loading this page. Please try again.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
