export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 animate-fade-in">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div
            className="h-4 rounded bg-[var(--color-surface-raised)] animate-pulse"
            style={{ width: `${70 + Math.random() * 30}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function LoadingCard() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 animate-pulse">
      <div className="h-5 w-48 bg-[var(--color-surface-raised)] rounded mb-2" />
      <div className="h-3 w-32 bg-[var(--color-surface-raised)] rounded" />
    </div>
  );
}

export function LoadingPage({ title }: { title?: string }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {title && (
        <div>
          <div className="h-7 w-40 bg-[var(--color-surface-raised)] rounded animate-pulse" />
          <div className="h-4 w-24 bg-[var(--color-surface-raised)] rounded mt-2 animate-pulse" />
        </div>
      )}
      <div className="space-y-3">
        <LoadingCard />
        <LoadingCard />
        <LoadingCard />
      </div>
    </div>
  );
}
