import { prisma } from "@/lib/prisma";
import { fetchCardsByName } from "@/lib/scryfall";

/** Prices older than this are considered stale and eligible for a refresh. */
export const PRICE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isPriceStale(pricesUpdatedAt: Date | null, now: Date = new Date()): boolean {
  return pricesUpdatedAt === null || now.getTime() - pricesUpdatedAt.getTime() > PRICE_STALE_AFTER_MS;
}

/**
 * Refreshes price and image data from Scryfall for the given cards and
 * returns how many were updated. With `force: false` (the default) only
 * cards with missing or stale prices are fetched. Cards Scryfall doesn't
 * recognise are skipped. Throws if Scryfall is unreachable, so callers can
 * surface that rather than silently showing old prices.
 */
export async function refreshCardPrices(
  cardIds: string[],
  { force = false }: { force?: boolean } = {},
): Promise<number> {
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, name: true, pricesUpdatedAt: true },
  });

  const targets = force ? cards : cards.filter((card) => isPriceStale(card.pricesUpdatedAt));
  if (targets.length === 0) {
    return 0;
  }

  const fetched = await fetchCardsByName(targets.map((card) => card.name));
  const now = new Date();
  let updated = 0;

  for (const card of targets) {
    const match = fetched.get(card.name.toLowerCase());
    if (!match) {
      continue;
    }

    await prisma.card.update({
      where: { id: card.id },
      data: {
        priceUsd: match.priceUsd,
        priceUsdFoil: match.priceUsdFoil,
        imageUrl: match.imageUrl,
        pricesUpdatedAt: now,
      },
    });
    updated += 1;
  }

  return updated;
}
