import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";

export class DeckCritiqueError extends Error {}

/**
 * Asks the LLM for a free-text review of a built deck's card list.
 *
 * Unlike commander suggestion or deck construction, there's no ground truth
 * to validate a critique against - it's free-text commentary, not a card
 * name to match - so the LLM's response is returned unmodified rather than
 * filtered or matched against anything.
 */
export async function critiqueDeck(deckId: string): Promise<string> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new DeckCritiqueError("Deck not found");
  }

  if (!deck.commanderCard) {
    throw new DeckCritiqueError("Deck has no commander set");
  }

  return getLlmProvider().complete(buildPrompt(deck.commanderCard.name, deck.cards));
}

function buildPrompt(
  commanderName: string,
  cards: { quantity: number; isCommander: boolean; card: { name: string } }[],
): string {
  const nonCommanderNames = cards
    .filter((deckCard) => !deckCard.isCommander)
    .map((deckCard) => `- ${deckCard.card.name}${deckCard.quantity > 1 ? ` x${deckCard.quantity}` : ""}`)
    .join("\n");

  return [
    "You are reviewing a Magic: The Gathering Commander/EDH deck.",
    `Commander: ${commanderName}`,
    "",
    "The rest of the deck:",
    nonCommanderNames,
    "",
    "Give a free-text critique of this deck: its strengths, weaknesses, and any suggestions for improvement.",
  ].join("\n");
}
