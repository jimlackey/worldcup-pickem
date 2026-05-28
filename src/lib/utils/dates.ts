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
