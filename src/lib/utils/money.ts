/**
 * Money formatting helpers (migration 025).
 *
 * The app stores money as integer cents — see migration 025's header
 * comment for why. These helpers convert between the stored cents and
 * the "$XX.XX" dollar string that users see and type. They're shared
 * across the admin Payment Config form (parse user input into cents,
 * format cents back into the input on initial render) and any
 * downstream display surfaces (Payments view, About page, etc.) that
 * need to read the per-pool fee values.
 *
 * SCOPE: USD only. The fields the app stores aren't localized — the
 * pool admin enters a number in dollars and the rest of the app
 * displays USD. If we ever support multi-currency pools, this is the
 * file to grow.
 */

/**
 * Regex matching a positive dollar amount as a user would type it.
 * Accepts:
 *   "0", "1", "20", "1234"
 *   "0.5", "1.50", "20.99", "1000.00"
 *   "0.", "20." (a trailing dot is fine — coerced to .00)
 *   ".50" (a leading dot is fine — coerced to 0.50)
 *
 * Rejects:
 *   "" (caller decides empty=invalid)
 *   "abc", "1,000", "20.999", "$20" — leading $ stripped by caller
 *   negatives — by spec these aren't valid fees
 *
 * The two-decimal cap matches USD's smallest currency unit (cents).
 * We don't allow tenths-of-a-cent because the admin form is recording
 * a real-world fee a player will literally pay; no sub-cent values
 * make sense.
 */
const MONEY_PATTERN = /^\.?\d+\.?\d{0,2}$|^\d+\.\d{1,2}$/;

/**
 * Format a cents value as a $XX.XX dollar string. Used for read-only
 * display and as the initial value in the admin form's text input.
 *
 * Always shows two decimals (even for whole-dollar values) so the
 * column lines up visually across rows. Negative values are clamped
 * to zero — by the DB CHECK they can't be persisted, but the helper
 * is defensive in case a caller passes garbage during a debug session.
 */
export function formatCents(cents: number): string {
  const clamped = Math.max(0, Math.round(cents));
  const whole = Math.floor(clamped / 100);
  const frac = clamped % 100;
  return `$${whole}.${frac.toString().padStart(2, "0")}`;
}

/**
 * Same as formatCents but returns just the "XX.XX" without the
 * leading dollar sign. The admin form's text input lets the user
 * type the bare number and shows the $ in a static prefix span,
 * so we keep the input value clean.
 */
export function formatCentsAsDollarsString(cents: number): string {
  const clamped = Math.max(0, Math.round(cents));
  const whole = Math.floor(clamped / 100);
  const frac = clamped % 100;
  return `${whole}.${frac.toString().padStart(2, "0")}`;
}

/**
 * Parse a user-entered dollar string into integer cents. Returns null
 * if the input doesn't match a valid money shape — callers (Zod
 * schemas, form actions) treat null as a validation error.
 *
 * The transform strips an optional leading "$" and any surrounding
 * whitespace so users who instinctively type "$20" or " 20 " don't
 * trip an unhelpful error. Commas are NOT stripped — comma-separated
 * thousands are unusual at pool fee scale and trying to parse them
 * invites ambiguity with European-decimal users (1,50 = 1.50?). We
 * keep the rule simple: digits and one optional dot, that's it.
 */
export function parseDollarStringToCents(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^\$/, "");
  if (trimmed === "") return null;
  if (!MONEY_PATTERN.test(trimmed)) return null;

  // Split on dot. Up to one dot is allowed by the regex above.
  const [whole = "0", frac = ""] = trimmed.split(".");

  // Pad/truncate the fractional half to exactly 2 digits. "5" → "50",
  // "" → "00". The regex already forbids more than 2 fractional digits.
  const fracPadded = (frac + "00").slice(0, 2);

  const cents = Number(whole) * 100 + Number(fracPadded);
  if (!Number.isFinite(cents) || cents < 0) return null;
  return cents;
}

/**
 * Boolean variant for cheap callers that just need yes/no. Equivalent
 * to `parseDollarStringToCents(raw) !== null`.
 */
export function isValidDollarString(raw: string): boolean {
  return parseDollarStringToCents(raw) !== null;
}
