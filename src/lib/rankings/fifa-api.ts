/**
 * FIFA Men's World Ranking — fetch client (DIAGNOSTIC BUILD ROUND 3)
 *
 * WHAT ROUND 2 TAUGHT US
 * ----------------------
 * The ranking data lives inside the __NEXT_DATA__ script tag, but NOT in
 * the shape the old API used. It's structured as a series of "card"
 * objects with this shape:
 *
 *   {
 *     "countryName": "France",
 *     "countryCode": "FRA",
 *     "cardValue":   "1",      // ← rank number as string
 *     "flagUrl":     "https://api.fifa.com/api/v3/picture/flags-sq-3/FRA",
 *     "typeRender":  "WorldRankingBoldCardProps",
 *     "worldRankingCardType": "Top ranked",
 *     "rankingType": "Men",
 *     ...
 *   }
 *
 * The page renders these as highlight cards (top ranked, biggest climber,
 * etc.) on the marketing-style ranking landing page.
 *
 * WHAT THIS ROUND DOES
 * --------------------
 *   1. Locates __NEXT_DATA__ and parses it.
 *   2. Walks the parsed JSON tree depth-first, looking for every object
 *      that has both `countryCode` and `cardValue` (or numeric rank).
 *   3. Reports how many rank-shaped objects it found, classified by
 *      shape, and a few sample rows.
 *
 * IF WE FIND 200+ ROWS → that's the full ranking list, and we have a
 * working production path.
 *
 * IF WE ONLY FIND A FEW HIGHLIGHT CARDS → fifa.com's public page doesn't
 * embed the full list, and we'll need to either (a) hit a different
 * page that does, or (b) accept the highlight cards as the only auto-
 * fetched data and rely on manual entry for the rest.
 */

import type { Team } from "@/types/database";

// ---------------------------------------------------------------------------
// Public types — same shape so the action/button don't need changes
// ---------------------------------------------------------------------------

export interface NormalizedRanking {
  rank: number;
  teamName: string;
  countryCode: string | null;
}

export interface RankingMatchOutcome {
  teamId: string | null;
  rank: number;
  teamName: string;
  countryCode: string | null;
  reason: "matched" | "no_team_match";
}

export interface PatternFinding {
  pattern: string;
  found: boolean;
  byteOffset: number | null;
  countryHits: number;
  snippet: string;
}

export interface FetchAttemptDiagnostic {
  variant: string;
  url: string;
  status: number | null;
  contentType: string | null;
  bodyLength: number;
  bodyPreview: string;
  patternFindings: PatternFinding[];
  parsedRankings: number;
  error: string | null;
}

export interface FetchFifaRankingsResult {
  rankings: NormalizedRanking[];
  diagnostics: FetchAttemptDiagnostic[];
  successfulVariant: string | null;
}

// ---------------------------------------------------------------------------
// Fetch + parse
// ---------------------------------------------------------------------------

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

export async function fetchFifaRankings(): Promise<FetchFifaRankingsResult> {
  const url = "https://www.fifa.com/fifa-world-ranking/men";
  const diag: FetchAttemptDiagnostic = {
    variant: "next-data-cardvalue-parser",
    url,
    status: null,
    contentType: null,
    bodyLength: 0,
    bodyPreview: "",
    patternFindings: [],
    parsedRankings: 0,
    error: null,
  };

  let body: string;
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      cache: "no-store",
      redirect: "follow",
    });
    diag.status = res.status;
    diag.contentType = res.headers.get("content-type");

    body = await res.text();
    diag.bodyLength = body.length;
    diag.bodyPreview = body.slice(0, 600);

    if (!res.ok) {
      diag.error = `Non-2xx response (${res.status})`;
      return { rankings: [], diagnostics: [diag], successfulVariant: null };
    }
  } catch (err) {
    diag.error = err instanceof Error ? err.message : String(err);
    return { rankings: [], diagnostics: [diag], successfulVariant: null };
  }

  // Locate __NEXT_DATA__.
  const nextDataRe =
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
  const match = nextDataRe.exec(body);
  if (!match) {
    diag.patternFindings.push({
      pattern: "__NEXT_DATA__ script",
      found: false,
      byteOffset: null,
      countryHits: 0,
      snippet: "",
    });
    diag.error =
      "__NEXT_DATA__ script tag not present in the page body. fifa.com may have changed shape again.";
    return { rankings: [], diagnostics: [diag], successfulVariant: null };
  }

  diag.patternFindings.push({
    pattern: "__NEXT_DATA__ script",
    found: true,
    byteOffset: match.index,
    countryHits: 0,
    snippet: match[1].slice(0, 200),
  });

  // Parse it.
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch (err) {
    diag.error = `Failed to parse __NEXT_DATA__ JSON: ${
      err instanceof Error ? err.message : String(err)
    }`;
    return { rankings: [], diagnostics: [diag], successfulVariant: null };
  }

  // Walk the tree to extract every rank-shaped object.
  const extraction = extractRankings(data);

  // Report extraction stats so we can see if we got the full list or
  // just highlight cards.
  diag.patternFindings.push({
    pattern: `[stats] All countryCode-bearing objects`,
    found: extraction.totalCountryObjects > 0,
    byteOffset: null,
    countryHits: extraction.totalCountryObjects,
    snippet: extraction.shapeSummary,
  });

  diag.patternFindings.push({
    pattern: `[stats] Rank-shaped objects with cardValue+countryCode`,
    found: extraction.cardValueRows.length > 0,
    byteOffset: null,
    countryHits: extraction.cardValueRows.length,
    snippet: extraction.cardValueRows
      .slice(0, 10)
      .map(
        (r) =>
          `#${r.rank} ${r.teamName ?? "?"} (${r.countryCode ?? "?"})`
      )
      .join("\n"),
  });

  diag.parsedRankings = extraction.rankings.length;

  // Success threshold: at least 30 rows. 30 is well above the highlight-
  // card count (~3-5) but well below the full list (~211).
  if (extraction.rankings.length >= 30) {
    return {
      rankings: extraction.rankings,
      diagnostics: [diag],
      successfulVariant: diag.variant,
    };
  }

  diag.error =
    extraction.rankings.length === 0
      ? "__NEXT_DATA__ parsed, but no rank-shaped objects found. See stats below."
      : `Only ${extraction.rankings.length} ranking rows found — likely highlight cards only, not the full list. See stats below.`;
  return { rankings: [], diagnostics: [diag], successfulVariant: null };
}

// ---------------------------------------------------------------------------
// Extraction — walk the __NEXT_DATA__ tree for rank-shaped objects
// ---------------------------------------------------------------------------

interface ExtractionResult {
  rankings: NormalizedRanking[];
  /** Every object with a countryCode field, regardless of shape. */
  totalCountryObjects: number;
  /** Just rows that look like rank cards. */
  cardValueRows: NormalizedRanking[];
  /** Summary of object shapes seen, for diagnostics. */
  shapeSummary: string;
}

function extractRankings(data: unknown): ExtractionResult {
  const cardValueRows: NormalizedRanking[] = [];
  const numericRankRows: NormalizedRanking[] = [];
  let totalCountryObjects = 0;
  const shapeCounts = new Map<string, number>();

  // Depth-first walk. We cap recursion depth and visited-node count to
  // keep this bounded on huge payloads (the __NEXT_DATA__ blob can be
  // 100KB+ once parsed).
  const stack: Array<{ node: unknown; depth: number }> = [
    { node: data, depth: 0 },
  ];
  let visited = 0;
  while (stack.length > 0 && visited < 200_000) {
    const { node, depth } = stack.pop()!;
    visited++;
    if (depth > 20) continue;
    if (node === null || typeof node !== "object") continue;

    if (Array.isArray(node)) {
      for (const item of node) stack.push({ node: item, depth: depth + 1 });
      continue;
    }

    const obj = node as Record<string, unknown>;

    // Count any object that carries a countryCode — used for the
    // diagnostic stats.
    if (typeof obj.countryCode === "string") {
      totalCountryObjects++;

      // Card-style row: cardValue holds the rank as a string.
      const cardValue = obj.cardValue;
      const countryName = obj.countryName;
      if (
        typeof cardValue === "string" &&
        /^\d+$/.test(cardValue) &&
        typeof countryName === "string"
      ) {
        const rank = parseInt(cardValue, 10);
        if (rank >= 1 && rank <= 250) {
          cardValueRows.push({
            rank,
            teamName: countryName,
            countryCode: obj.countryCode,
          });
          shapeCounts.set(
            "cardValue+countryName+countryCode",
            (shapeCounts.get("cardValue+countryName+countryCode") ?? 0) + 1
          );
        }
      }

      // Classic-API style row: rank is a number, name in `rankName`/
      // `rankNameEn`/`name`. Captured in case fifa.com embeds the full
      // list as a real array somewhere too.
      const rank =
        typeof obj.rank === "number"
          ? obj.rank
          : typeof obj.rankNumber === "number"
            ? obj.rankNumber
            : null;
      if (rank !== null && rank >= 1 && rank <= 250) {
        const name =
          typeof obj.name === "string"
            ? obj.name
            : typeof obj.rankName === "string"
              ? obj.rankName
              : typeof obj.rankNameEn === "string"
                ? obj.rankNameEn
                : null;
        if (name) {
          numericRankRows.push({
            rank,
            teamName: name,
            countryCode: obj.countryCode,
          });
          shapeCounts.set(
            "rank+name+countryCode",
            (shapeCounts.get("rank+name+countryCode") ?? 0) + 1
          );
        }
      }

      // Bare countryCode with no rank info — counted for diagnostics
      // but doesn't go in the ranking list.
      if (!obj.cardValue && !obj.rank && !obj.rankNumber) {
        shapeCounts.set(
          "countryCode only (no rank)",
          (shapeCounts.get("countryCode only (no rank)") ?? 0) + 1
        );
      }
    }

    // Recurse into children. Push all values onto the stack.
    for (const value of Object.values(obj)) {
      stack.push({ node: value, depth: depth + 1 });
    }
  }

  // Prefer the numeric-rank rows if we have them (more authoritative),
  // otherwise the cardValue rows. If neither has enough rows, the caller
  // surfaces the diagnostic and we know we're done with this approach.
  const dedupe = new Map<number, NormalizedRanking>();
  const source =
    numericRankRows.length >= cardValueRows.length
      ? numericRankRows
      : cardValueRows;
  for (const row of source) {
    if (!dedupe.has(row.rank)) dedupe.set(row.rank, row);
  }
  const rankings = Array.from(dedupe.values()).sort((a, b) => a.rank - b.rank);

  const shapeSummary = Array.from(shapeCounts.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return {
    rankings,
    totalCountryObjects,
    cardValueRows,
    shapeSummary,
  };
}

// ---------------------------------------------------------------------------
// Team-name matching — unchanged
// ---------------------------------------------------------------------------

function normalizeTeamName(name: string): string {
  let s = name.toLowerCase().trim();
  s = s.replace(/^(?:ir|pr)\s+/, "");

  const variants: Array<[RegExp, string]> = [
    [/^korea republic$/, "south korea"],
    [/^republic of korea$/, "south korea"],
    [/^korea dpr$/, "north korea"],
    [/^dr congo$/, "democratic republic of congo"],
    [/^congo dr$/, "democratic republic of congo"],
    [/^cape verde$/, "cabo verde"],
    [/^cape verde islands$/, "cabo verde"],
    [/^côte d'?ivoire$/, "ivory coast"],
    [/^cote d'?ivoire$/, "ivory coast"],
    [/^united states$/, "usa"],
    [/^united states of america$/, "usa"],
    [/^trinidad & tobago$/, "trinidad and tobago"],
    [/^china$/, "china"],
    [/^china pr$/, "china"],
    [/^chinese taipei$/, "taiwan"],
    [/^türkiye$/, "turkey"],
    [/^turkiye$/, "turkey"],
    [/^czechia$/, "czech republic"],
    [/^curaçao$/, "curacao"],
  ];
  for (const [pattern, canonical] of variants) {
    if (pattern.test(s)) {
      s = canonical;
      break;
    }
  }
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}

const FIFA_CODE_TO_FLAG_CODE: Record<string, string> = {
  ENG: "gb-eng", SCO: "gb-sct", WAL: "gb-wls", NIR: "gb-nir",
  USA: "us", GBR: "gb", GER: "de", NED: "nl", POR: "pt", ESP: "es",
  FRA: "fr", ITA: "it", SUI: "ch", DEN: "dk", CRO: "hr", SVK: "sk",
  SVN: "si", CZE: "cz", POL: "pl", RUS: "ru", UKR: "ua", ROU: "ro",
  TUR: "tr", GRE: "gr", HUN: "hu", IRL: "ie", ISL: "is", ALG: "dz",
  RSA: "za", MAR: "ma", EGY: "eg", TUN: "tn", NGA: "ng", CMR: "cm",
  SEN: "sn", CIV: "ci", KOR: "kr", PRK: "kp", JPN: "jp", AUS: "au",
  NZL: "nz", IRI: "ir", IRQ: "iq", KSA: "sa", UAE: "ae", QAT: "qa",
  CHN: "cn", ARG: "ar", BRA: "br", CHI: "cl", COL: "co", ECU: "ec",
  URU: "uy", PAR: "py", PER: "pe", VEN: "ve", MEX: "mx", CRC: "cr",
  HON: "hn", GUA: "gt", SLV: "sv", PAN: "pa", CAN: "ca", HAI: "ht",
  JAM: "jm", TRI: "tt", CPV: "cv", COD: "cd", CGO: "cg",
};

function buildTeamIndexes(teams: Team[]) {
  const byName = new Map<string, Team>();
  const byFlagCode = new Map<string, Team>();
  for (const t of teams) {
    byName.set(normalizeTeamName(t.name), t);
    if (t.flag_code) byFlagCode.set(t.flag_code.toLowerCase(), t);
  }
  return { byName, byFlagCode };
}

export function matchRankingsToTeams(
  rankings: NormalizedRanking[],
  teams: Team[]
): RankingMatchOutcome[] {
  const { byName, byFlagCode } = buildTeamIndexes(teams);
  const out: RankingMatchOutcome[] = [];
  for (const r of rankings) {
    let matched: Team | undefined = byName.get(normalizeTeamName(r.teamName));
    if (!matched && r.countryCode) {
      const flagCode = FIFA_CODE_TO_FLAG_CODE[r.countryCode.toUpperCase()];
      if (flagCode) matched = byFlagCode.get(flagCode);
    }
    out.push({
      teamId: matched?.id ?? null,
      rank: r.rank,
      teamName: r.teamName,
      countryCode: r.countryCode,
      reason: matched ? "matched" : "no_team_match",
    });
  }
  return out;
}
