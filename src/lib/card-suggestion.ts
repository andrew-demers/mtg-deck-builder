import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { validateColorIdentity } from "@/lib/commander-legality";
import type { Card } from "@/generated/prisma/client";

export class CardSuggestionError extends Error {}

/**
 * Asks the LLM to suggest additions to an existing deck from the user's
 * *remaining* owned cards - cards in `CollectionEntry` whose owned quantity
 * exceeds how many copies are already in this deck's `DeckCard` set. Cards
 * with zero remaining availability (fully used already) are excluded from
 * the pool offered to the LLM, so they can never be suggested.
 *
 * The LLM's suggestions are never trusted directly: each returned name is
 * matched case-insensitively against the remaining-owned pool, and every
 * match is re-checked against the commander's color identity before being
 * accepted. Anything hallucinated (not owned, or already fully used),
 * off-color, or duplicated across suggestions is dropped silently.
 */
export async function suggestCards(deckId: string): Promise<Card[]> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: true },
  });

  if (!deck) {
    throw new CardSuggestionError("Deck not found");
  }

  if (!deck.commanderCardId || !deck.commanderCard) {
    throw new CardSuggestionError("Deck has no commander set");
  }

  const commander = deck.commanderCard;

  const entries = await prisma.collectionEntry.findMany({
    where: { userId: deck.userId },
    include: { card: true },
  });

  // A card can have more than one CollectionEntry row (e.g. foil and
  // non-foil), so owned quantity is summed per card before comparing
  // against how many copies are already in this deck.
  const ownedByCardId = new Map<string, { card: Card; quantity: number }>();
  for (const entry of entries) {
    const existing = ownedByCardId.get(entry.cardId);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      ownedByCardId.set(entry.cardId, { card: entry.card, quantity: entry.quantity });
    }
  }

  const usedByCardId = new Map<string, number>();
  for (const deckCard of deck.cards) {
    usedByCardId.set(deckCard.cardId, (usedByCardId.get(deckCard.cardId) ?? 0) + deckCard.quantity);
  }

  const remainingPool: Card[] = [];
  for (const [cardId, { card, quantity }] of ownedByCardId) {
    const used = usedByCardId.get(cardId) ?? 0;
    if (quantity - used > 0) {
      remainingPool.push(card);
    }
  }

  if (remainingPool.length === 0) {
    return [];
  }

  const completion = await getLlmProvider().complete(buildPrompt(commander, remainingPool));
  const suggestedNames = parseNames(completion);

  const cardsByName = new Map(remainingPool.map((card) => [normalize(card.name), card]));

  const matched = new Map<string, Card>();
  for (const name of suggestedNames) {
    const card = cardsByName.get(normalize(name));
    if (!card) {
      continue; // hallucinated, or owned but with no remaining availability
    }

    if (!validateColorIdentity(commander.colorIdentity, [card])) {
      continue; // outside the commander's color identity
    }

    matched.set(card.id, card);
  }

  return Array.from(matched.values());
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function parseNames(completion: string): string[] {
  return completion
    .split("\n")
    .map((line) => line.replace(/^[\s\d.\-)]+/, "").trim())
    .filter((line) => line.length > 0);
}

function buildPrompt(commander: Card, remainingPool: Card[]): string {
  const names = remainingPool.map((card) => `- ${card.name}`).join("\n");

  return [
    "You are suggesting additions to an existing Magic: The Gathering Commander/EDH deck.",
    `Commander: ${commander.name} (color identity: ${commander.colorIdentity.join("") || "colorless"})`,
    "",
    "Suggest cards to add to this deck from the following list of cards the player owns but has not yet fully used in this deck.",
    "Every suggestion must be within the commander's color identity.",
    "Respond with one card name per line and nothing else.",
    "",
    "Available cards:",
    names,
  ].join("\n");
}
