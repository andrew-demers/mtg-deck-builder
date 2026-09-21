import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";

export class DeckDescriptionError extends Error {}

/**
 * Asks the LLM for a free-text summary of how a built deck plays - its win
 * condition(s) and overall game plan.
 *
 * Unlike commander suggestion or deck construction, there's no ground truth
 * to validate a description against - it's free-text commentary, not a card
 * name to match - so the LLM's response is returned unmodified rather than
 * filtered or matched against anything.
 */
export async function describeDeck(deckId: string): Promise<string> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new DeckDescriptionError("Deck not found");
  }

  if (!deck.commanderCard) {
    throw new DeckDescriptionError("Deck has no commander set");
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
    "You are summarizing a Magic: The Gathering Commander/EDH deck for its owner.",
    `Commander: ${commanderName}`,
    "",
    "The rest of the deck:",
    nonCommanderNames,
    "",
    "Describe how this deck plays: what its win condition(s) are, and the general game plan for getting there.",
    "Keep it to a short paragraph or two of free text.",
  ].join("\n");
}
