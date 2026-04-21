// Flag URL builder — serves from local public/flags/ directory
// Downloaded via: npx tsx scripts/download-flags.ts
// FlagCDN format: {width}x{height}/{code}.png

type FlagSize = "16x12" | "24x18" | "32x24" | "48x36" | "64x48";

/**
 * Build a local flag URL for the given country code.
 * Uses 32x24 directory for small sizes, 64x48 for large sizes.
 */
export function getFlagUrl(flagCode: string, size: FlagSize = "32x24"): string {
  const code = flagCode.toLowerCase();
  const [w] = size.split("x").map(Number);
  // We download two sizes: 32x24 (small) and 64x48 (large)
  const dir = w <= 32 ? "32x24" : "64x48";
  return `/flags/${dir}/${code}.png`;
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
