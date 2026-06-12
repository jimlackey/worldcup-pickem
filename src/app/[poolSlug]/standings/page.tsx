import { supabaseAdmin } from "@/lib/supabase/server";
import { getStandings } from "@/lib/tournament/standings";
import { countPicksByPickSet } from "@/lib/picks/pick-counts";
import { isGroupPhaseOpen, isKnockoutPhaseOpen } from "@/lib/picks/validation";
import { getPoolSession } from "@/lib/auth/session";
import { getFavoritePickSetIds } from "@/lib/favorites/queries";
import { getThirdPlacePicksByPickSet } from "@/lib/third-place/queries";
import { getThirdPlaceTabRows } from "@/lib/third-place/standings-tab";
import { getFinalPicksByPickSet } from "@/lib/picks/standings-extras";
import type { Pool } from "@/types/database";
import { StandingsView } from "./standings-view";

interface StandingsPageProps {
  params: Promise<{ poolSlug: string }>;
}

export default async function StandingsPage({ params }: StandingsPageProps) {
  const { poolSlug } = await params;

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("*")
    .eq("slug", poolSlug)
    .eq("is_active", true)
    .single();

  if (!pool) return <p>Pool not found.</p>;

  const typedPool = pool as Pool;
  const standings = await getStandings(pool.id);

  const groupOpen = isGroupPhaseOpen(typedPool);
  const knockoutOpen = isKnockoutPhaseOpen(typedPool);

  // Phase 4 distinguisher — group locked + knockout once-open-now-locked.
  // Used downstream to decide whether the "Tourney winner" cell shows
  // a team or an empty placeholder. We compute it server-side so the
  // view stays a pure presentational tree without a clock dependency.
  // Mirrors the derivation in pick-set-dashboard.tsx (`knockoutLocked`).
  const now = Date.now();
  const knockoutLocked =
    !!typedPool.knockout_lock_at &&
    now >= new Date(typedPool.knockout_lock_at).getTime();

  // ---- Favorites ----
  //
  // Favorites are keyed on pick set (not participant), so each row's
  // star is independent. A user can favorite "Heather Collins 1"
  // without also picking up 2 and 3.
  //
  // Session-bound and pool-bound: a guest sees the tab but the star
  // icons aren't shown (they have no participant_id to attribute a
  // favorite to). The StandingsView still receives the data so it can
  // render the disabled-tab state in one place.
  const session = await getPoolSession(pool.id, pool.slug);
  const favoriteIds = session
    ? await getFavoritePickSetIds(pool.id, session.participantId)
    : new Set<string>();

  // If group picks are still open, fetch pick counts per pick set
  // so we can show progress (e.g. "63 of 72").
  //
  // NOTE: counts are paginated. With ~14+ pick sets fully filled out
  // (14 × 72 = 1008 rows) the un-paginated query was hitting Supabase's
  // default 1000-row cap, which left some pick sets reporting 0/72 even
  // though they were complete. countPicksByPickSet pages through with
  // .range() so the rollup is exhaustive.
  let pickCounts: Record<string, number> = {};
  let knockoutPickCounts: Record<string, number> = {};

  const pickSetIds = standings.map((s) => s.pick_set_id);

  if (groupOpen || knockoutOpen) {
    if (pickSetIds.length > 0) {
      if (groupOpen) {
        pickCounts = await countPicksByPickSet("group_picks", pickSetIds);
      }
      if (knockoutOpen) {
        knockoutPickCounts = await countPicksByPickSet(
          "knockout_picks",
          pickSetIds
        );
      }
    }
  }

  // ---- 3rd Place + Tourney Winner picks ----
  //
  // Two new lookups, both keyed on pick_set_id. The column visibility
  // gates in StandingsView decide whether these are actually surfaced
  // in any given phase; we also gate the FETCHES here on the same
  // privacy rules so a pick set's chosen team never goes over the
  // wire to the client during a phase when it shouldn't be visible.
  //
  // - During the Group Phase (open), other players' picks are private.
  //   The third-place team is part of "group picks" effectively (made
  //   during the group phase, gated by the group lock). We send only
  //   a yes/no presence map — no team identifiers — and the view
  //   renders the indicator from that.
  //
  // - The Final pick is a knockout pick, so it's private until the
  //   knockout phase has fully locked. Pre-lock we don't fetch the
  //   data at all; the view renders empty cells in those phases.
  let thirdPlacePicksRecord: Record<
    string,
    { teamName: string; teamCode: string; flagCode: string }
  > = {};
  // Distinct yes/no map for phase 1, kept separate from the team-data
  // map so the privacy boundary is enforced at the type level — there
  // is no path by which a phase-1 client receives team identifiers.
  let thirdPlacePresenceRecord: Record<string, true> = {};
  let finalPicksRecord: Record<
    string,
    { teamName: string; teamCode: string; flagCode: string }
  > = {};

  if (pickSetIds.length > 0) {
    if (groupOpen) {
      // Phase 1 — fetch only the presence (pick_set_id list), not the
      // teams. The client-side indicator reads from
      // thirdPlacePresenceRecord; thirdPlacePicksRecord stays empty.
      const { data: presence } = await supabaseAdmin
        .from("third_place_picks")
        .select("pick_set_id")
        .in("pick_set_id", pickSetIds);
      for (const r of (presence ?? []) as { pick_set_id: string }[]) {
        thirdPlacePresenceRecord[r.pick_set_id] = true;
      }
    } else {
      // Phase 2+ — group has locked, picks are public. Fetch the
      // full team data for the column display.
      const thirdPlaceMap = await getThirdPlacePicksByPickSet(pickSetIds);
      for (const [id, row] of thirdPlaceMap.entries()) {
        thirdPlacePicksRecord[id] = {
          teamName: row.pickedTeamName,
          teamCode: row.pickedTeamCode,
          flagCode: row.pickedTeamFlagCode,
        };
      }
    }

    if (knockoutLocked) {
      // Phase 4 — knockout has locked, the Final pick is public.
      // Pre-lock we don't issue the read at all so the team identifier
      // can't be peeled out of the network payload.
      const finalMap = await getFinalPicksByPickSet(pool.id, pickSetIds);
      for (const [id, team] of finalMap.entries()) {
        finalPicksRecord[id] = {
          teamName: team.name,
          teamCode: team.code,
          flagCode: team.flagCode,
        };
      }
    }
  }

  // Phase-derived flags the view leans on for column visibility:
  //   - showThirdPlaceColumn: gated on the pool's consolation mode.
  //     The column appears in all four phases when the feature is on;
  //     content varies per phase (indicator vs team flag).
  //   - showTourneyWinnerColumn: gated on "group has locked". Phases
  //     2, 3, 4 → visible; phase 1 → hidden.
  const showThirdPlaceColumn =
    typedPool.consolation_mode === "preseason_pick";
  const showTourneyWinnerColumn = !groupOpen;

  // ---- 3rd Place tab ----
  //
  // Standalone side-pick tracker. Surfaced only when the consolation
  // feature is on AND the group phase has locked — the same privacy
  // boundary the 3rd-Place column uses. During the open group phase
  // team identities are hidden (presence-only), so the tab, which by
  // design reveals each pick set's chosen team, must stay hidden too.
  //
  // Rows are fetched + sorted server-side (alive first, then FIFA rank
  // ascending) and handed to the client already in display order. This
  // is an independent ordering from the overall standings — the side
  // pick has nothing to do with player rank.
  const showThirdPlaceTab = showThirdPlaceColumn && !groupOpen;
  const thirdPlaceTabRows = showThirdPlaceTab
    ? await getThirdPlaceTabRows(typedPool, pickSetIds)
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Standings</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {standings.length} player{standings.length !== 1 ? "s" : ""}
        </p>
      </div>

      <StandingsView
        standings={standings}
        poolSlug={poolSlug}
        poolId={pool.id}
        groupPicksOpen={groupOpen}
        showPlayerNamesEnabled={typedPool.show_player_names}
        knockoutPicksOpen={knockoutOpen}
        knockoutLocked={knockoutLocked}
        groupPickCounts={pickCounts}
        knockoutPickCounts={knockoutPickCounts}
        favoritePickSetIds={Array.from(favoriteIds)}
        isLoggedIn={!!session}
        showThirdPlaceColumn={showThirdPlaceColumn}
        showTourneyWinnerColumn={showTourneyWinnerColumn}
        thirdPlacePicks={thirdPlacePicksRecord}
        thirdPlacePresence={thirdPlacePresenceRecord}
        tourneyWinnerPicks={finalPicksRecord}
        showThirdPlaceTab={showThirdPlaceTab}
        thirdPlaceTabRows={thirdPlaceTabRows}
      />
    </div>
  );
}
