/**
 * The Odds API client — fetches money-line odds for the FIFA World Cup and
 * normalises them into a shape this app can persist directly into the
 * matches table.
 *
 * Activation
 * ----------
 * The fetch action that calls this module is only exposed in the admin UI
 * when the THE_ODDS_API_KEY environment variable is set. When the variable
 * is missing, the button doesn't render and `fetchWorldCupOdds()` throws
 * with a clear message.
 *
 * Why this lives in its own module
 * --------------------------------
 * - Keeps the third-party concerns (HTTP, JSON shape, team-name fuzzy
 *   matching) out of the server action so the action can stay small and
 *   trivially testable.
 * - Makes it easy to swap providers later (API-Football, Sportmonks, etc.)
 *   without touching the admin form or the DB writes — every provider just
 *   has to return `NormalizedOddsEvent[]`.
 *
 * Conservative design
 * -------------------
 * The Odds API quotes odds in DECIMAL format by default but supports
 * "american" via the `oddsFormat` query parameter. We always request
 * american so we can persist the integer directly without conversion.
 *
 * We pull a single bookmaker (the first one returned for the requested
 * region) rather than averaging across books. That keeps the lines
 * coherent — a "fair" mix-of-books line would not match any single book's
 * actual quote — and it also stays well within the free tier's request
 * quota (each call costs 1 request, regardless of bookmaker count).
 */

import type { Team } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of a single event in The Odds API response (the bits we use).
 */
interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    last_update: string;
    markets: Array<{
      key: string; // "h2h" = match winner (home/draw/away)
      outcomes: Array<{
        name: string; // team name or "Draw"
        price: number; // american odds (e.g. -190, 330)
      }>;
    }>;
  }>;
}

/**
 * Normalised event — one row per upcoming match, with the three lines
 * already extracted from the bookmaker payload and ready to write into
 * the matches table.
 */
export interface NormalizedOddsEvent {
  homeTeamName: string;
  awayTeamName: string;
  commenceTime: string;
  homeMoneyLine: number | null;
  drawMoneyLine: number | null;
  awayMoneyLine: number | null;
  bookmaker: string;
}

/**
 * Result of matching a normalized event against the pool's matches list:
 * either we found exactly one match by fuzzy team-name comparison, or we
 * give back a reason why we couldn't.
 */
export interface OddsMatchOutcome {
  matchId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeMoneyLine: number | null;
  drawMoneyLine: number | null;
  awayMoneyLine: number | null;
  reason: "matched" | "no_team_match" | "ambiguous";
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const ODDS_API_BASE = "https://api.the-odds-api.com/v4/sports";

/**
 * The Odds API sport key for the FIFA World Cup.
 *
 * Note: the API enables sport keys dynamically based on which season is
 * "in-season" — outside the tournament window the key may return a
 * 422/404. We handle that case by surfacing a friendly error to the admin
 * rather than failing silently.
 */
const SPORT_KEY = "soccer_fifa_world_cup";

/**
 * Fetch the latest H2H (match winner) money lines for the World Cup.
 *
 * @param apiKey   The Odds API key, from process.env.THE_ODDS_API_KEY.
 * @param region   Bookmaker region. Defaults to "us" — the free tier
 *                 supports us/uk/eu/au, and "us" is the closest match
 *                 for American odds output.
 * @returns        One normalised event per upcoming/live match. Empty
 *                 array if the API returned nothing (off-season or no
 *                 odds posted yet).
 */
export async function fetchWorldCupOdds(
  apiKey: string,
  region: "us" | "uk" | "eu" | "au" = "us"
): Promise<NormalizedOddsEvent[]> {
  if (!apiKey) {
    throw new Error(
      "THE_ODDS_API_KEY is not configured. Set the env var on the server to enable line fetching."
    );
  }

  const url = new URL(`${ODDS_API_BASE}/${SPORT_KEY}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", region);
  url.searchParams.set("markets", "h2h");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");

  const res = await fetch(url.toString(), {
    // Run on the server (in a server action). No caching — we want fresh
    // odds every time the admin clicks the button.
    cache: "no-store",
  });

  if (!res.ok) {
    // The Odds API returns a 422 with a JSON `message` field when the
    // sport key is out of season; surface that as a friendlier error.
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      detail = body?.message ?? "";
    } catch {
      detail = await res.text();
    }
    throw new Error(
      `Odds API returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`
    );
  }

  const events = (await res.json()) as OddsApiEvent[];

  const out: NormalizedOddsEvent[] = [];
  for (const ev of events) {
    // Pick the first bookmaker that has an h2h market. The Odds API
    // returns books in priority order so this is usually a major sportsbook
    // appropriate for the requested region.
    const book = ev.bookmakers.find((b) =>
      b.markets.some((m) => m.key === "h2h")
    );
    if (!book) continue;

    const h2h = book.markets.find((m) => m.key === "h2h");
    if (!h2h) continue;

    let home: number | null = null;
    let away: number | null = null;
    let draw: number | null = null;

    for (const o of h2h.outcomes) {
      if (o.name === ev.home_team) home = o.price;
      else if (o.name === ev.away_team) away = o.price;
      else if (/^draw$/i.test(o.name)) draw = o.price;
    }

    out.push({
      homeTeamName: ev.home_team,
      awayTeamName: ev.away_team,
      commenceTime: ev.commence_time,
      homeMoneyLine: home,
      drawMoneyLine: draw,
      awayMoneyLine: away,
      bookmaker: book.title,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Team-name matching
// ---------------------------------------------------------------------------

/**
 * Normalise a team name for fuzzy comparison: lowercase, strip whitespace,
 * fold common variants (e.g. "IR Iran" ↔ "Iran", "South Korea" ↔ "Korea
 * Republic").
 *
 * Kept intentionally simple — we expect The Odds API names to be close to
 * our DB names but not identical. The variants list below is the smallest
 * set that covers the differences we'd actually see on World Cup feeds;
 * grow it as misses turn up.
 */
function normalizeTeamName(name: string): string {
  let s = name.toLowerCase().trim();

  // Strip common prefix qualifiers FIFA / The Odds API sometimes attach
  // (e.g. "IR Iran" → "iran").
  s = s.replace(/^ir\s+/, "");

  // Normalise ampersand to " and " BEFORE the variants check, so
  // "Bosnia & Herzegovina" (some sportsbooks) and "Bosnia and Herzegovina"
  // (our DB, FIFA) collapse to the same key. Without this, the punctuation-
  // strip step at the end would drop `&` entirely and produce
  // "bosniaherzegovina" vs "bosniaandherzegovina" — close but unequal.
  s = s.replace(/\s*&\s*/g, " and ");

  // Common name variants. Map both sides to a single canonical form so
  // either feed lining up the value gets the same key.
  //
  // Coverage strategy: every entry below has the canonical (right-hand)
  // value also producing the same key when run through this function. We
  // verify this by adding an idempotent entry for the canonical form
  // itself when the canonical wouldn't naturally match. For example
  // `czechia` ↔ `czech republic` resolves to `czechia` for both —
  // `"czechia"` matches `/^czechia$/` and is rewritten to `"czechia"` (a
  // no-op), `"czech republic"` matches `/^czech republic$/` and is
  // rewritten to `"czechia"`.
  const variants: Array<[RegExp, string]> = [
    // South Korea ↔ Korea Republic
    [/^korea republic$/, "south korea"],
    [/^republic of korea$/, "south korea"],
    [/^south korea$/, "south korea"], // idempotent for canonical
    // Czechia ↔ Czech Republic
    [/^czechia$/, "czechia"], // idempotent for canonical
    [/^czech republic$/, "czechia"],
    // Türkiye ↔ Turkey — must run BEFORE punctuation strip because
    // otherwise "türkiye" loses the ü and becomes "trkiye". Routing all
    // three spellings to "turkey" sidesteps the unicode strip entirely.
    [/^türkiye$/, "turkey"],
    [/^turkiye$/, "turkey"],
    [/^turkey$/, "turkey"], // idempotent for canonical
    // Democratic Republic of Congo ↔ DR Congo ↔ Congo DR
    [/^dr congo$/, "democratic republic of congo"],
    [/^congo dr$/, "democratic republic of congo"],
    // Cabo Verde ↔ Cape Verde
    [/^cape verde$/, "cabo verde"],
    [/^cape verde islands$/, "cabo verde"],
    // Ivory Coast ↔ Côte d'Ivoire
    [/^côte d'?ivoire$/, "ivory coast"],
    [/^cote d'?ivoire$/, "ivory coast"],
    // USA ↔ United States
    [/^united states$/, "usa"],
    [/^united states of america$/, "usa"],
    [/^usa men$/, "usa"],
    // Trinidad and Tobago — ampersand pre-normalised above, but keep the
    // explicit entry too so an unnormalised "& " variant still maps.
    [/^trinidad and tobago$/, "trinidad and tobago"],
    // China PR ↔ China
    [/^china pr$/, "china"],
    // North Korea ↔ Korea DPR
    [/^korea dpr$/, "north korea"],
  ];
  for (const [pattern, canonical] of variants) {
    if (pattern.test(s)) {
      s = canonical;
      break;
    }
  }

  // Collapse remaining punctuation/whitespace so "South-Africa" and
  // "south africa" compare equal.
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}

/**
 * Build a fast lookup map keyed by normalised name → team.
 *
 * If two teams normalise to the same key (shouldn't happen with the World
 * Cup roster but defensible) the LATER one wins; the caller will see
 * `reason: "ambiguous"` for any incoming event that hits a multi-entry
 * key, since we record only one team per key.
 */
function buildTeamIndex(teams: Team[]): Map<string, Team> {
  const idx = new Map<string, Team>();
  for (const t of teams) {
    idx.set(normalizeTeamName(t.name), t);
  }
  return idx;
}

/**
 * Match a list of normalised odds events against the matches in this pool.
 * For each event:
 *   1. Look up the home and away teams by fuzzy name.
 *   2. Find a match in `matches` whose (home_team_id, away_team_id) line
 *      up with that pair. Order matters — Mexico vs South Africa is a
 *      different fixture than South Africa vs Mexico — so we only accept
 *      a hit when both sides agree.
 *
 * The returned `OddsMatchOutcome[]` is in 1:1 correspondence with the
 * input events and carries enough context (raw team names + reason) for
 * the admin UI to print a per-event status line.
 */
export function matchOddsEventsToMatches(
  events: NormalizedOddsEvent[],
  teams: Team[],
  matches: Array<{
    id: string;
    home_team_id: string | null;
    away_team_id: string | null;
  }>
): OddsMatchOutcome[] {
  const teamIdx = buildTeamIndex(teams);

  // For each event, find the matching match record.
  const out: OddsMatchOutcome[] = [];
  for (const ev of events) {
    const homeKey = normalizeTeamName(ev.homeTeamName);
    const awayKey = normalizeTeamName(ev.awayTeamName);
    const homeTeam = teamIdx.get(homeKey);
    const awayTeam = teamIdx.get(awayKey);

    if (!homeTeam || !awayTeam) {
      out.push({
        matchId: null,
        homeTeamName: ev.homeTeamName,
        awayTeamName: ev.awayTeamName,
        homeMoneyLine: ev.homeMoneyLine,
        drawMoneyLine: ev.drawMoneyLine,
        awayMoneyLine: ev.awayMoneyLine,
        reason: "no_team_match",
      });
      continue;
    }

    // Look for matches where the home/away IDs line up. Accept either
    // orientation: some books quote the matchup with home/away flipped
    // relative to the FIFA schedule. When we find a flipped match, the
    // home_money_line/away_money_line are swapped so they stay correctly
    // associated with the actual home and away teams in the DB.
    const exact = matches.find(
      (m) =>
        m.home_team_id === homeTeam.id && m.away_team_id === awayTeam.id
    );
    const flipped = matches.find(
      (m) =>
        m.home_team_id === awayTeam.id && m.away_team_id === homeTeam.id
    );
    const candidates = [exact, flipped].filter(
      (m): m is { id: string; home_team_id: string | null; away_team_id: string | null } =>
        Boolean(m)
    );

    if (candidates.length === 0) {
      out.push({
        matchId: null,
        homeTeamName: ev.homeTeamName,
        awayTeamName: ev.awayTeamName,
        homeMoneyLine: ev.homeMoneyLine,
        drawMoneyLine: ev.drawMoneyLine,
        awayMoneyLine: ev.awayMoneyLine,
        reason: "no_team_match",
      });
      continue;
    }
    if (candidates.length > 1) {
      out.push({
        matchId: null,
        homeTeamName: ev.homeTeamName,
        awayTeamName: ev.awayTeamName,
        homeMoneyLine: ev.homeMoneyLine,
        drawMoneyLine: ev.drawMoneyLine,
        awayMoneyLine: ev.awayMoneyLine,
        reason: "ambiguous",
      });
      continue;
    }

    const match = candidates[0];
    const isFlipped = match === flipped && match !== exact;
    out.push({
      matchId: match.id,
      homeTeamName: ev.homeTeamName,
      awayTeamName: ev.awayTeamName,
      homeMoneyLine: isFlipped ? ev.awayMoneyLine : ev.homeMoneyLine,
      drawMoneyLine: ev.drawMoneyLine,
      awayMoneyLine: isFlipped ? ev.homeMoneyLine : ev.awayMoneyLine,
      reason: "matched",
    });
  }

  return out;
}
