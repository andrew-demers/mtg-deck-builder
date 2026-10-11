/**
 * Refreshes Scryfall prices and images for cards in the local catalog.
 * By default only cards that are in someone's collection or deck are
 * refreshed (the full ~35k catalog is rarely needed); pass `--all` for
 * everything. Only stale (>24h) cards are fetched unless `--force` is given.
 *
 * Usage: `npm run sync-prices [-- --all] [-- --force]`
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { refreshCardPrices } from "@/lib/card-prices";

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const force = process.argv.includes("--force");

  const cards = await prisma.card.findMany({
    where: all
      ? {}
      : { OR: [{ collectionEntries: { some: {} } }, { deckCards: { some: {} } }] },
    select: { id: true },
  });
  console.log(`Refreshing prices for up to ${cards.length} cards ...`);

  const updated = await refreshCardPrices(
    cards.map((card) => card.id),
    { force },
  );
  console.log(`Updated ${updated} cards.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
