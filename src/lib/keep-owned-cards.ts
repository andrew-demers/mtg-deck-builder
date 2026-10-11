import { prisma } from "@/lib/prisma";
import { isBasicLand } from "@/lib/commander-legality";

export class KeepOwnedError extends Error {}

export interface RemovedCard {
  cardId: string;
  name: string;
  reason: "not-owned" | "in-another-deck";
}

/**
 * Strips a deck down to cards the caller can actually play: removes every
 * non-commander card the caller doesn't own, and every one that's already in
 * another of their decks. Commanders and basic lands are always kept - the
 * deck is meaningless without its commander, and basics are freely reused
 * across decks (same rule as the "in another deck" tag). Returns what was
 * removed, with the reason ("not-owned" wins when both apply).
 */
export async function keepOnlyOwnedCards(deckId: string): Promise<RemovedCard[]> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new KeepOwnedError("Deck not found");
  }

  const [owned, otherDeckCards] = await Promise.all([
    prisma.collectionEntry.findMany({ where: { userId: deck.userId }, select: { cardId: true } }),
    prisma.deckCard.findMany({
      where: { deckId: { not: deckId }, deck: { userId: deck.userId } },
      select: { cardId: true },
    }),
  ]);
  const ownedIds = new Set(owned.map((entry) => entry.cardId));
  const otherDeckIds = new Set(otherDeckCards.map((deckCard) => deckCard.cardId));

  const removed: (RemovedCard & { deckCardId: string })[] = [];
  for (const deckCard of deck.cards) {
    if (deckCard.isCommander || isBasicLand(deckCard.card)) {
      continue;
    }
    const reason = !ownedIds.has(deckCard.cardId)
      ? "not-owned"
      : otherDeckIds.has(deckCard.cardId)
        ? "in-another-deck"
        : null;
    if (reason) {
      removed.push({ deckCardId: deckCard.id, cardId: deckCard.cardId, name: deckCard.card.name, reason });
    }
  }

  if (removed.length > 0) {
    await prisma.deckCard.deleteMany({ where: { id: { in: removed.map((r) => r.deckCardId) } } });
  }

  return removed.map(({ cardId, name, reason }) => ({ cardId, name, reason }));
}
