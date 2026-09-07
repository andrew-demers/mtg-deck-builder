import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import type { Card } from "@/generated/prisma/client";

export type SuggestCommanderResult =
  | { success: true; card: Card }
  | { success: false; error: string };

/**
 * Asks the LLM to suggest a Commander from the user's owned
 * commander-eligible cards, then validates the answer against that same
 * owned set before trusting it - the LLM's response text is matched
 * case-insensitively (trimmed) against owned card names rather than used
 * directly, so a hallucinated (non-owned) name is rejected instead of
 * surfaced.
 */
export async function suggestCommander(userId: string): Promise<SuggestCommanderResult> {
  const entries = await prisma.collectionEntry.findMany({
    where: { userId, card: { isCommanderEligible: true } },
    include: { card: true },
  });

  if (entries.length === 0) {
    return {
      success: false,
      error: "You have no commander-eligible cards in your collection.",
    };
  }

  const eligibleCards = entries.map((entry) => entry.card);
  const cardsByName = new Map(
    eligibleCards.map((card) => [normalize(card.name), card]),
  );

  const completion = await getLlmProvider().complete(buildPrompt(eligibleCards));
  const matched = cardsByName.get(normalize(completion));

  if (!matched) {
    return {
      success: false,
      error: "The suggested commander does not match any card you own.",
    };
  }

  return { success: true, card: matched };
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function buildPrompt(cards: { name: string }[]): string {
  const names = cards.map((card) => `- ${card.name}`).join("\n");

  return [
    "You are helping a Magic: The Gathering player choose a Commander for a Commander/EDH deck.",
    "Here are the commander-eligible cards they currently own:",
    names,
    "",
    "Respond with only the exact name of one card from this list that would make a good Commander. Do not include any other text.",
  ].join("\n");
}
