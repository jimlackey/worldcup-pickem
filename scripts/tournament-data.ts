// AUTO-GENERATED DATA. 2026 FIFA World Cup teams, groups, and fixtures.
// Source: Yahoo Sports fixture list (April 2026), cross-checked against NBC Sports.
//
// Verified invariants:
//  - 48 teams, all unique by name, short_code, and flag_code
//  - 12 groups (A-L), 4 teams each
//  - 72 group matches in chronological order (match_number 1-72)
//  - Every team plays exactly 3 group matches
//  - Every group has all 6 round-robin pairings

export const TEAMS_BY_GROUP: Record<string, { name: string; short_code: string; flag_code: string }[]> = {
  A: [
    { name: 'Mexico', short_code: 'MEX', flag_code: 'mx' },
    { name: 'South Africa', short_code: 'RSA', flag_code: 'za' },
    { name: 'Korea Republic', short_code: 'KOR', flag_code: 'kr' },
    { name: 'Czechia', short_code: 'CZE', flag_code: 'cz' },
  ],
  B: [
    { name: 'Canada', short_code: 'CAN', flag_code: 'ca' },
    { name: 'Bosnia and Herzegovina', short_code: 'BIH', flag_code: 'ba' },
    { name: 'Qatar', short_code: 'QAT', flag_code: 'qa' },
    { name: 'Switzerland', short_code: 'SUI', flag_code: 'ch' },
  ],
  C: [
    { name: 'Brazil', short_code: 'BRA', flag_code: 'br' },
    { name: 'Morocco', short_code: 'MAR', flag_code: 'ma' },
    { name: 'Haiti', short_code: 'HAI', flag_code: 'ht' },
    { name: 'Scotland', short_code: 'SCO', flag_code: 'gb-sct' },
  ],
  D: [
    { name: 'United States', short_code: 'USA', flag_code: 'us' },
    { name: 'Paraguay', short_code: 'PAR', flag_code: 'py' },
    { name: 'Australia', short_code: 'AUS', flag_code: 'au' },
    { name: 'Türkiye', short_code: 'TUR', flag_code: 'tr' },
  ],
  E: [
    { name: 'Germany', short_code: 'GER', flag_code: 'de' },
    { name: 'Curaçao', short_code: 'CUW', flag_code: 'cw' },
    { name: 'Ivory Coast', short_code: 'CIV', flag_code: 'ci' },
    { name: 'Ecuador', short_code: 'ECU', flag_code: 'ec' },
  ],
  F: [
    { name: 'Netherlands', short_code: 'NED', flag_code: 'nl' },
    { name: 'Japan', short_code: 'JPN', flag_code: 'jp' },
    { name: 'Sweden', short_code: 'SWE', flag_code: 'se' },
    { name: 'Tunisia', short_code: 'TUN', flag_code: 'tn' },
  ],
  G: [
    { name: 'Belgium', short_code: 'BEL', flag_code: 'be' },
    { name: 'Egypt', short_code: 'EGY', flag_code: 'eg' },
    { name: 'Iran', short_code: 'IRN', flag_code: 'ir' },
    { name: 'New Zealand', short_code: 'NZL', flag_code: 'nz' },
  ],
  H: [
    { name: 'Spain', short_code: 'ESP', flag_code: 'es' },
    { name: 'Cape Verde', short_code: 'CPV', flag_code: 'cv' },
    { name: 'Saudi Arabia', short_code: 'KSA', flag_code: 'sa' },
    { name: 'Uruguay', short_code: 'URU', flag_code: 'uy' },
  ],
  I: [
    { name: 'France', short_code: 'FRA', flag_code: 'fr' },
    { name: 'Senegal', short_code: 'SEN', flag_code: 'sn' },
    { name: 'Iraq', short_code: 'IRQ', flag_code: 'iq' },
    { name: 'Norway', short_code: 'NOR', flag_code: 'no' },
  ],
  J: [
    { name: 'Argentina', short_code: 'ARG', flag_code: 'ar' },
    { name: 'Algeria', short_code: 'ALG', flag_code: 'dz' },
    { name: 'Austria', short_code: 'AUT', flag_code: 'at' },
    { name: 'Jordan', short_code: 'JOR', flag_code: 'jo' },
  ],
  K: [
    { name: 'Portugal', short_code: 'POR', flag_code: 'pt' },
    { name: 'DR Congo', short_code: 'COD', flag_code: 'cd' },
    { name: 'Uzbekistan', short_code: 'UZB', flag_code: 'uz' },
    { name: 'Colombia', short_code: 'COL', flag_code: 'co' },
  ],
  L: [
    { name: 'England', short_code: 'ENG', flag_code: 'gb-eng' },
    { name: 'Croatia', short_code: 'CRO', flag_code: 'hr' },
    { name: 'Ghana', short_code: 'GHA', flag_code: 'gh' },
    { name: 'Panama', short_code: 'PAN', flag_code: 'pa' },
  ],
};

/**
 * All 72 group-phase matches in chronological order.
 * match_number will be assigned 1-72 based on this array order at insertion time.
 * scheduled_at times are ISO 8601 UTC (converted from ET in the source).
 */
export const GROUP_FIXTURES: {
  group: string;
  home: string;
  away: string;
  scheduled_at: string;
}[] = [
  { group: "A", home: "Mexico", away: "South Africa", scheduled_at: "2026-06-11T19:00:00Z" },
  { group: "A", home: "Korea Republic", away: "Czechia", scheduled_at: "2026-06-12T02:00:00Z" },
  { group: "B", home: "Canada", away: "Bosnia and Herzegovina", scheduled_at: "2026-06-12T19:00:00Z" },
  { group: "D", home: "United States", away: "Paraguay", scheduled_at: "2026-06-13T01:00:00Z" },
  { group: "D", home: "Australia", away: "T\u00fcrkiye", scheduled_at: "2026-06-13T04:00:00Z" },
  { group: "B", home: "Qatar", away: "Switzerland", scheduled_at: "2026-06-13T19:00:00Z" },
  { group: "C", home: "Brazil", away: "Morocco", scheduled_at: "2026-06-13T22:00:00Z" },
  { group: "C", home: "Haiti", away: "Scotland", scheduled_at: "2026-06-14T01:00:00Z" },
  { group: "E", home: "Germany", away: "Cura\u00e7ao", scheduled_at: "2026-06-14T17:00:00Z" },
  { group: "F", home: "Netherlands", away: "Japan", scheduled_at: "2026-06-14T20:00:00Z" },
  { group: "E", home: "Ivory Coast", away: "Ecuador", scheduled_at: "2026-06-14T23:00:00Z" },
  { group: "F", home: "Sweden", away: "Tunisia", scheduled_at: "2026-06-15T02:00:00Z" },
  { group: "H", home: "Spain", away: "Cape Verde", scheduled_at: "2026-06-15T16:00:00Z" },
  { group: "G", home: "Belgium", away: "Egypt", scheduled_at: "2026-06-15T19:00:00Z" },
  { group: "H", home: "Saudi Arabia", away: "Uruguay", scheduled_at: "2026-06-15T22:00:00Z" },
  { group: "G", home: "Iran", away: "New Zealand", scheduled_at: "2026-06-16T01:00:00Z" },
  { group: "I", home: "France", away: "Senegal", scheduled_at: "2026-06-16T19:00:00Z" },
  { group: "I", home: "Iraq", away: "Norway", scheduled_at: "2026-06-16T22:00:00Z" },
  { group: "J", home: "Argentina", away: "Algeria", scheduled_at: "2026-06-17T01:00:00Z" },
  { group: "J", home: "Austria", away: "Jordan", scheduled_at: "2026-06-17T04:00:00Z" },
  { group: "K", home: "Portugal", away: "DR Congo", scheduled_at: "2026-06-17T17:00:00Z" },
  { group: "L", home: "England", away: "Croatia", scheduled_at: "2026-06-17T20:00:00Z" },
  { group: "L", home: "Ghana", away: "Panama", scheduled_at: "2026-06-17T23:00:00Z" },
  { group: "K", home: "Uzbekistan", away: "Colombia", scheduled_at: "2026-06-18T02:00:00Z" },
  { group: "A", home: "Czechia", away: "South Africa", scheduled_at: "2026-06-18T16:00:00Z" },
  { group: "B", home: "Switzerland", away: "Bosnia and Herzegovina", scheduled_at: "2026-06-18T19:00:00Z" },
  { group: "B", home: "Canada", away: "Qatar", scheduled_at: "2026-06-18T22:00:00Z" },
  { group: "A", home: "Mexico", away: "Korea Republic", scheduled_at: "2026-06-19T01:00:00Z" },
  { group: "D", home: "T\u00fcrkiye", away: "Paraguay", scheduled_at: "2026-06-19T04:00:00Z" },
  { group: "D", home: "United States", away: "Australia", scheduled_at: "2026-06-19T19:00:00Z" },
  { group: "C", home: "Scotland", away: "Morocco", scheduled_at: "2026-06-19T22:00:00Z" },
  { group: "C", home: "Brazil", away: "Haiti", scheduled_at: "2026-06-20T01:00:00Z" },
  { group: "F", home: "Tunisia", away: "Japan", scheduled_at: "2026-06-20T04:00:00Z" },
  { group: "F", home: "Netherlands", away: "Sweden", scheduled_at: "2026-06-20T17:00:00Z" },
  { group: "E", home: "Germany", away: "Ivory Coast", scheduled_at: "2026-06-20T20:00:00Z" },
  { group: "E", home: "Ecuador", away: "Cura\u00e7ao", scheduled_at: "2026-06-21T00:00:00Z" },
  { group: "H", home: "Spain", away: "Saudi Arabia", scheduled_at: "2026-06-21T16:00:00Z" },
  { group: "G", home: "Belgium", away: "Iran", scheduled_at: "2026-06-21T19:00:00Z" },
  { group: "H", home: "Uruguay", away: "Cape Verde", scheduled_at: "2026-06-21T22:00:00Z" },
  { group: "G", home: "New Zealand", away: "Egypt", scheduled_at: "2026-06-22T01:00:00Z" },
  { group: "J", home: "Argentina", away: "Austria", scheduled_at: "2026-06-22T17:00:00Z" },
  { group: "I", home: "France", away: "Iraq", scheduled_at: "2026-06-22T21:00:00Z" },
  { group: "I", home: "Norway", away: "Senegal", scheduled_at: "2026-06-23T00:00:00Z" },
  { group: "J", home: "Jordan", away: "Algeria", scheduled_at: "2026-06-23T03:00:00Z" },
  { group: "K", home: "Portugal", away: "Uzbekistan", scheduled_at: "2026-06-23T17:00:00Z" },
  { group: "L", home: "England", away: "Ghana", scheduled_at: "2026-06-23T20:00:00Z" },
  { group: "L", home: "Panama", away: "Croatia", scheduled_at: "2026-06-23T23:00:00Z" },
  { group: "K", home: "Colombia", away: "DR Congo", scheduled_at: "2026-06-24T02:00:00Z" },
  { group: "B", home: "Switzerland", away: "Canada", scheduled_at: "2026-06-24T19:00:00Z" },
  { group: "B", home: "Bosnia and Herzegovina", away: "Qatar", scheduled_at: "2026-06-24T19:00:00Z" },
  { group: "C", home: "Scotland", away: "Brazil", scheduled_at: "2026-06-24T22:00:00Z" },
  { group: "C", home: "Morocco", away: "Haiti", scheduled_at: "2026-06-24T22:00:00Z" },
  { group: "A", home: "Czechia", away: "Mexico", scheduled_at: "2026-06-25T01:00:00Z" },
  { group: "A", home: "South Africa", away: "Korea Republic", scheduled_at: "2026-06-25T01:00:00Z" },
  { group: "E", home: "Cura\u00e7ao", away: "Ivory Coast", scheduled_at: "2026-06-25T20:00:00Z" },
  { group: "E", home: "Ecuador", away: "Germany", scheduled_at: "2026-06-25T20:00:00Z" },
  { group: "F", home: "Japan", away: "Sweden", scheduled_at: "2026-06-25T23:00:00Z" },
  { group: "F", home: "Tunisia", away: "Netherlands", scheduled_at: "2026-06-25T23:00:00Z" },
  { group: "D", home: "T\u00fcrkiye", away: "United States", scheduled_at: "2026-06-26T02:00:00Z" },
  { group: "D", home: "Paraguay", away: "Australia", scheduled_at: "2026-06-26T02:00:00Z" },
  { group: "I", home: "Norway", away: "France", scheduled_at: "2026-06-26T19:00:00Z" },
  { group: "I", home: "Senegal", away: "Iraq", scheduled_at: "2026-06-26T19:00:00Z" },
  { group: "H", home: "Cape Verde", away: "Saudi Arabia", scheduled_at: "2026-06-27T00:00:00Z" },
  { group: "H", home: "Uruguay", away: "Spain", scheduled_at: "2026-06-27T00:00:00Z" },
  { group: "G", home: "Egypt", away: "Iran", scheduled_at: "2026-06-27T03:00:00Z" },
  { group: "G", home: "New Zealand", away: "Belgium", scheduled_at: "2026-06-27T03:00:00Z" },
  { group: "L", home: "Panama", away: "England", scheduled_at: "2026-06-27T21:00:00Z" },
  { group: "L", home: "Croatia", away: "Ghana", scheduled_at: "2026-06-27T21:00:00Z" },
  { group: "K", home: "Colombia", away: "Portugal", scheduled_at: "2026-06-27T23:30:00Z" },
  { group: "K", home: "DR Congo", away: "Uzbekistan", scheduled_at: "2026-06-27T23:30:00Z" },
  { group: "J", home: "Jordan", away: "Argentina", scheduled_at: "2026-06-28T02:00:00Z" },
  { group: "J", home: "Algeria", away: "Austria", scheduled_at: "2026-06-28T02:00:00Z" },
];

/**
 * FIFA Men's World Ranking position for every team in the field.
 *
 * Source: FIFA/Coca-Cola Men's World Ranking, official update of
 * 1 April 2026 (the last update before the tournament; the next was
 * 9–11 June 2026). Lower number = stronger side (1 = best in the world).
 *
 * These ranks are used by the demo seeder (scripts/seed-demo.ts) to weight
 * mock picks realistically — a higher-ranked team draws a larger share of
 * "winner" picks than a weaker opponent, instead of the old uniform ~1/3
 * split. Keys must exactly match the canonical team.name values in
 * TEAMS_BY_GROUP above.
 *
 * Name reconciliations vs. the published FIFA table:
 *   Türkiye → "Turkey" (22), Iran → "IR Iran" (21),
 *   Ivory Coast → "Côte d'Ivoire" (34), Cape Verde → "Cabo Verde" (69),
 *   DR Congo → "Congo DR" (46), Korea Republic → "Korea Republic" (25).
 */
export const TEAM_FIFA_RANKS: Record<string, number> = {
  France: 1,
  Spain: 2,
  Argentina: 3,
  England: 4,
  Portugal: 5,
  Brazil: 6,
  Netherlands: 7,
  Morocco: 8,
  Belgium: 9,
  Germany: 10,
  Croatia: 11,
  Colombia: 13,
  Senegal: 14,
  Mexico: 15,
  "United States": 16,
  Uruguay: 17,
  Japan: 18,
  Switzerland: 19,
  Iran: 21,
  Türkiye: 22,
  Ecuador: 23,
  Austria: 24,
  "Korea Republic": 25,
  Australia: 27,
  Algeria: 28,
  Egypt: 29,
  Canada: 30,
  Norway: 31,
  Panama: 33,
  "Ivory Coast": 34,
  Sweden: 38,
  Paraguay: 40,
  Czechia: 41,
  Scotland: 43,
  Tunisia: 44,
  "DR Congo": 46,
  Uzbekistan: 50,
  Qatar: 55,
  Iraq: 57,
  "South Africa": 60,
  "Saudi Arabia": 61,
  Jordan: 63,
  "Bosnia and Herzegovina": 65,
  "Cape Verde": 69,
  Ghana: 74,
  Curaçao: 82,
  Haiti: 83,
  "New Zealand": 85,
};
