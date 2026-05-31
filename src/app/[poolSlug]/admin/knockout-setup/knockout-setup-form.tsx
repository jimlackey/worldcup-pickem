"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { assignKnockoutTeamsAction } from "../actions";
import type { AdminActionResult } from "../actions";
import type { MatchWithTeams, Team, Group } from "@/types/database";
import { getR32Slots, type R32Slot } from "@/lib/picks/r32-slots";
import { cn } from "@/lib/utils/cn";

interface KnockoutSetupFormProps {
  matches: MatchWithTeams[];
  teams: Team[];
  groups: Group[];
  poolId: string;
  poolSlug: string;
}

// ---------------------------------------------------------------------------
// Bracket wiring — mirrors src/components/picks/pick-set-bracket-view.tsx
// and src/app/[poolSlug]/my-picks/[pickSetId]/knockout/bracket-picker.tsx so
// the knockout-setup admin page lays out visually the same as the bracket
// pickers/views the players see.
//
// R32 (73–88) → R16 (89–96) → QF (97–100) → SF (101–102) → Final (103)
//
// Only R32 matches are editable on this page — that's where the admin picks
// who-plays-who at the start of the bracket. Deeper rounds (R16 onward) are
// populated by advancing winners and are rendered here as narrow, read-only
// placeholders so the bracket structure is still visible without forcing
// the page to scroll horizontally.
// ---------------------------------------------------------------------------

const LEFT_R32 = [73, 74, 75, 76, 77, 78, 79, 80];
const RIGHT_R32 = [81, 82, 83, 84, 85, 86, 87, 88];
const LEFT_R16 = [89, 90, 91, 92];
const RIGHT_R16 = [93, 94, 95, 96];
const LEFT_QF = [97, 98];
const RIGHT_QF = [99, 100];
const LEFT_SF = [101];
const RIGHT_SF = [102];
const FINAL = [103];

export function KnockoutSetupForm({
  matches,
  teams,
  groups,
  poolId,
  poolSlug,
}: KnockoutSetupFormProps) {
  // Map each team's group_id → its group letter ("A".."L"), so the editable
  // R32 cards can filter their dropdowns down to the groups eligible for
  // each slot (see r32-slots.ts). Built once and passed down.
  const groupLetterById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.letter);
    return m;
  }, [groups]);

  // Index matches by match_number so each bracket column can pull the right
  // record by position. Matches outside the standard 73–103 numbering get
  // rendered in a fallback section so an admin still sees them.
  const matchByNumber = new Map<number, MatchWithTeams>();
  for (const m of matches) {
    if (m.match_number != null) matchByNumber.set(m.match_number, m);
  }

  const standardNumbers = new Set<number>([
    ...LEFT_R32,
    ...RIGHT_R32,
    ...LEFT_R16,
    ...RIGHT_R16,
    ...LEFT_QF,
    ...RIGHT_QF,
    ...LEFT_SF,
    ...RIGHT_SF,
    ...FINAL,
  ]);
  const otherMatches = matches.filter(
    (m) => m.match_number == null || !standardNumbers.has(m.match_number)
  );

  // Two display modes, surfaced as tabs:
  //   "Filtered" (default) — dropdowns constrained to each slot's eligible
  //                          groups, with the official bracket hints (1E,
  //                          3ABCDF, …) as placeholders.
  //   "All"               — every dropdown lists all countries with generic
  //                          Home/Away placeholders. A manual-override escape
  //                          hatch if the slot mapping is ever wrong for a
  //                          given tournament.
  // Both modes use the same cards, the same per-match save, and the same
  // server-side validation (duplicate-country + TBD rules live in the
  // action and are unaffected by this toggle).
  const [filtered, setFiltered] = useState(true);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Knockout setup mode"
        className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={filtered}
          onClick={() => setFiltered(true)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            filtered
              ? "bg-pitch-600 text-white"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          )}
        >
          Filtered
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!filtered}
          onClick={() => setFiltered(false)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            !filtered
              ? "bg-pitch-600 text-white"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          )}
        >
          All
        </button>
      </div>

      <p className="text-2xs text-[var(--color-text-muted)] -mt-1">
        {filtered
          ? "Dropdowns are limited to the groups eligible for each bracket slot."
          : "Dropdowns list every country. Use this if a slot's filter looks wrong."}
      </p>

      {/* Bracket layout. The two outer R32 columns (the only editable ones)
          carry most of the width budget; the inner placeholder columns are
          narrow on purpose so the whole bracket can fit without horizontal
          scrolling on desktop. On phones the R32 cards still need a
          reasonable amount of room for their selects, so the bracket is
          wrapped in overflow-x-auto as a safety net rather than forced to
          fit at every viewport. */}
      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div
          className="grid items-stretch gap-x-1.5"
          style={{
            // R32 columns (8 matches each) get the lion's share of width;
            // the placeholder columns just need enough room to show
            // "Match XX". Total ≈ 720px so this fits inside the standard
            // app content width without scrolling on most desktops.
            gridTemplateColumns:
              "minmax(160px,1fr) 70px 70px 70px 90px 70px 70px 70px minmax(160px,1fr)",
            minWidth: 720,
          }}
        >
          {/* Column headings — use the same grid template as the bracket
              below by virtue of being inside the same grid (each label is
              its own grid cell, so each one sits exactly above its column). */}
          <ColumnHeading>R32</ColumnHeading>
          <ColumnHeading>R16</ColumnHeading>
          <ColumnHeading>QF</ColumnHeading>
          <ColumnHeading>SF</ColumnHeading>
          <ColumnHeading>Final</ColumnHeading>
          <ColumnHeading>SF</ColumnHeading>
          <ColumnHeading>QF</ColumnHeading>
          <ColumnHeading>R16</ColumnHeading>
          <ColumnHeading>R32</ColumnHeading>

          {/* Col 1: Left R32 (8) — editable */}
          <EditableColumn
            matchNumbers={LEFT_R32}
            matchByNumber={matchByNumber}
            teams={teams}
            groupLetterById={groupLetterById}
            filtered={filtered}
            poolId={poolId}
            poolSlug={poolSlug}
          />

          {/* Col 2: Left R16 (4) — placeholder */}
          <PlaceholderColumn matchNumbers={LEFT_R16} />

          {/* Col 3: Left QF (2) — placeholder */}
          <PlaceholderColumn matchNumbers={LEFT_QF} />

          {/* Col 4: Left SF (1) — placeholder */}
          <PlaceholderColumn matchNumbers={LEFT_SF} center />

          {/* Col 5: Final — placeholder, slight emphasis */}
          <PlaceholderColumn matchNumbers={FINAL} center isFinal />

          {/* Col 6: Right SF (1) — placeholder */}
          <PlaceholderColumn matchNumbers={RIGHT_SF} center />

          {/* Col 7: Right QF (2) — placeholder */}
          <PlaceholderColumn matchNumbers={RIGHT_QF} />

          {/* Col 8: Right R16 (4) — placeholder */}
          <PlaceholderColumn matchNumbers={RIGHT_R16} />

          {/* Col 9: Right R32 (8) — editable */}
          <EditableColumn
            matchNumbers={RIGHT_R32}
            matchByNumber={matchByNumber}
            teams={teams}
            groupLetterById={groupLetterById}
            filtered={filtered}
            poolId={poolId}
            poolSlug={poolSlug}
          />
        </div>
      </div>

      {/* Any non-standard knockout matches (shouldn't happen with the seeded
          tournament, but render them so an admin can still edit them rather
          than silently dropping them on the floor). */}
      {otherMatches.length > 0 && (
        <section className="pt-4">
          <h3 className="text-sm font-semibold mb-2 text-[var(--color-text-secondary)]">
            Other Matches
          </h3>
          <div className="space-y-2">
            {otherMatches.map((match) => (
              <KnockoutMatchCard
                key={match.id}
                match={match}
                teams={teams}
                groupLetterById={groupLetterById}
                filtered={filtered}
                poolId={poolId}
                poolSlug={poolSlug}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wide text-center pb-1">
      {children}
    </div>
  );
}

/**
 * Ensure the currently-selected team is present in a filtered option list.
 *
 * The slot filter narrows options to the eligible groups, but a match may
 * already hold a team that — through data drift, a hand-edit, or a team
 * whose group differs from the official slot — isn't in that filtered set.
 * A controlled <select> whose value isn't among its <option>s renders
 * blank, which would look like the saved pick vanished. So if the selected
 * id isn't already in `options`, we splice in that team (looked up from the
 * full list) at the top. No-op when nothing is selected or it's already
 * present.
 */
function withSelected(
  options: Team[],
  selectedId: string,
  allTeams: Team[]
): Team[] {
  if (!selectedId) return options;
  if (options.some((t) => t.id === selectedId)) return options;
  const selected = allTeams.find((t) => t.id === selectedId);
  return selected ? [selected, ...options] : options;
}

/**
 * Editable R32 column — full-featured assignment cards with home/away
 * selects and per-match save buttons.
 */
function EditableColumn({
  matchNumbers,
  matchByNumber,
  teams,
  groupLetterById,
  filtered,
  poolId,
  poolSlug,
}: {
  matchNumbers: number[];
  matchByNumber: Map<number, MatchWithTeams>;
  teams: Team[];
  groupLetterById: Map<string, string>;
  filtered: boolean;
  poolId: string;
  poolSlug: string;
}) {
  return (
    <div className="flex flex-col justify-around gap-2">
      {matchNumbers.map((mn) => {
        const match = matchByNumber.get(mn);
        if (!match) {
          return (
            <div
              key={mn}
              className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-2xs text-[var(--color-text-muted)] text-center"
            >
              #{mn} missing
            </div>
          );
        }
        return (
          <KnockoutMatchCard
            key={match.id}
            match={match}
            teams={teams}
            groupLetterById={groupLetterById}
            filtered={filtered}
            poolId={poolId}
            poolSlug={poolSlug}
          />
        );
      })}
    </div>
  );
}

/**
 * Placeholder column for rounds the admin doesn't fill in — R16 onward.
 * Each cell renders just "Match XX" inside a narrow card. The cards are
 * spaced with justify-around (or justify-center for single-card columns)
 * so they sit roughly at the midpoint of their feeder pairs in adjacent
 * columns, which is what makes the bracket "look like a bracket" without
 * us having to draw connector lines or compute exact slot heights.
 */
function PlaceholderColumn({
  matchNumbers,
  center,
  isFinal,
}: {
  matchNumbers: number[];
  /** Single-match columns (SF, Final) get vertically centered. */
  center?: boolean;
  /** Subtle visual emphasis for the Final card. */
  isFinal?: boolean;
}) {
  const justify = center ? "justify-center" : "justify-around";
  return (
    <div className={`flex flex-col ${justify} gap-2`}>
      {matchNumbers.map((mn) => (
        <PlaceholderCard key={mn} matchNumber={mn} isFinal={isFinal} />
      ))}
    </div>
  );
}

function PlaceholderCard({
  matchNumber,
  isFinal,
}: {
  matchNumber: number;
  isFinal?: boolean;
}) {
  return (
    <div
      className={`rounded-md border bg-[var(--color-surface-raised)] px-1 py-2 text-center text-2xs text-[var(--color-text-muted)] ${
        isFinal
          ? "border-pitch-500/40 ring-1 ring-pitch-500/20 font-semibold"
          : "border-[var(--color-border)]"
      }`}
    >
      Match {matchNumber}
    </div>
  );
}

// ---------------------------------------------------------------------------
// R32 match card — the editable form
// ---------------------------------------------------------------------------

/**
 * Each card is its own <form> so server-side useActionState validation and
 * status messages stay scoped per-match.
 *
 * Layout inside the card, top to bottom:
 *   - Header row: #match_number  ·  label
 *   - Home team select (full-width)
 *   - Away team select (full-width)
 *   - Save button (full-width)
 *   - Inline error/success message
 */
function KnockoutMatchCard({
  match,
  teams,
  groupLetterById,
  filtered,
  poolId,
  poolSlug,
}: {
  match: MatchWithTeams;
  teams: Team[];
  groupLetterById: Map<string, string>;
  filtered: boolean;
  poolId: string;
  poolSlug: string;
}) {
  const initial: AdminActionResult = { success: false };
  const [state, action, pending] = useActionState(
    assignKnockoutTeamsAction,
    initial
  );

  const router = useRouter();

  // Official bracket slots for this match (e.g. home = 1E, away = 3ABCDF).
  // Only consulted in "Filtered" mode. In "All" mode (filtered === false)
  // we treat the match as if it had no slot, so every dropdown lists all
  // countries with generic Home/Away placeholders — the manual-override
  // escape hatch. Null also for any match outside the standard R32 range
  // (the "Other Matches" fallback), regardless of mode.
  const slots = filtered ? getR32Slots(match.match_number) : null;

  // Eligible teams per side: only countries from the slot's group(s). When a
  // slot is constrained, options are filtered to teams whose group letter is
  // in the slot's eligible set; sorted alphabetically for easy scanning.
  // With no slot (non-standard match) we fall back to the full team list.
  const optionsForSlot = (slot: R32Slot | null): Team[] => {
    if (!slot) return teams;
    const eligible = new Set(slot.groups);
    return teams
      .filter((t) => {
        const letter = t.group_id ? groupLetterById.get(t.group_id) : null;
        return letter ? eligible.has(letter) : false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const homeOptions = optionsForSlot(slots?.home ?? null);
  const awayOptions = optionsForSlot(slots?.away ?? null);

  // Placeholder text for the empty option: the official bracket hint
  // ("1E", "3ABCDF") when known, else the original generic prompt.
  const homePlaceholder = slots ? slots.home.hint : "Home...";
  const awayPlaceholder = slots ? slots.away.hint : "Away...";

  // Controlled state for the two selects.
  //
  // Why controlled instead of uncontrolled with `defaultValue`?
  //   1. Once the user changes a select and clicks Update, the action runs
  //      server-side. If we used `defaultValue` the visible value was at the
  //      mercy of whether/when the server route revalidated and re-rendered
  //      this client component with the new prop — and any re-render that
  //      happens before the new server data arrives reinitializes the
  //      `<select>` from the *stale* prop, making it look like the change
  //      was reverted (this was actually a bug we hit before this change).
  //   2. Controlled state means what the user picked sticks visually, full
  //      stop. The DB is updated by the server action; the local state
  //      already matches that, so the UI is consistent the moment the
  //      action returns.
  //
  // The useEffect below keeps the local state in sync with the canonical
  // server prop. So if the page is revalidated (or refreshed externally,
  // or another admin updates this match in another tab and you hit the
  // page again) the select honors the new prop value.
  const [homeTeamId, setHomeTeamId] = useState<string>(
    match.home_team_id ?? ""
  );
  const [awayTeamId, setAwayTeamId] = useState<string>(
    match.away_team_id ?? ""
  );

  useEffect(() => {
    setHomeTeamId(match.home_team_id ?? "");
  }, [match.home_team_id]);
  useEffect(() => {
    setAwayTeamId(match.away_team_id ?? "");
  }, [match.away_team_id]);

  // After a successful save, force the router to re-fetch server components
  // for the current route. This works regardless of how (or whether) the
  // server action's revalidatePath call propagates — the page will always
  // come back with fresh `match.home_team_id` / `match.away_team_id` props,
  // which then flow through the useEffects above to re-sync local state if
  // anything has drifted.
  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state, router]);

  const hasTeams = match.home_team_id && match.away_team_id;

  return (
    <form
      action={action}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
    >
      <input type="hidden" name="matchId" value={match.id} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="poolSlug" value={poolSlug} />

      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-2xs font-medium text-[var(--color-text-muted)]">
          #{match.match_number}
        </span>
        <span className="text-2xs text-[var(--color-text-muted)] truncate text-right min-w-0 flex-1">
          {match.label}
        </span>
      </div>

      <div className="space-y-1.5">
        <select
          name="homeTeamId"
          value={homeTeamId}
          onChange={(e) => setHomeTeamId(e.target.value)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-2xs focus:ring-2 focus:ring-pitch-500/40 outline-none"
        >
          <option value="">{homePlaceholder}</option>
          {withSelected(homeOptions, homeTeamId, teams).map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_code} — {t.name}
            </option>
          ))}
        </select>

        <select
          name="awayTeamId"
          value={awayTeamId}
          onChange={(e) => setAwayTeamId(e.target.value)}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-2xs focus:ring-2 focus:ring-pitch-500/40 outline-none"
        >
          <option value="">{awayPlaceholder}</option>
          {withSelected(awayOptions, awayTeamId, teams).map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_code} — {t.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-pitch-600 px-2 py-1 text-2xs font-semibold text-white hover:bg-pitch-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "..." : hasTeams ? "Update" : "Set"}
        </button>
      </div>

      {state.error && (
        <p className="text-2xs text-red-600 mt-1 break-words">{state.error}</p>
      )}
      {state.success && (
        <p className="text-2xs text-pitch-600 mt-1 break-words">
          {state.message}
        </p>
      )}
    </form>
  );
}
