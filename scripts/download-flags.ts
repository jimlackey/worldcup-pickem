/**
 * scripts/download-flags.ts
 *
 * Download flag images from FlagCDN for local hosting.
 * Run with: npx tsx scripts/download-flags.ts
 *
 * FlagCDN URL format: https://flagcdn.com/{width}x{height}/{code}.png
 * Downloads two sizes for all 48 teams.
 * Saves to public/flags/ directory.
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";

const FLAG_CODES = [
  "ma", "pe", "ca", "au",
  "fr", "co", "sa", "nz",
  "ar", "mx", "uz", "eg",
  "br", "it", "ec", "bh",
  "pt", "dk", "rs", "bo",
  "nl", "hu", "cr", "tt",
  "es", "tr", "cn", "hn",
  "gb-eng", "sn", "al", "qa",
  "de", "cl", "jp", "si",
  "us", "uy", "pa", "kr",
  "be", "py", "ir", "cm",
  "hr", "gb-wls", "gb-sct", "jm",
];

// FlagCDN uses {width}x{height} in the path
const SIZES = [
  { label: "32x24", dir: "32x24" },
  { label: "64x48", dir: "64x48" },
];

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, (response) => {
      // Follow redirects
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
        try { fs.unlinkSync(dest); } catch {}
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    });
    request.on("error", (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

async function main() {
  console.log("🏳️ Downloading flag images from FlagCDN...\n");

  const baseDir = path.resolve(process.cwd(), "public", "flags");
  let successCount = 0;
  let failCount = 0;

  for (const size of SIZES) {
    const sizeDir = path.join(baseDir, size.dir);
    fs.mkdirSync(sizeDir, { recursive: true });

    for (const code of FLAG_CODES) {
      const url = `https://flagcdn.com/${size.label}/${code}.png`;
      const filename = `${code}.png`;
      const dest = path.join(sizeDir, filename);

      if (fs.existsSync(dest)) {
        successCount++;
        continue;
      }

      try {
        await downloadFile(url, dest);
        console.log(`  ✅ ${size.dir}/${filename}`);
        successCount++;
      } catch (err) {
        console.error(`  ❌ ${size.dir}/${filename}: ${err}`);
        failCount++;
      }

      // Small delay to be polite to the CDN
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log(`\n✅ Done: ${successCount} downloaded, ${failCount} failed`);
  console.log(`   Flags saved to public/flags/\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
