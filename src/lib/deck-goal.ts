import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";

export class DeckGoalError extends Error {}

/**
 * Asks the LLM to draft the deck's goal (how it intends to win) from its
 * commander and cards, for the owner to edit before saving. The goal is what
 * versions are graded against, so the prompt asks for something specific
 * enough to judge: a win method, a target speed, and the play pattern.
 */
export async function draftDeckGoal(deckId: string): Promise<string> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new DeckGoalError("Deck not found");
  }

  if (!deck.commanderCard) {
    throw new DeckGoalError("Deck has no commander set");
  }

  if (deck.cards.length === 0) {
    throw new DeckGoalError("Build the deck before drafting a goal");
  }

  const cardLines = deck.cards
    .filter((deckCard) => !deckCard.isCommander)
    .map((deckCard) => `- ${deckCard.card.name}${deckCard.quantity > 1 ? ` x${deckCard.quantity}` : ""}`)
    .join("\n");

  const prompt = [
    "You are writing the goal for a Magic: The Gathering Commander/EDH deck: what the deck is trying to do to win. The goal will be used to grade how well the deck is built.",
    `Commander: ${deck.commanderCard.name}`,
    ...(deck.description ? ["", "The owner's description of the deck:", deck.description] : []),
    "",
    "The rest of the deck:",
    cardLines,
    "",
    "Infer the deck's real plan from the cards that are actually in it, not from the commander alone.",
    "Write the goal in one or two plain sentences, in the owner's voice, that state:",
    "- the primary way the deck wins (name the key cards or combos where it helps),",
    "- how quickly it aims to win (a target turn range),",
    "- and, if the cards support it, how it protects that plan.",
    "Be specific enough that someone could judge whether a deck achieves it. No headings, bullets, or preamble.",
  ].join("\n");

  return (await getLlmProvider().complete(prompt)).trim();
}
