// Flag URL builder using FlagCDN (https://flagcdn.com)
// Free, no API key required.

type FlagSize = "16x12" | "24x18" | "32x24" | "48x36" | "64x48";

/**
 * Build a FlagCDN URL for the given country code.
 * @param flagCode ISO 3166-1 alpha-2 code (e.g. "us", "br", "gb-eng")
 * @param size Width×Height string. Default "32x24" for inline use.
 */
export function getFlagUrl(
  flagCode: string,
  size: FlagSize = "32x24"
): string {
  const [w] = size.split("x");
  // FlagCDN uses /w{width}/ path for specific widths
  return `https://flagcdn.com/w${w}/${flagCode.toLowerCase()}.png`;
}

/**
 * Pixel dimensions for each size preset.
 */
export const FLAG_DIMENSIONS: Record<FlagSize, { width: number; height: number }> = {
  "16x12": { width: 16, height: 12 },
  "24x18": { width: 24, height: 18 },
  "32x24": { width: 32, height: 24 },
  "48x36": { width: 48, height: 36 },
  "64x48": { width: 64, height: 48 },
};
