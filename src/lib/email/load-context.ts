import { supabaseAdmin } from "@/lib/supabase/server";
import { TOURNAMENT_ID } from "@/lib/utils/constants";
import { filterMatchesForPool } from "@/lib/picks/bracket-wiring";
import { getStandings } from "@/lib/tournament/standings";
import { getPoolMembers } from "@/lib/pool/queries";
import {
  isPickSetGroupIncomplete,
  isPickSetKnockoutIncomplete,
  type MissingPicksMatch,
  type MissingPicksTeam,
} from "./missing-picks";
import type { ParticipantPickSetForExpansion } from "./expand-widgets";
import type {
  Pool,
  StandingsRow,
  PoolMembership,
  Participant,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Pool-wide email-context loader.
//
// Both the email composer page (server-rendered preview) and the broadcast
// action (real per-recipient sends) need exactly the same pool-wide
// snapshot:
//
//   - active members
//   - all matches (filtered by pool consolation flag), split by phase
//   - team id → name lookup
//   - per-pick-set picked-match-id sets and correct counts
//   - the pool's "any knockout graded yet?" flag
//   - the ranked standings
//   - per-participant rollups (the shape expandWidgetsForParticipant() wants)
//   - per-participant completion flags (drives the recipient-list filter
//     and the dropdown counts)
//
// Gathering this twice was a maintenance bomb — every change had to be
// duplicated. Centralising it here means the action and the page can't
// drift, and the preview the admin sees is computed by the same pipeline
// the real send will run for that same player.
//
// Pagination matters: medium-large pools have >1000 pick-row payloads
// (14 pick sets × 72 group picks = 1008 rows hits the supabase default
// .select() cap). We page through with .range() so the rollup is
// exhaustive.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;
const MAX_PAGED_ROWS = 1_000_000;

async function fetchPaginated<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown }>
): Promise<Row[]> {
  const all: Row[] = [];
  let from = 0;
  while (from < MAX_PAGED_ROWS) {
    const to = from + PAGE_SIZE - 1;
    const { data } = await build(from, to);
    const rows = (data as Row[] | null) ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

// ---- Shapes -----------------------------------------------------------------

export interface EmailContextActiveMember
  extends PoolMembership {
  participant: Participant;
}

export interface EmailContextParticipantRollup {
  /** Pick sets in the shape expandWidgetsForParticipant() expects. */
  pickSets: ParticipantPickSetForExpansion[];
  /** At least one pick set is missing group picks, OR the participant
   *  has zero pick sets at all. */
  hasGroupIncomplete: boolean;
  /** Same, for knockout. */
  hasKnockoutIncomplete: boolean;
}

export interface EmailContext {
  pool: Pool;
  /** Active members with email, eligible to receive email. */
  activeMembers: EmailContextActiveMember[];
  /** Active group-phase matches for the pool. */
  groupMatches: MissingPicksMatch[];
  /** Active knockout matches (filtered by pool consolation flag). */
  knockoutMatches: MissingPicksMatch[];
  /** team_id → { id, name } lookup, used by the missing-picks widgets. */
  teamsById: Map<string, MissingPicksTeam>;
  /** Pool standings (used by the standings-summary widget). */
  standings: StandingsRow[];
  /** True when any knockout pick anywhere has been graded. Drives the
   *  "Not yet started" branch of the standings widget. */
  knockoutPhaseStarted: boolean;
  /** participant_id → rollup. Includes every active member. */
  rollupByParticipant: Map<string, EmailContextParticipantRollup>;
}

// ---- Loader -----------------------------------------------------------------

export async function loadEmailContext(pool: Pool): Promise<EmailContext> {
  // ---- Active members ------------------------------------------------------
  const allMembers = await getPoolMembers(pool.id);
  const activeMembers = allMembers.filter(
    (m) =>
      m.is_active &&
      m.participant.is_active !== false &&
      m.participant.email &&
      m.participant.email.length > 0
  );

  // ---- Tournament data -----------------------------------------------------
  // Demo pools have their own match rows; real pools share the global
  // (pool_id IS NULL) set. Mirrors lib/tournament/queries.ts.
  const tournamentPoolFilter = pool.is_demo ? pool.id : null;

  let matchesQuery = supabaseAdmin
    .from("matches")
    .select(
      "id, phase, match_number, home_team_id, away_team_id, result, status"
    )
    .eq("tournament_id", TOURNAMENT_ID)
    .order("match_number");

  let teamsQuery = supabaseAdmin
    .from("teams")
    .select("id, name")
    .eq("tournament_id", TOURNAMENT_ID);

  if (tournamentPoolFilter) {
    matchesQuery = matchesQuery.eq("pool_id", tournamentPoolFilter);
    teamsQuery = teamsQuery.eq("pool_id", tournamentPoolFilter);
  } else {
    matchesQuery = matchesQuery.is("pool_id", null);
    teamsQuery = teamsQuery.is("pool_id", null);
  }

  // ---- Pick sets -----------------------------------------------------------
  // Ordered by created_at so "Jim 1" precedes "Jim 2" in the widget output.
  const pickSetsQuery = supabaseAdmin
    .from("pick_sets")
    .select("id, name, participant_id")
    .eq("pool_id", pool.id)
    .eq("is_active", true)
    .order("created_at");

  // Parallel fetches.
  const [matchesRes, teamsRes, pickSetsRes, standings] = await Promise.all([
    matchesQuery,
    teamsQuery,
    pickSetsQuery,
    getStandings(pool.id),
  ]);

  const rawMatches = (matchesRes.data ?? []) as MissingPicksMatch[];
  const teams = (teamsRes.data ?? []) as MissingPicksTeam[];
  const pickSetRows = (pickSetsRes.data ?? []) as {
    id: string;
    name: string;
    participant_id: string;
  }[];

  const activeMatches = filterMatchesForPool(rawMatches, pool);
  const groupMatches = activeMatches.filter((m) => m.phase === "group");
  const knockoutMatches = activeMatches.filter((m) => m.phase !== "group");

  const teamsById = new Map<string, MissingPicksTeam>();
  for (const t of teams) teamsById.set(t.id, t);

  // ---- Picks per pick set (paginated) --------------------------------------
  const pickSetIds = pickSetRows.map((ps) => ps.id);

  interface PickRow {
    pick_set_id: string;
    match_id: string;
    is_correct: boolean | null;
  }

  const [groupPicksRows, knockoutPicksRows] = await Promise.all([
    pickSetIds.length === 0
      ? Promise.resolve<PickRow[]>([])
      : fetchPaginated<PickRow>((from, to) =>
          supabaseAdmin
            .from("group_picks")
            .select("pick_set_id, match_id, is_correct")
            .in("pick_set_id", pickSetIds)
            .order("pick_set_id")
            .order("match_id")
            .range(from, to)
        ),
    pickSetIds.length === 0
      ? Promise.resolve<PickRow[]>([])
      : fetchPaginated<PickRow>((from, to) =>
          supabaseAdmin
            .from("knockout_picks")
            .select("pick_set_id, match_id, is_correct")
            .in("pick_set_id", pickSetIds)
            .order("pick_set_id")
            .order("match_id")
            .range(from, to)
        ),
  ]);

  const groupPickedByPickSet = new Map<string, Set<string>>();
  const knockoutPickedByPickSet = new Map<string, Set<string>>();
  const groupCorrectById = new Map<string, number>();
  const knockoutCorrectById = new Map<string, number>();
  let anyKnockoutGraded = false;

  for (const p of groupPicksRows) {
    const set = groupPickedByPickSet.get(p.pick_set_id) ?? new Set<string>();
    set.add(p.match_id);
    groupPickedByPickSet.set(p.pick_set_id, set);
    if (p.is_correct === true) {
      groupCorrectById.set(
        p.pick_set_id,
        (groupCorrectById.get(p.pick_set_id) ?? 0) + 1
      );
    }
  }

  for (const p of knockoutPicksRows) {
    const set =
      knockoutPickedByPickSet.get(p.pick_set_id) ?? new Set<string>();
    set.add(p.match_id);
    knockoutPickedByPickSet.set(p.pick_set_id, set);
    if (p.is_correct !== null) anyKnockoutGraded = true;
    if (p.is_correct === true) {
      knockoutCorrectById.set(
        p.pick_set_id,
        (knockoutCorrectById.get(p.pick_set_id) ?? 0) + 1
      );
    }
  }

  // ---- Per-participant rollup ---------------------------------------------
  // Seed every active participant with a "no pick sets = incomplete in
  // both phases" baseline; clear and OR-in real flags as we encounter
  // their pick sets. This gives the semantics:
  //
  //   - 0 pick sets             → both flags TRUE (player hasn't started)
  //   - 1+ pick sets, all done  → both flags FALSE
  //   - 1+ pick sets, any miss  → corresponding flag TRUE
  const groupMatchCount = groupMatches.length;
  const knockoutMatchCount = knockoutMatches.length;

  const rollupByParticipant = new Map<
    string,
    EmailContextParticipantRollup
  >();

  for (const m of activeMembers) {
    rollupByParticipant.set(m.participant_id, {
      pickSets: [],
      hasGroupIncomplete: true,
      hasKnockoutIncomplete: true,
    });
  }

  const seenPickSetForParticipant = new Set<string>();

  for (const ps of pickSetRows) {
    const rollup = rollupByParticipant.get(ps.participant_id);
    if (!rollup) continue;

    if (!seenPickSetForParticipant.has(ps.participant_id)) {
      rollup.hasGroupIncomplete = false;
      rollup.hasKnockoutIncomplete = false;
      seenPickSetForParticipant.add(ps.participant_id);
    }

    const groupPicked =
      groupPickedByPickSet.get(ps.id) ?? new Set<string>();
    const knockoutPicked =
      knockoutPickedByPickSet.get(ps.id) ?? new Set<string>();

    rollup.pickSets.push({
      pick_set_id: ps.id,
      pick_set_name: ps.name,
      group_correct: groupCorrectById.get(ps.id) ?? 0,
      knockout_correct: knockoutCorrectById.get(ps.id) ?? 0,
      groupPickedMatchIds: groupPicked,
      knockoutPickedMatchIds: knockoutPicked,
    });

    const completion = {
      groupMatchCount,
      knockoutMatchCount,
      groupPickedCount: groupPicked.size,
      knockoutPickedCount: knockoutPicked.size,
    };
    if (isPickSetGroupIncomplete(completion)) {
      rollup.hasGroupIncomplete = true;
    }
    if (isPickSetKnockoutIncomplete(completion)) {
      rollup.hasKnockoutIncomplete = true;
    }
  }

  return {
    pool,
    activeMembers,
    groupMatches,
    knockoutMatches,
    teamsById,
    standings,
    knockoutPhaseStarted: anyKnockoutGraded,
    rollupByParticipant,
  };
}
