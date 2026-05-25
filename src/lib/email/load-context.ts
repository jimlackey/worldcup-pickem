import { supabaseAdmin } from "@/lib/supabase/server";
import { TOURNAMENT_ID } from "@/lib/utils/constants";
import { filterMatchesForPool } from "@/lib/picks/bracket-wiring";
import { getStandings } from "@/lib/tournament/standings";
import { getPoolMembers } from "@/lib/pool/queries";
import type {
  MatchPhase,
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
//   - per-participant rollups
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
//
// Type ownership note:
//   The interfaces below — EmailContextMatch, EmailContextTeam,
//   EmailContextPickSet — used to live in lib/email/missing-picks.ts and
//   lib/email/expand-widgets.ts (under different names) because those
//   were the original code-based widget builders. Phase 2 of the email
//   widget redesign deleted those modules and moved their shapes here,
//   the canonical loader. The recipient-data builder
//   (lib/email/recipient-data.ts) is the only downstream consumer.
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

/**
 * A match row as the email pipeline reads it. The select() in
 * loadEmailContext below produces exactly these columns; loose
 * compatibility with the wider Match table is intentional — we only
 * carry what email rendering and pick projection need.
 */
export interface EmailContextMatch {
  id: string;
  phase: MatchPhase;
  match_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  result: "home" | "draw" | "away" | null;
  status: "scheduled" | "in_progress" | "completed";
}

/** A team row as the email pipeline reads it — id and display name. */
export interface EmailContextTeam {
  id: string;
  name: string;
}

/**
 * Per-pick-set projection used by the recipient-data builder. Carries
 * both Sets (for "did the player pick this match?" checks) and Maps
 * (for "what did the player pick on this match?" lookups) so the
 * builder doesn't have to re-bucket pick rows per recipient.
 */
export interface EmailContextPickSet {
  pick_set_id: string;
  pick_set_name: string;
  group_correct: number;
  knockout_correct: number;
  /** match_ids the participant has picked. */
  groupPickedMatchIds: Set<string>;
  knockoutPickedMatchIds: Set<string>;
  /** match_id → pick value, for rendering WHICH side the player chose. */
  groupPicksByMatchId: Map<string, "home" | "draw" | "away">;
  knockoutPicksByMatchId: Map<string, "home" | "away">;
}

export interface EmailContextActiveMember extends PoolMembership {
  participant: Participant;
}

export interface EmailContextParticipantRollup {
  /** Pick sets owned by the participant. */
  pickSets: EmailContextPickSet[];
  /** At least one pick set is missing group picks, OR the participant
   *  has zero pick sets at all. */
  hasGroupIncomplete: boolean;
  /** Same, for knockout. */
  hasKnockoutIncomplete: boolean;
  /**
   * At least one of the participant's pick sets is unpaid — meaning
   * either there's no `pool_payments` row for it yet (default-unpaid)
   * or the row's `is_paid` is false.
   *
   * Unlike the incomplete-pick flags, this defaults to FALSE for a
   * participant with zero pick sets: a member who never entered can't
   * owe money. The incomplete-pick flags use a "remind anyone who
   * hasn't started" default; the unpaid flag does not, because
   * payments are a function of having entered at all.
   */
  hasUnpaidPickSet: boolean;
}

export interface EmailContext {
  pool: Pool;
  /** Active members with email, eligible to receive email. */
  activeMembers: EmailContextActiveMember[];
  /** Active group-phase matches for the pool. */
  groupMatches: EmailContextMatch[];
  /** Active knockout matches (filtered by pool consolation flag). */
  knockoutMatches: EmailContextMatch[];
  /** team_id → { id, name } lookup. */
  teamsById: Map<string, EmailContextTeam>;
  /** Pool standings. */
  standings: StandingsRow[];
  /** True when any knockout pick anywhere has been graded. */
  knockoutPhaseStarted: boolean;
  /** participant_id → rollup. Includes every active member. */
  rollupByParticipant: Map<string, EmailContextParticipantRollup>;
}

// ---- Completion predicates --------------------------------------------------
// Used by the rollup to decide which pick sets count as "incomplete"
// for the recipient-list filter. Inlined here from the deleted
// missing-picks.ts module; kept as named functions so the call sites
// in this file read naturally and future variants stay easy to find.

interface PickSetCompletionInput {
  groupMatchCount: number;
  knockoutMatchCount: number;
  groupPickedCount: number;
  knockoutPickedCount: number;
}

function isPickSetGroupIncomplete(c: PickSetCompletionInput): boolean {
  return c.groupPickedCount < c.groupMatchCount;
}

function isPickSetKnockoutIncomplete(c: PickSetCompletionInput): boolean {
  return c.knockoutPickedCount < c.knockoutMatchCount;
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

  const rawMatches = (matchesRes.data ?? []) as EmailContextMatch[];
  const teams = (teamsRes.data ?? []) as EmailContextTeam[];
  const pickSetRows = (pickSetsRes.data ?? []) as {
    id: string;
    name: string;
    participant_id: string;
  }[];

  const activeMatches = filterMatchesForPool(rawMatches, pool);
  const groupMatches = activeMatches.filter((m) => m.phase === "group");
  const knockoutMatches = activeMatches.filter((m) => m.phase !== "group");

  const teamsById = new Map<string, EmailContextTeam>();
  for (const t of teams) teamsById.set(t.id, t);

  // ---- Picks per pick set (paginated) --------------------------------------
  const pickSetIds = pickSetRows.map((ps) => ps.id);

  // We fetch `pick` as well as `is_correct` because the recipient-data
  // builder needs to render WHICH side the player picked, not just
  // whether they picked. The DB column is a constrained string
  // ("home" | "draw" | "away" in group_picks; "home" | "away" in
  // knockout_picks).
  interface GroupPickRow {
    pick_set_id: string;
    match_id: string;
    pick: "home" | "draw" | "away";
    is_correct: boolean | null;
  }
  interface KnockoutPickRow {
    pick_set_id: string;
    match_id: string;
    pick: "home" | "away";
    is_correct: boolean | null;
  }

  interface PaymentRow {
    pick_set_id: string;
    is_paid: boolean;
  }

  const [groupPicksRows, knockoutPicksRows, paymentsRows] = await Promise.all([
    pickSetIds.length === 0
      ? Promise.resolve<GroupPickRow[]>([])
      : fetchPaginated<GroupPickRow>((from, to) =>
          supabaseAdmin
            .from("group_picks")
            .select("pick_set_id, match_id, pick, is_correct")
            .in("pick_set_id", pickSetIds)
            .order("pick_set_id")
            .order("match_id")
            .range(from, to)
        ),
    pickSetIds.length === 0
      ? Promise.resolve<KnockoutPickRow[]>([])
      : fetchPaginated<KnockoutPickRow>((from, to) =>
          supabaseAdmin
            .from("knockout_picks")
            .select("pick_set_id, match_id, pick, is_correct")
            .in("pick_set_id", pickSetIds)
            .order("pick_set_id")
            .order("match_id")
            .range(from, to)
        ),
    // Payments — bounded by pick set count (one row per pick set max),
    // so a single page is sufficient. We only need pick_set_id and
    // is_paid to derive the "any unpaid pick set?" rollup; notes are
    // an admin-side concern and aren't used in the email path.
    pickSetIds.length === 0
      ? Promise.resolve<PaymentRow[]>([])
      : (async () => {
          const { data } = await supabaseAdmin
            .from("pool_payments")
            .select("pick_set_id, is_paid")
            .eq("pool_id", pool.id);
          return (data ?? []) as PaymentRow[];
        })(),
  ]);

  // Set of pick set IDs that have an EXPLICIT is_paid=true row. Pick
  // sets with no row, or rows with is_paid=false, are considered
  // unpaid by the rollup loop below.
  const paidPickSetIds = new Set<string>();
  for (const r of paymentsRows) {
    if (r.is_paid) paidPickSetIds.add(r.pick_set_id);
  }

  // Two parallel buckets per phase: a Set<match_id> for the
  // "did the player pick?" checks, and a Map<match_id, pick> for the
  // "what did they pick?" rendering. Built in one pass so we touch each
  // row exactly once.
  const groupPickedByPickSet = new Map<string, Set<string>>();
  const knockoutPickedByPickSet = new Map<string, Set<string>>();
  const groupPicksByPickSet = new Map<
    string,
    Map<string, "home" | "draw" | "away">
  >();
  const knockoutPicksByPickSet = new Map<
    string,
    Map<string, "home" | "away">
  >();
  const groupCorrectById = new Map<string, number>();
  const knockoutCorrectById = new Map<string, number>();
  let anyKnockoutGraded = false;

  for (const p of groupPicksRows) {
    const set = groupPickedByPickSet.get(p.pick_set_id) ?? new Set<string>();
    set.add(p.match_id);
    groupPickedByPickSet.set(p.pick_set_id, set);

    const picks =
      groupPicksByPickSet.get(p.pick_set_id) ??
      new Map<string, "home" | "draw" | "away">();
    picks.set(p.match_id, p.pick);
    groupPicksByPickSet.set(p.pick_set_id, picks);

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

    const picks =
      knockoutPicksByPickSet.get(p.pick_set_id) ??
      new Map<string, "home" | "away">();
    picks.set(p.match_id, p.pick);
    knockoutPicksByPickSet.set(p.pick_set_id, picks);

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
      // Default FALSE — a member with zero pick sets can't owe money.
      // The loop below flips this to TRUE the first time it sees an
      // unpaid pick set belonging to this participant.
      hasUnpaidPickSet: false,
    });
  }

  const seenPickSetForParticipant = new Set<string>();

  for (const ps of pickSetRows) {
    const rollup = rollupByParticipant.get(ps.participant_id);
    if (!rollup) continue;

    // Payment check is per-pick-set, independent of the
    // group/knockout completion checks. A pick set is unpaid when
    // it's not in the paidPickSetIds set (either no payment row at
    // all, or a row with is_paid=false). One unpaid pick set is
    // enough to flip the participant's rollup.
    if (!paidPickSetIds.has(ps.id)) {
      rollup.hasUnpaidPickSet = true;
    }

    if (!seenPickSetForParticipant.has(ps.participant_id)) {
      rollup.hasGroupIncomplete = false;
      rollup.hasKnockoutIncomplete = false;
      seenPickSetForParticipant.add(ps.participant_id);
    }

    const groupPicked =
      groupPickedByPickSet.get(ps.id) ?? new Set<string>();
    const knockoutPicked =
      knockoutPickedByPickSet.get(ps.id) ?? new Set<string>();
    const groupPicks =
      groupPicksByPickSet.get(ps.id) ??
      new Map<string, "home" | "draw" | "away">();
    const knockoutPicks =
      knockoutPicksByPickSet.get(ps.id) ?? new Map<string, "home" | "away">();

    rollup.pickSets.push({
      pick_set_id: ps.id,
      pick_set_name: ps.name,
      group_correct: groupCorrectById.get(ps.id) ?? 0,
      knockout_correct: knockoutCorrectById.get(ps.id) ?? 0,
      groupPickedMatchIds: groupPicked,
      knockoutPickedMatchIds: knockoutPicked,
      groupPicksByMatchId: groupPicks,
      knockoutPicksByMatchId: knockoutPicks,
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
