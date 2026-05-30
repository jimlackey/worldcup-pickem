import { supabaseAdmin } from "@/lib/supabase/server";
import { getMatches, getGroups } from "@/lib/tournament/queries";
import { isGroupPhaseOpen } from "@/lib/picks/validation";
import {
  getGroupPickDistribution,
  getKnockoutPickDistribution,
  type MatchPickDistribution,
} from "@/lib/picks/match-pick-counts";
import {
  BRACKET_FEEDERS,
  CONSOLATION_FEEDERS,
  CONSOLATION_MATCH_NUMBER,
} from "@/lib/picks/bracket-wiring";
import type { Pool } from "@/types/database";
import { MatchBrowser } from "./match-browser";

interface MatchesPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function MatchesPage({ params }: MatchesPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) return <p>Pool not found.</p>;
  const typedPool = pool as Pool;

  const [matches, groups] = await Promise.all([
    getMatches(typedPool),
    getGroups(typedPool),
  ]);

  // ---- Pick distributions (per-match aggregations) ----
  //
  // The /matches view surfaces, beneath each match row, the count and
  // percentage of pick sets that picked each outcome. PRIVACY GATE: we
  // only fetch the data once the relevant phase has locked, mirroring
  // the /match/{matchId} drilldown's "before lock, don't even query
  // them from the DB so there's no chance of leakage via view-source
  // or devtools" pattern.
  //
  //   - Group distributions surface once isGroupPhaseOpen is false
  //     (i.e. group_lock_at is in the past).
  //   - Knockout distributions surface once knockout_lock_at is in
  //     the past — which is strictly later than knockout_open_at,
  //     not the same gate. We compute it server-side here rather
  //     than reusing isKnockoutPhaseOpen, since that helper returns
  //     true ONLY during the open window and would also be false
  //     pre-open (when picks don't exist yet); we specifically need
  //     "after the lock."
  const now = Date.now();
  const groupLocked = !isGroupPhaseOpen(typedPool);
  const knockoutLocked =
    !!typedPool.knockout_lock_at &&
    now >= new Date(typedPool.knockout_lock_at).getTime();

  // Build the home/away lookup the knockout aggregator needs to split picks
  // into home / away / other.
  //
  // PROBLEM: a later-round match (e.g. a QF) only has its home_team_id /
  // away_team_id columns populated once results have advanced teams into it.
  // Before that they're null, so the aggregator can't recognise any picked
  // team as a participant and dumps everyone into "Other" — even though the
  // bracket view DOES show participants (it derives them from feeder
  // winners). That mismatch is exactly the "COD vs MAR both at 0%, Other
  // 100%" bug.
  //
  // FIX: derive each knockout match's participants the same way the bracket
  // does — from the ACTUAL results of its feeder matches (winners for the
  // championship path, losers for the consolation match) — and fall back to
  // that when the DB columns are null. We resolve in match-number order so a
  // feeder's derived winner is available to the match it feeds (R32 → R16 →
  // QF → SF → Final). The aggregator then buckets against the real
  // participants, matching what the bracket renders.
  const matchByNumber = new Map<number, (typeof matches)[number]>();
  for (const m of matches) {
    if (m.match_number != null) matchByNumber.set(m.match_number, m);
  }

  // Derived participant ids per match id. Seeded with the DB columns, then
  // filled in from feeder results where a slot is still null.
  const derivedTeams = new Map<
    string,
    { home_team_id: string | null; away_team_id: string | null }
  >();

  // Winner / loser of a completed match, by actual result. Returns null when
  // the match isn't completed or the relevant team id is missing.
  const winnerOf = (m: (typeof matches)[number] | undefined): string | null => {
    if (!m || m.status !== "completed" || !m.result) return null;
    return m.result === "home" ? m.home_team_id ?? null : m.away_team_id ?? null;
  };
  const loserOf = (m: (typeof matches)[number] | undefined): string | null => {
    if (!m || m.status !== "completed" || !m.result) return null;
    return m.result === "home" ? m.away_team_id ?? null : m.home_team_id ?? null;
  };

  // Process knockout matches in match-number order so feeders are resolved
  // before the matches they feed.
  const knockoutSorted = matches
    .filter((m) => m.phase !== "group")
    .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));

  for (const m of knockoutSorted) {
    let homeId = m.home_team_id ?? null;
    let awayId = m.away_team_id ?? null;

    if ((!homeId || !awayId) && m.match_number != null) {
      if (m.match_number === CONSOLATION_MATCH_NUMBER) {
        // Consolation #104: home = loser of SF1, away = loser of SF2.
        const [feederA, feederB] = CONSOLATION_FEEDERS;
        homeId = homeId ?? loserOf(matchByNumber.get(feederA));
        awayId = awayId ?? loserOf(matchByNumber.get(feederB));
      } else {
        const feeders = BRACKET_FEEDERS[m.match_number];
        if (feeders) {
          // Look the feeder up in the derived map first (so multi-hop
          // advancement works), falling back to the live match's own result.
          const resolveWinner = (fn: number): string | null => {
            const feeder = matchByNumber.get(fn);
            // A feeder might itself have been derived (e.g. an R16 match
            // whose teams came from R32 winners) — but its WINNER still comes
            // from its actual recorded result, so winnerOf on the live row is
            // correct regardless of how its participants were derived.
            return winnerOf(feeder);
          };
          homeId = homeId ?? resolveWinner(feeders[0]);
          awayId = awayId ?? resolveWinner(feeders[1]);
        }
      }
    }

    derivedTeams.set(m.id, { home_team_id: homeId, away_team_id: awayId });
  }

  const knockoutTeamMap = derivedTeams;

  let groupDistribution = new Map<string, MatchPickDistribution>();
  let knockoutDistribution = new Map<string, MatchPickDistribution>();

  if (groupLocked || knockoutLocked) {
    // Issue the reads in parallel where possible. Either query is a
    // no-op when its gate is false.
    const [gd, kd] = await Promise.all([
      groupLocked
        ? getGroupPickDistribution(pool.id)
        : Promise.resolve(new Map<string, MatchPickDistribution>()),
      knockoutLocked
        ? getKnockoutPickDistribution(pool.id, knockoutTeamMap)
        : Promise.resolve(new Map<string, MatchPickDistribution>()),
    ]);
    groupDistribution = gd;
    knockoutDistribution = kd;
  }

  // Serialise the maps to plain objects for the client boundary —
  // Maps don't survive the server → client component prop crossing
  // in Next.js. Both maps are typically small (≤103 matches).
  const distributionRecord: Record<string, MatchPickDistribution> = {};
  for (const [k, v] of groupDistribution) distributionRecord[k] = v;
  for (const [k, v] of knockoutDistribution) distributionRecord[k] = v;

  // ---- Default view + grid filter by tournament phase ----
  //
  // The /matches page should open on the Grid view, with the Grid's
  // phase filter pre-selected to whichever phase is most relevant right
  // now:
  //
  //   Phase 1 (group picking, pre group_lock_at)          → Grid / Group
  //   Phase 2 (group matches underway, pre knockout_open) → Grid / Group
  //   Phase 3 (knockout picks underway, pre knockout_lock)→ Grid / Group
  //   Phase 4 (knockout matches underway, post-lock)      → Grid / Knockout
  //
  // The split point is knockout_lock_at: only once the knockout picks
  // have locked (Phase 4) does the bracket become the thing players want
  // to watch, so that's the single boundary that flips the default
  // filter to "knockout". `knockoutLocked` above already encodes exactly
  // that (now >= knockout_lock_at), so we reuse it.
  const defaultGridFilter: "group" | "knockout" = knockoutLocked
    ? "knockout"
    : "group";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Matches</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Select a match to see how everyone picked it.
        </p>
      </div>

      <MatchBrowser
        matches={matches}
        groups={groups}
        poolSlug={poolSlug}
        pickDistributions={distributionRecord}
        groupLocked={groupLocked}
        knockoutLocked={knockoutLocked}
        showFifaRankings={typedPool.show_fifa_rankings}
        defaultView="grid"
        defaultGridFilter={defaultGridFilter}
      />
    </div>
  );
}
