/**
 * App-wide date formatters.
 *
 * Every user-visible date and datetime in the app should go through one of
 * these two helpers, so the rendering stays consistent across the picks
 * dashboard, the admin pages, the About page, the audit log, etc.
 *
 * House style
 * -----------
 *   Date     →  "MM/DD/YYYY"               e.g. "06/11/2026"
 *   DateTime →  "MM/DD/YYYY HH:MM PT"      e.g. "06/11/2026 13:00 PT"
 *
 * Timezone
 * --------
 * All values are rendered in Pacific Time. We use the literal suffix "PT"
 * (not PST/PDT) because the actual offset switches twice a year with
 * daylight saving and we'd rather show one stable label than have the
 * suffix flip mid-tournament. The dates form and the About-page deadline
 * badges have always labelled Pacific Time this way; these helpers keep
 * that convention.
 *
 * Format choice
 * -------------
 * en-US produces month/day/year ordering natively. We still call
 * formatToParts and recompose by hand rather than letting toLocaleString()
 * decide on a separator — some locales/runtimes interleave a comma
 * between the date and time, and the recompose guarantees a literal "/"
 * date separator and a single space before the time. The order in the
 * template strings below is what locks the visible output to MM/DD/YYYY;
 * the locale choice mostly affects how the digit parts are typed, not
 * how they're concatenated.
 *
 * Null safety
 * -----------
 * Both helpers accept null/undefined and return null in that case so
 * call sites can do `{formatted && <span>{formatted}</span>}` without
 * sprinkling guards. They also return null if the ISO string fails to
 * parse, which is the same behaviour they used to have in the inline
 * versions inside pick-set-dashboard.tsx.
 */

const PT_TZ = "America/Los_Angeles";

/**
 * Format a UTC ISO timestamp as a Pacific-Time date in `MM/DD/YYYY` form.
 *
 * Use this for date-only contexts where time-of-day isn't relevant —
 * e.g. "Created 06/11/2026" on a pick-set card, or "Match dates:
 * 06/11/2026 – 06/27/2026" on the About page.
 */
export function formatPacificDate(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("month")}/${get("day")}/${get("year")}`;
}

/**
 * Format a UTC ISO timestamp as a Pacific-Time date+time in
 * `M/D/YYYY h:MM AM/PM PT` form (12-hour clock, no leading zeros on
 * month/day/hour).  e.g. "6/28/2026 7:00 PM PT", "1/5/2026 12:30 AM PT".
 *
 * Use this whenever the time-of-day actually matters — pick deadlines,
 * audit-log entries, "Currently set" hints in the admin dates form,
 * the About page's DeadlineBadge bottom row, etc.
 *
 * Format notes
 * ------------
 * We pull the parts from a 12-hour en-US formatter, then strip the
 * leading zeros from month, day, and hour ourselves. The minute stays
 * zero-padded (so "7:00", never "7:0") because it's the trailing part
 * of the time and an unpadded minute reads as broken. The dayPeriod
 * part ("AM"/"PM") is uppercased for a stable look across runtimes —
 * some emit "PM", others "pm".
 */
export function formatPacificDateTime(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TZ,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  // day/month/hour come back already unpadded from the "numeric" options;
  // Number() is a defensive strip in case a runtime pads them anyway.
  const month = Number(get("month"));
  const day = Number(get("day"));
  const year = get("year");
  const hour = Number(get("hour"));
  const minute = get("minute"); // keep zero-padded, e.g. "00", "05", "30"
  const period = get("dayPeriod").toUpperCase(); // "AM" / "PM"

  return `${month}/${day}/${year} ${hour}:${minute} ${period} PT`;
}

/**
 * Stable Pacific-Time day key for an ISO timestamp, as `YYYY-MM-DD`.
 *
 * Used to BUCKET and SORT matches into calendar days in Pacific Time —
 * the "group matches by date" view on the /matches and /what-if pages.
 * Because it's derived from the PT-localised date parts (not the raw UTC
 * date), a 9:00 PM PT kickoff correctly lands on its PT day rather than
 * rolling into the next UTC day. The `YYYY-MM-DD` shape sorts
 * lexicographically in chronological order, so callers can sort the
 * keys directly without parsing.
 *
 * Returns null for null/undefined/unparseable input so callers can group
 * the "no scheduled time yet" matches into their own bucket.
 */
export function pacificDayKey(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Human day heading for a date section, e.g. "Thursday, June 11".
 *
 * Pairs with pacificDayKey: the key buckets/sorts, this label renders
 * the section header. Year is omitted (the whole tournament is within
 * one month-span, so the weekday + month + day is unambiguous and reads
 * cleaner). Returns null for unparseable input.
 */
export function formatPacificDayHeading(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

/**
 * Time-of-day only, in Pacific Time, e.g. "12:00 PM PT", "5:30 PM PT".
 *
 * Used inside the by-date match list, where the day is already in the
 * section header so only the kickoff time needs to render per match.
 * Same 12-hour, unpadded-hour, padded-minute, literal-"PT" conventions
 * as formatPacificDateTime. Returns null for unparseable input.
 */
export function formatPacificTime(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const hour = Number(get("hour"));
  const minute = get("minute");
  const period = get("dayPeriod").toUpperCase();

  return `${hour}:${minute} ${period} PT`;
}

/**
 * Today's Pacific-Time day key (`YYYY-MM-DD`). Thin wrapper over
 * pacificDayKey(now) — pulled out so the "by date" views can compare
 * each match day against "today in PT" without re-deriving it.
 */
export function pacificTodayKey(): string {
  // pacificDayKey never returns null for a valid Date, but fall back to
  // a low sentinel just in case so callers can treat the result as a
  // plain string.
  return pacificDayKey(new Date().toISOString()) ?? "0000-00-00";
}

/**
 * Comparator for `YYYY-MM-DD` day keys that puts the MOST RELEVANT days
 * first: today, then tomorrow, then later days in ascending order, with
 * PAST days pushed to the bottom (most-recent past first). A sentinel
 * key that doesn't parse as a date (e.g. the "Date TBD" bucket's key)
 * always sorts last.
 *
 * The boundary is "today in Pacific Time" so a match that already
 * kicked off earlier today still counts as today (current-day matches
 * stay at the very top), while yesterday and earlier sink below all
 * upcoming days.
 *
 * Ordering produced (for today = 2026-06-15):
 *   2026-06-15 (today), 2026-06-16, 2026-06-17, …   ← upcoming, ascending
 *   2026-06-14, 2026-06-13, …                        ← past, descending
 *   <TBD / unparseable>                              ← always last
 */
export function compareDayKeysRelevanceFirst(
  a: string,
  b: string,
  today: string = pacificTodayKey()
): number {
  // YYYY-MM-DD keys are exactly 10 chars; anything else (e.g. "~tbd") is
  // a non-date sentinel that belongs at the very bottom.
  const aIsDate = /^\d{4}-\d{2}-\d{2}$/.test(a);
  const bIsDate = /^\d{4}-\d{2}-\d{2}$/.test(b);
  if (aIsDate !== bIsDate) return aIsDate ? -1 : 1;
  if (!aIsDate && !bIsDate) return 0;

  const aFuture = a >= today; // today counts as "future" (stays on top)
  const bFuture = b >= today;
  if (aFuture !== bFuture) return aFuture ? -1 : 1;

  // Same side of the boundary: upcoming days ascending (today first),
  // past days descending (most recent first).
  if (aFuture) return a.localeCompare(b);
  return b.localeCompare(a);
}
