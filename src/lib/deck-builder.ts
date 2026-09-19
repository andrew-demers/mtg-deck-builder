import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { isBasicLand, unionColorIdentity, validateColorIdentity } from "@/lib/commander-legality";
import type { Card } from "@/generated/prisma/client";

const NON_COMMANDER_DECK_SIZE = 99;

export class DeckBuildError extends Error {}

export interface DeckBuildCard {
  cardId: string;
  quantity: number;
  isCommander: boolean;
}

export interface BuildDeckResult {
  cards: DeckBuildCard[];
}

/**
 * Builds a full 100-card Commander deck around a deck's already-chosen
 * commander, picking the other 99 cards from the user's owned collection via
 * the configured LLM provider.
 *
 * The LLM's picks are never trusted directly: each returned name is matched
 * case-insensitively against the user's owned (non-commander) cards, and
 * every match is re-checked against color identity and singleton before
 * being accepted. Anything hallucinated (not owned), off-color, or a repeat
 * of a nonland card already picked is dropped silently rather than surfaced
 * as an error, since the backfill step below exists precisely to make up
 * for a shortfall.
 */
export async function buildDeck(deckId: string): Promise<BuildDeckResult> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new DeckBuildError("Deck not found");
  }

  if (!deck.commanderCardId || !deck.commanderCard) {
    throw new DeckBuildError("Deck has no commander set");
  }

  const commander = deck.commanderCard;

  // A deck whose commander was just chosen but never built yet has no
  // DeckCard rows at all, so fall back to the single chosen commander in
  // that case rather than treating the deck as commander-less.
  const commanderDeckCards = deck.cards.filter((deckCard) => deckCard.isCommander);
  const commanders =
    commanderDeckCards.length > 0 ? commanderDeckCards.map((deckCard) => deckCard.card) : [commander];

  const entries = await prisma.collectionEntry.findMany({
    where: { userId: deck.userId },
    include: { card: true },
  });

  // The commander already occupies its own slot, so it's excluded from the
  // pool offered to the LLM (and from anything matched back against it).
  const ownedPool = entries.map((entry) => entry.card).filter((card) => card.id !== commander.id);

  const completion = await getLlmProvider().complete(buildPrompt(commanders, ownedPool));
  const pickedNames = parsePickedNames(completion);

  const cardsByName = new Map(ownedPool.map((card) => [normalize(card.name), card]));

  const accepted = new Map<string, number>();

  for (const name of pickedNames) {
    if (sumQuantities(accepted) >= NON_COMMANDER_DECK_SIZE) {
      break;
    }

    const card = cardsByName.get(normalize(name));
    if (!card) {
      continue; // hallucinated or not owned
    }

    if (!validateColorIdentity(unionColorIdentity(commanders), [card])) {
      continue; // outside the commander's color identity
    }

    const isLand = isBasicLand(card);
    if (!isLand && accepted.has(card.id)) {
      continue; // singleton violation - already picked
    }

    accepted.set(card.id, (accepted.get(card.id) ?? 0) + 1);
  }

  const shortfall = NON_COMMANDER_DECK_SIZE - sumQuantities(accepted);

  if (shortfall > 0) {
    const ownedBasicLands = ownedPool.filter(isBasicLand);

    // Basic lands are exempt from singleton, so any owned basic land can
    // absorb the entire shortfall as extra quantity. If the user owns none
    // at all, there's nothing legal left to pad the deck with, so this
    // fails loudly rather than silently shipping a short deck.
    if (ownedBasicLands.length === 0) {
      throw new DeckBuildError(
        "Could not reach 99 legal cards and the user owns no basic lands to backfill with.",
      );
    }

    const backfillLand = ownedBasicLands[0];
    accepted.set(backfillLand.id, (accepted.get(backfillLand.id) ?? 0) + shortfall);
  }

  const cards: DeckBuildCard[] = [
    { cardId: commander.id, quantity: 1, isCommander: true },
    ...Array.from(accepted.entries()).map(([cardId, quantity]) => ({
      cardId,
      quantity,
      isCommander: false,
    })),
  ];

  return { cards };
}

function sumQuantities(accepted: Map<string, number>): number {
  return Array.from(accepted.values()).reduce((sum, quantity) => sum + quantity, 0);
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function parsePickedNames(completion: string): string[] {
  return completion
    .split("\n")
    .map((line) => line.replace(/^[\s\d.\-)]+/, "").trim())
    .filter((line) => line.length > 0);
}

function buildPrompt(commanders: Card[], ownedPool: Card[]): string {
  const names = ownedPool.map((card) => `- ${card.name}`).join("\n");
  const commanderNames = commanders.map((commander) => commander.name).join(" + ");
  const colorIdentity = unionColorIdentity(commanders);

  return [
    "You are building a Magic: The Gathering Commander/EDH deck.",
    `Commander: ${commanderNames} (color identity: ${colorIdentity.join("") || "colorless"})`,
    "",
    "Pick exactly 99 more cards for this deck from the following list of cards the player owns.",
    "Every card must be within the commander's color identity, and every nonland card may appear at most once (singleton). Basic lands may repeat.",
    "Respond with one card name per line and nothing else.",
    "",
    "Owned cards:",
    names,
  ].join("\n");
}
