import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { isBasicLand } from "@/lib/commander-legality";

export class TokenEvaluationError extends Error {}

export interface TokenRecommendation {
  kind: "token" | "counter";
  /** e.g. "1/1 Saproling", "Treasure", "+1/+1 counter". */
  name: string;
  /** How many physical tokens/counters to have on hand for this deck. */
  quantity: number;
  /** Deck cards that make or use it, validated against the deck list. */
  cards: string[];
  reason: string;
}

/**
 * Reads every card in the deck (name and rules text) and asks the LLM which
 * tokens and counters the deck creates or uses and how many of each to keep
 * at the table. Card names the LLM cites are matched against the deck list
 * and dropped if not found; entries that cite no real deck card, or whose
 * quantity isn't a positive whole number, are discarded.
 */
export async function evaluateTokens(deckId: string): Promise<TokenRecommendation[]> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new TokenEvaluationError("Deck not found");
  }

  if (!deck.commanderCard) {
    throw new TokenEvaluationError("Deck has no commander set");
  }

  const cards = deck.cards.map((deckCard) => deckCard.card).filter((card) => !isBasicLand(card));
  const completion = await getLlmProvider().complete(buildPrompt(deck.commanderCard.name, cards));
  return parseRecommendations(completion, cards.map((card) => card.name));
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function parseRecommendations(completion: string, deckCardNames: string[]): TokenRecommendation[] {
  const namesByNormalized = new Map(deckCardNames.map((name) => [normalize(name), name]));
  const recommendations: TokenRecommendation[] = [];

  for (const line of completion.split("\n")) {
    const [kind, name, quantity, cardList, reason] = line
      .replace(/^[\s\d.\-*)]+/, "")
      .split("::")
      .map((part) => part?.trim());
    const normalizedKind = kind?.toLowerCase();
    const count = Number(quantity);
    if (
      (normalizedKind !== "token" && normalizedKind !== "counter") ||
      !name ||
      !Number.isInteger(count) ||
      count <= 0 ||
      !cardList ||
      !reason
    ) {
      continue;
    }

    const cards = cardList
      .split(";")
      .map((cardName) => namesByNormalized.get(normalize(cardName)))
      .filter((cardName): cardName is string => cardName !== undefined);
    if (cards.length === 0) {
      continue;
    }

    recommendations.push({ kind: normalizedKind, name, quantity: count, cards, reason });
  }

  return recommendations;
}

function buildPrompt(commanderName: string, cards: { name: string; oracleText: string | null }[]): string {
  const cardLines = cards
    .map((card) => `- ${card.name}: ${(card.oracleText ?? "").replace(/\s*\n\s*/g, " / ")}`)
    .join("\n");

  return [
    "You are preparing for a game of Magic: The Gathering Commander/EDH with the deck below.",
    `Commander: ${commanderName}`,
    "",
    "Go through every card (name and rules text) and work out which tokens and counters this deck creates or uses.",
    "Tokens include creature tokens (e.g. 1/1 Saproling) and predefined artifact tokens (Treasure, Clue, Food, Blood, ...).",
    "Counters include +1/+1 counters, loyalty-style or named counters (e.g. charge, time, stun, poison).",
    "For each one, say how many physical tokens or counters the player should have on hand at the table, sized to what this deck can realistically produce in a game, not the theoretical maximum.",
    "",
    "Respond with one line per token or counter type in exactly this format and nothing else:",
    "token or counter :: Name (e.g. 1/1 Saproling, Treasure, +1/+1 counter) :: Whole number to have on hand :: Deck cards that make or use it, separated by semicolons :: One-sentence reason for that number.",
    "Order the lines by importance to the deck. Only cite cards that appear in the list.",
    "",
    "Deck cards:",
    cardLines,
  ].join("\n");
}
