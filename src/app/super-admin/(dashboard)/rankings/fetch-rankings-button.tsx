"use client";

import { useActionState } from "react";
import {
  fetchRankingsAction,
  type FetchRankingsActionResult,
} from "./actions";

const initial: FetchRankingsActionResult = { success: false };

/**
 * "Fetch from FIFA" — diagnostic build round 2.
 *
 * Every diagnostic field is rendered defensively. If a field is missing
 * (e.g. left over from an older client state across a hot-reload, or if
 * the server returns a partial diagnostic), we render "—" instead of
 * crashing.
 */
export function FetchRankingsButton() {
  const [state, action, pending] = useActionState(fetchRankingsAction, initial);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <form
        action={action}
        className="flex items-start justify-between gap-3 flex-wrap"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Fetch from FIFA</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Diagnostic build — scans the public ranking page for embedded
            data blocks. Result panel below shows where the ranking data
            actually lives in the HTML.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-pitch-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "Fetching..." : "Fetch now"}
        </button>
      </form>

      {(state.success || state.error) && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3 space-y-1.5">
          {state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          {state.success && state.message && (
            <p className="text-sm text-pitch-600">{state.message}</p>
          )}

          {state.diagnostics && state.diagnostics.length > 0 && (
            <details
              className="text-2xs text-[var(--color-text-muted)] mt-2"
              open
            >
              <summary className="cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors">
                Fetch diagnostics
              </summary>
              <div className="mt-2 space-y-3">
                {state.diagnostics.map((d, i) => (
                  <div
                    key={i}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 space-y-1.5"
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span className="font-mono text-[var(--color-text)] text-2xs">
                        {d.variant ?? "—"}
                      </span>
                    </div>
                    <div className="font-mono text-2xs break-all leading-tight">
                      {d.url ?? "—"}
                    </div>
                    <div className="flex flex-wrap gap-3 text-2xs">
                      <span>
                        HTTP:{" "}
                        <span className="font-mono">{d.status ?? "—"}</span>
                      </span>
                      <span>
                        Content-Type:{" "}
                        <span className="font-mono">
                          {d.contentType ?? "—"}
                        </span>
                      </span>
                      <span>
                        Body length:{" "}
                        <span className="font-mono">
                          {typeof d.bodyLength === "number"
                            ? d.bodyLength.toLocaleString()
                            : "—"}
                        </span>{" "}
                        bytes
                      </span>
                    </div>

                    {d.error && (
                      <p className="text-2xs text-red-600">{d.error}</p>
                    )}

                    {/* Pattern findings — one row per pattern scanner. */}
                    {Array.isArray(d.patternFindings) &&
                      d.patternFindings.length > 0 && (
                        <div className="mt-2 space-y-2">
                          <p className="text-2xs font-medium text-[var(--color-text-secondary)]">
                            Pattern scan results:
                          </p>
                          {d.patternFindings.map((p, j) => (
                            <div
                              key={j}
                              className="rounded bg-[var(--color-surface-raised)] p-1.5 space-y-1"
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-mono text-2xs">
                                  {p.pattern ?? "—"}
                                </span>
                                <span
                                  className={
                                    p.found
                                      ? (p.countryHits ?? 0) >= 10
                                        ? "text-pitch-600 font-medium"
                                        : "text-gold-700"
                                      : "text-[var(--color-text-muted)]"
                                  }
                                >
                                  {p.found
                                    ? `FOUND @ ${
                                        typeof p.byteOffset === "number"
                                          ? p.byteOffset.toLocaleString()
                                          : "?"
                                      } · ${p.countryHits ?? 0} country hits`
                                    : "not found"}
                                </span>
                              </div>
                              {p.found && p.snippet && (
                                <pre className="max-h-32 overflow-auto rounded bg-[var(--color-bg)] p-1.5 text-2xs font-mono whitespace-pre-wrap break-all border border-[var(--color-border)]">
                                  {p.snippet}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                    {/* Body preview — falls back gracefully if missing. */}
                    {d.bodyPreview && (
                      <details className="mt-2">
                        <summary className="cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors">
                          Response body (first 600 chars)
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-[var(--color-surface-raised)] p-1.5 text-2xs font-mono whitespace-pre-wrap break-all">
                          {d.bodyPreview}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
