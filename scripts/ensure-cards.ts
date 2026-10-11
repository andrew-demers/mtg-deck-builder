/**
 * Container startup helper: if the local card catalog is missing or looks
 * incomplete (first run, or an earlier sync that was interrupted), runs the
 * full MTGJSON sync so imports can match cards without a manual
 * `npm run sync-cards`. A no-op once the catalog looks complete - re-sync
 * manually when new sets release. The sync is an idempotent upsert, so
 * re-running over a partial catalog is safe.
 *
 * Usage: `tsx scripts/ensure-cards.ts` (see docker-entrypoint.sh)
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { prisma } from "@/lib/prisma";

// The full MTGJSON catalog is ~35k cards; anything well below that means an
// earlier sync never finished.
const MIN_EXPECTED_CARDS = 30_000;

async function main(): Promise<void> {
  const count = await prisma.card.count();
  await prisma.$disconnect();

  if (count >= MIN_EXPECTED_CARDS) {
    console.log(`[ensure-cards] Catalog already has ${count} cards, skipping sync.`);
    return;
  }

  console.log(
    `[ensure-cards] Card catalog has ${count} cards (expected ${MIN_EXPECTED_CARDS}+), running sync (a few minutes)...`,
  );
  execFileSync("node_modules/.bin/tsx", ["scripts/sync-cards.ts"], { stdio: "inherit" });
  console.log("[ensure-cards] Card sync complete.");
}

main().catch((error: unknown) => {
  console.error("[ensure-cards] Failed:", error);
  process.exitCode = 1;
});
