/**
 * Format an American money line as the string a bettor expects to see.
 *
 *   -190  → "-190"
 *   +330  → "+330"
 *    null → null (caller decides what to render in the empty state)
 *
 * Plus signs are required for non-negative values — that's the convention
 * for American odds and helps readers tell the favourite from the underdog
 * at a glance.
 *
 * 0 is treated as "no value" because it's not a meaningful odds value
 * (even-money is rendered as +100, not 0). The DB-level CHECK constraint
 * in migration 014 already rules out values in -99..+99, so this branch
 * is defence-in-depth — anything that snuck through still renders cleanly.
 */
export function formatMoneyLine(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value === 0) return null;
  if (value > 0) return `+${value}`;
  return `${value}`; // negative sign is already in the number
}
