"use client";

import { useMemo, useState } from "react";
import { TeamFlag } from "@/components/flags/team-flag";
import { cn } from "@/lib/utils/cn";

/**
 * Row shape for the 3rd Place tab. Mirrors ThirdPlaceTabRow from
 * src/lib/third-place/standings-tab.ts, serialised across the
 * server → client boundary. Already pre-sorted server-side
 * (alive-first, then FIFA rank asc).
 */
export interface ThirdPlaceTabRowData {
  pickSetId: string;
  pickSetName: string;
  displayName: string | null;
  teamName: string;
  teamCode: string;
  flagCode: string;
  fifaRanking: number | null;
  isAlive: boolean;
}

interface ThirdPlaceStandingsTabProps {
  rows: ThirdPlaceTabRowData[];
  /**
   * Pool-admin show_player_names switch. When false, the secondary
   * display-name line is suppressed (the pick set name still shows).
   */
  showPlayerNamesEnabled: boolean;
}

/**
 * The "3rd Place" side-pick tracker shown as a tab on /standings.
 *
 * Lists only pick sets that made the optional pre-tournament 3rd-place
 * pick. This is a side pick unrelated to the overall standings, so rows
 * are NOT ordered by player rank — the server hands them over already
 * sorted by (alive first, then FIFA rank ascending). A local text
 * filter narrows by pick set name.
 */
export function ThirdPlaceStandingsTab({
  rows,
  showPlayerNamesEnabled,
}: ThirdPlaceStandingsTabProps) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      r.pickSetName.toLowerCase().includes(needle)
    );
  }, [filter, rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">
          No 3rd-place picks yet. Players who make the optional 3rd-place
          pick will appear here.
        </p>
      </div>
    );
  }

  const aliveCount = rows.filter((r) => r.isAlive).length;

  return (
    <div>
      <p className="text-xs text-[var(--color-text-muted)] mb-3">
        Optional pre-tournament 3rd-place picks. {rows.length} pick
        {rows.length !== 1 ? "s" : ""} · {aliveCount} still alive. Ordered
        by survival, then FIFA ranking.
      </p>

      <div className="mb-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter players…"
          aria-label="Filter 3rd-place picks by player name"
          className="w-full sm:max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-pitch-500/40 focus:border-pitch-500 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)]">
            No players match “{filter.trim()}”.
          </p>
        </div>
      ) : (
        <>
          {/* Wide screens: table */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] text-left">
                  <th className="px-4 py-2.5 font-semibold">Player</th>
                  <th className="px-4 py-2.5 font-semibold">3rd-Place Pick</th>
                  <th className="px-4 py-2.5 font-semibold text-right">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.pickSetId}
                    className="border-b border-[var(--color-border)] last:border-b-0"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.pickSetName}</span>
                      {showPlayerNamesEnabled && r.displayName && (
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          {r.displayName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <TeamFlag
                          flagCode={r.flagCode}
                          teamName={r.teamName}
                          shortCode={r.teamCode}
                          size="24x18"
                        />
                        <span>{r.teamName}</span>
                        {r.fifaRanking != null && (
                          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                            (#{r.fifaRanking})
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <AliveBadge isAlive={r.isAlive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow screens: stacked cards */}
          <div className="sm:hidden space-y-2">
            {filtered.map((r) => (
              <div
                key={r.pickSetId}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium block truncate">
                      {r.pickSetName}
                    </span>
                    {showPlayerNamesEnabled && r.displayName && (
                      <span className="block text-xs text-[var(--color-text-muted)] truncate">
                        {r.displayName}
                      </span>
                    )}
                  </div>
                  <AliveBadge isAlive={r.isAlive} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <TeamFlag
                    flagCode={r.flagCode}
                    teamName={r.teamName}
                    shortCode={r.teamCode}
                    size="24x18"
                  />
                  <span className="text-sm">{r.teamName}</span>
                  {r.fifaRanking != null && (
                    <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                      (#{r.fifaRanking})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AliveBadge({ isAlive }: { isAlive: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        isAlive
          ? "bg-pitch-100 text-pitch-700"
          : "bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          isAlive ? "bg-pitch-500" : "bg-[var(--color-text-muted)]"
        )}
      />
      {isAlive ? "Alive" : "Eliminated"}
    </span>
  );
}
