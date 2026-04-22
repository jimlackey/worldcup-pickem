/**
 * scripts/download-flags.ts
 *
 * Download flag PNGs from FlagCDN for local hosting at public/flags/.
 *
 * Run with:  npx tsx scripts/download-flags.ts
 *
 * Idempotent: files already present in public/flags/{size}/{code}.png are
 * skipped, so you can safely re-run this whenever the team list changes.
 * To force a re-download of a specific flag, delete the file(s) first.
 *
 * FlagCDN URL format: https://flagcdn.com/{width}x{height}/{code}.png
 * Supports ISO 3166-1 alpha-2 codes and UK subdivisions (gb-eng, gb-sct,
 * gb-wls, gb-nir).
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";

// ----------------------------------------------------------------------------
// Flag codes for the 2026 FIFA World Cup (48 teams, A–L).
// Updated from the earlier mock roster to the official FIFA draw result.
// Kept alphabetical within each group for easy cross-reference.
// ----------------------------------------------------------------------------
const FLAG_CODES = [
  // Group A
  "mx", "za", "kr", "cz",
  // Group B
  "ca", "ba", "qa", "ch",
  // Group C
  "br", "ma", "ht", "gb-sct",
  // Group D
  "us", "py", "au", "tr",
  // Group E
  "de", "cw", "ci", "ec",
  // Group F
  "nl", "jp", "se", "tn",
  // Group G
  "be", "eg", "ir", "nz",
  // Group H
  "es", "cv", "sa", "uy",
  // Group I
  "fr", "sn", "iq", "no",
  // Group J
  "ar", "dz", "at", "jo",
  // Group K
  "pt", "cd", "uz", "co",
  // Group L
  "gb-eng", "hr", "gh", "pa",
];

// Two physical sizes cover all TeamFlag preset sizes. src/lib/utils/flags.ts
// routes anything <= 32px wide to 32x24, and anything larger to 64x48.
const SIZES = [
  { label: "32x24", dir: "32x24" },
  { label: "64x48", dir: "64x48" },
];

// ----------------------------------------------------------------------------
// Download helpers
// ----------------------------------------------------------------------------

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }
      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch { /* ignore */ }
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });
    request.on("error", (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
      reject(err);
    });
  });
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  console.log("🏳️  Downloading 2026 World Cup flag images from FlagCDN...\n");

  const baseDir = path.resolve(process.cwd(), "public", "flags");
  let downloadedCount = 0;
  let skippedCount = 0;
  let failCount = 0;
  const failures: string[] = [];

  for (const size of SIZES) {
    const sizeDir = path.join(baseDir, size.dir);
    fs.mkdirSync(sizeDir, { recursive: true });

    for (const code of FLAG_CODES) {
      const filename = `${code}.png`;
      const dest = path.join(sizeDir, filename);
      const url = `https://flagcdn.com/${size.label}/${code}.png`;

      if (fs.existsSync(dest)) {
        skippedCount++;
        continue;
      }

      try {
        await downloadFile(url, dest);
        console.log(`  ✅ ${size.dir}/${filename}`);
        downloadedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ ${size.dir}/${filename}: ${msg}`);
        failCount++;
        failures.push(`${size.dir}/${filename}`);
      }

      // Be polite to the CDN
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log("");
  console.log(`   Downloaded : ${downloadedCount}`);
  console.log(`   Skipped    : ${skippedCount} (already present)`);
  console.log(`   Failed     : ${failCount}`);

  if (failures.length > 0) {
    console.log(`\n   Failures:`);
    for (const f of failures) console.log(`     - ${f}`);
    console.log(`\n   Check the flag codes against FlagCDN's catalog:`);
    console.log(`     https://flagcdn.com/`);
    process.exit(1);
  }

  console.log(`\n✅ All flags present in public/flags/\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
