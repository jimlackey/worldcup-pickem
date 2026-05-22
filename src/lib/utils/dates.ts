/**
 * App-wide date formatters.
 *
 * Every user-visible date and datetime in the app should go through one of
 * these two helpers, so the rendering stays consistent across the picks
 * dashboard, the admin pages, the About page, the audit log, etc.
 *
 * House style
 * -----------
 *   Date     →  "DD/MM/YYYY"               e.g. "11/06/2026"
 *   DateTime →  "DD/MM/YYYY HH:MM PT"      e.g. "11/06/2026 13:00 PT"
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
 * en-GB produces day/month/year ordering. We use formatToParts and
 * recompose by hand rather than letting toLocaleString() decide on a
 * separator (some locales/runtimes interleave a comma; the recompose
 * guarantees we get a literal "/" date separator and a single space
 * before the time, matching the dashboard's existing custom formatter
 * that this module replaces).
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
 * Format a UTC ISO timestamp as a Pacific-Time date in `DD/MM/YYYY` form.
 *
 * Use this for date-only contexts where time-of-day isn't relevant —
 * e.g. "Created 11/06/2026" on a pick-set card, or "Match dates:
 * 11/06/2026 – 27/06/2026" on the About page.
 */
export function formatPacificDate(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PT_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("day")}/${get("month")}/${get("year")}`;
}

/**
 * Format a UTC ISO timestamp as a Pacific-Time date+time in
 * `DD/MM/YYYY HH:MM PT` form (24-hour clock).
 *
 * Use this whenever the time-of-day actually matters — pick deadlines,
 * audit-log entries, "Currently set" hints in the admin dates form,
 * the About page's DeadlineBadge bottom row, etc.
 */
export function formatPacificDateTime(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PT_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")} PT`;
}
