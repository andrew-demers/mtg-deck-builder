/**
 * One-time (or periodically re-run) setup script: downloads MTGJSON's
 * AtomicCards.json.xz, decompresses it, and upserts every card into the
 * local `Card` table.
 *
 * Prerequisite: the `xz` CLI must be installed and on `PATH` (e.g. via
 * `brew install xz` on macOS). This script shells out to it to decompress
 * the download rather than pulling in a JS xz decoder.
 *
 * Usage: `npm run sync-cards`
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAtomicCards } from "@/lib/mtgjson";
import { syncCards } from "@/lib/card-sync";

const ATOMIC_CARDS_URL = "https://mtgjson.com/api/v5/AtomicCards.json.xz";

async function main(): Promise<void> {
  const startedAt = Date.now();
  const workDir = mkdtempSync(path.join(tmpdir(), "mtgjson-sync-"));
  const compressedPath = path.join(workDir, "AtomicCards.json.xz");
  const jsonPath = path.join(workDir, "AtomicCards.json");

  try {
    console.log(`Downloading ${ATOMIC_CARDS_URL} ...`);
    const response = await fetch(ATOMIC_CARDS_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to download AtomicCards.json.xz: ${response.status} ${response.statusText}`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    writeFileSync(compressedPath, Buffer.from(arrayBuffer));
    console.log(
      `Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MiB.`,
    );

    console.log("Decompressing with xz ...");
    execFileSync("xz", ["-d", "-k", compressedPath]);

    console.log("Parsing AtomicCards.json ...");
    const jsonText = readFileSync(jsonPath, "utf-8");
    const cards = parseAtomicCards(jsonText);
    console.log(`Parsed ${cards.length} cards. Syncing to the database ...`);

    await syncCards(cards);

    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `Synced ${cards.length} cards into the Card table in ${elapsedSeconds}s.`,
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
