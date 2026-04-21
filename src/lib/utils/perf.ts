/**
 * Lightweight server-side performance tracking.
 *
 * Usage in server components / actions:
 *
 *   const timer = createTimer();
 *   const data = await fetchSomething();
 *   timer.mark("db_query");
 *   const processed = transform(data);
 *   timer.mark("transform");
 *   timer.log("StandingsPage");
 *
 * Logs to console in development. In production, logs are available
 * in Vercel's function logs (Runtime Logs in the dashboard).
 *
 * For Vercel-specific monitoring, enable Vercel Speed Insights:
 *   npm install @vercel/speed-insights
 *   Add <SpeedInsights /> to root layout
 *   View metrics at vercel.com → your project → Speed Insights
 *
 * For deeper DB-level monitoring, use Supabase Dashboard → Reports
 * which shows query performance, connection counts, and cache hit rates.
 */

export interface TimerMark {
  label: string;
  durationMs: number;
}

export interface Timer {
  /** Mark a checkpoint. Duration is from the previous mark (or start). */
  mark: (label: string) => void;
  /** Get all marks with durations. */
  getMarks: () => TimerMark[];
  /** Total elapsed time in ms. */
  elapsed: () => number;
  /** Log all marks to console (dev) or structured log (prod). */
  log: (context: string) => void;
}

export function createTimer(): Timer {
  const start = performance.now();
  let lastMark = start;
  const marks: TimerMark[] = [];

  return {
    mark(label: string) {
      const now = performance.now();
      marks.push({ label, durationMs: Math.round(now - lastMark) });
      lastMark = now;
    },

    getMarks() {
      return marks;
    },

    elapsed() {
      return Math.round(performance.now() - start);
    },

    log(context: string) {
      const total = Math.round(performance.now() - start);
      const details = marks
        .map((m) => `${m.label}=${m.durationMs}ms`)
        .join(", ");

      if (total > 1000) {
        // Slow request — warn
        console.warn(`[perf] ⚠️ ${context}: ${total}ms total (${details})`);
      } else if (process.env.NODE_ENV === "development") {
        console.log(`[perf] ${context}: ${total}ms (${details})`);
      }
    },
  };
}
