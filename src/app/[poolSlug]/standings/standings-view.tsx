"use client";

import Link from "next/link";
import type { StandingsRow } from "@/types/database";
import { cn } from "@/lib/utils/cn";

interface StandingsViewProps {
  standings: StandingsRow[];
  poolSlug: string;
  groupPicksOpen: boolean;
  knockoutPicksOpen: boolean;
  groupPickCounts: Record<string, number>;
  knockoutPickCounts: Record<string, number>;
}

export function StandingsView({
  standings,
  poolSlug,
  groupPicksOpen,
  knockoutPicksOpen,
  groupPickCounts,
  knockoutPickCounts,
}: StandingsViewProps) {
  if (standings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">
          No players yet. Standings will appear once players join the pool.
        </p>
      </div>
    );
  }

  // Group picks open = pre-lock: hide points, hide links, show group pick progress
  // Group locked + knockout open = show group points + links, show KO pick progress
  // Both locked = full standings with points and links
  const groupPreLock = groupPicksOpen;
  const showPoints = !groupPreLock;
  const showLinks = !groupPreLock; // Can link to pick details once group is locked

  return (
    <div>
      {groupPreLock && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          Group phase picks are still open. Picks will be visible after they are locked.
        </p>
      )}
      {!groupPreLock && knockoutPicksOpen && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          Knockout picks are still open. Knockout bracket picks will be visible once locked.
        </p>
      )}

      {/* Desktop table */}
      <div className="hidden md:block">
        <StandingsTable
          standings={standings}
          poolSlug={poolSlug}
          groupPreLock={groupPreLock}
          showPoints={showPoints}
          showLinks={showLinks}
          knockoutPicksOpen={knockoutPicksOpen}
          groupPickCounts={groupPickCounts}
          knockoutPickCounts={knockoutPickCounts}
        />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {standings.map((row) => (
          <StandingsCard
            key={row.pick_set_id}
            row={row}
            poolSlug={poolSlug}
            groupPreLock={groupPreLock}
            showPoints={showPoints}
            showLinks={showLinks}
            knockoutPicksOpen={knockoutPicksOpen}
            groupPickCount={groupPickCounts[row.pick_set_id] ?? 0}
            knockoutPickCount={knockoutPickCounts[row.pick_set_id] ?? 0}
          />
        ))}
      </div>
    </div>
  );
}

function StandingsTable({
  standings,
  poolSlug,
  groupPreLock,
  showPoints,
  showLinks,
  knockoutPicksOpen,
  groupPickCounts,
  knockoutPickCounts,
}: {
  standings: StandingsRow[];
  poolSlug: string;
  groupPreLock: boolean;
  showPoints: boolean;
  showLinks: boolean;
  knockoutPicksOpen: boolean;
  groupPickCounts: Record<string, number>;
  knockoutPickCounts: Record<string, number>;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-surface-raised)] text-left">
            {showPoints && (
              <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] w-12">
                #
              </th>
            )}
            <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)]">
              Player
            </th>
            {groupPreLock && (
              <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                Group Picks
              </th>
            )}
            {knockoutPicksOpen && (
              <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                Knockout Picks
              </th>
            )}
            {showPoints && (
              <>
                <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                  Group
                </th>
                <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                  Knockout
                </th>
                <th className="px-4 py-2.5 font-semibold text-[var(--color-text-secondary)] text-right">
                  Total
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {standings.map((row, i) => {
            const groupCount = groupPickCounts[row.pick_set_id] ?? 0;
            const knockoutCount = knockoutPickCounts[row.pick_set_id] ?? 0;

            return (
              <tr
                key={row.pick_set_id}
                className={cn(
                  "bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] transition-colors",
                  showPoints && i < 3 && "font-medium"
                )}
              >
                {showPoints && (
                  <td className="px-4 py-3">
                    <RankBadge rank={row.rank ?? i + 1} />
                  </td>
                )}
                <td className="px-4 py-3">
                  {showLinks ? (
                    <Link
                      href={`/${poolSlug}/picks/${row.pick_set_id}`}
                      className="font-medium text-pitch-600 hover:text-pitch-700 hover:underline truncate block transition-colors"
                    >
                      {row.pick_set_name}
                    </Link>
                  ) : (
                    <span className="font-medium">{row.pick_set_name}</span>
                  )}
                </td>
                {groupPreLock && (
                  <td className="px-4 py-3 text-right">
                    <PickProgress current={groupCount} total={72} />
                  </td>
                )}
                {knockoutPicksOpen && (
                  <td className="px-4 py-3 text-right">
                    <PickProgress current={knockoutCount} total={31} />
                  </td>
                )}
                {showPoints && (
                  <>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.group_points}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.knockout_points}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">
                      {row.total_points}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StandingsCard({
  row,
  poolSlug,
  groupPreLock,
  showPoints,
  showLinks,
  knockoutPicksOpen,
  groupPickCount,
  knockoutPickCount,
}: {
  row: StandingsRow;
  poolSlug: string;
  groupPreLock: boolean;
  showPoints: boolean;
  showLinks: boolean;
  knockoutPicksOpen: boolean;
  groupPickCount: number;
  knockoutPickCount: number;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {showPoints && <RankBadge rank={row.rank ?? 0} />}
            <span
              className={cn(
                "font-display font-semibold truncate",
                showLinks && "text-pitch-600"
              )}
            >
              {row.pick_set_name}
            </span>
          </div>
        </div>
        {showPoints && (
          <div className="text-right shrink-0 ml-3">
            <p className="text-lg font-bold tabular-nums">{row.total_points}</p>
            <p className="text-2xs text-[var(--color-text-muted)]">pts</p>
          </div>
        )}
      </div>

      {groupPreLock && (
        <div className="flex gap-4 mt-2 text-xs text-[var(--color-text-secondary)]">
          <PickProgress current={groupPickCount} total={72} />
        </div>
      )}

      {knockoutPicksOpen && (
        <div className="flex gap-4 mt-2 text-xs text-[var(--color-text-secondary)]">
          <PickProgress current={knockoutPickCount} total={31} label="Knockout" />
        </div>
      )}

      {showPoints && !knockoutPicksOpen && (
        <div className={cn("flex gap-4 mt-2 text-xs text-[var(--color-text-secondary)]", showPoints && "ml-8")}>
          <span>Group: {row.group_points}</span>
          <span>Knockout: {row.knockout_points}</span>
        </div>
      )}

      {showPoints && knockoutPicksOpen && (
        <div className="flex gap-4 mt-2 ml-8 text-xs text-[var(--color-text-secondary)]">
          <span>Group: {row.group_points}</span>
        </div>
      )}
    </>
  );

  if (showLinks) {
    return (
      <Link
        href={`/${poolSlug}/picks/${row.pick_set_id}`}
        className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-pitch-400 hover:shadow-sm transition-all"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      {content}
    </div>
  );
}

function PickProgress({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label?: string;
}) {
  const isComplete = current >= total;
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        isComplete ? "text-pitch-600 font-medium" : "text-[var(--color-text-muted)]"
      )}
    >
      {label && <span className="mr-1">{label}:</span>}
      {current} of {total}
      {isComplete && " ✓"}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles =
    rank === 1
      ? "bg-gold-100 text-gold-700 border-gold-200"
      : rank === 2
        ? "bg-gray-100 text-gray-600 border-gray-200"
        : rank === 3
          ? "bg-orange-50 text-orange-600 border-orange-200"
          : "bg-transparent text-[var(--color-text-muted)] border-transparent";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border",
        styles
      )}
    >
      {rank}
    </span>
  );
}
