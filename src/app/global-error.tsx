"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh flex items-center justify-center bg-[#fafaf9] font-sans px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-sm text-gray-500">
            An unexpected error occurred.
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-[#2a9d61] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e7d4d]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
