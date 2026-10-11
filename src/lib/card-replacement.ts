import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import {
  isBasicLand,
  unionColorIdentity,
  validateColorIdentity,
} from "@/lib/commander-legality";
import type { Card } from "@/generated/prisma/client";

export class CardReplacementError extends Error {}

export interface ReplacementSuggestion {
  add: Card;
  remove: Card;
  reason: string;
}

/**
 * Given cards the player just acquired (`newCardIds`), asks the LLM which
 * existing deck card each one should replace. Every new card must be owned by
 * the deck's user, within the commander's color identity, and not already in
 * the deck (basic lands excepted); anything else is a `CardReplacementError`
 * so the caller learns their selection was invalid instead of silently
 * getting fewer results.
 *
 * As with `suggestCards`, the LLM's output is never trusted directly: both
 * names are matched case-insensitively against what was actually offered
 * (selected new cards, and the deck's non-commander cards), and a swap is
 * dropped if either side is unknown, or if the card to cut was already
 * claimed by an earlier swap or the new card was already matched. The
 * commander is never offered as a cut. The reason is trusted as-is.
 */
export async function suggestReplacements(
  deckId: string,
  newCardIds: string[],
): Promise<ReplacementSuggestion[]> {
  const uniqueIds = Array.from(new Set(newCardIds));

  if (uniqueIds.length === 0) {
    throw new CardReplacementError("Select at least one card");
  }

  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new CardReplacementError("Deck not found");
  }

  if (!deck.commanderCardId || !deck.commanderCard) {
    throw new CardReplacementError("Deck has no commander set");
  }

  const commanderDeckCards = deck.cards.filter((deckCard) => deckCard.isCommander);
  const commanders =
    commanderDeckCards.length > 0
      ? commanderDeckCards.map((deckCard) => deckCard.card)
      : [deck.commanderCard];
  const colorIdentity = unionColorIdentity(commanders);

  const cuttable = deck.cards.filter((deckCard) => !deckCard.isCommander).map((deckCard) => deckCard.card);

  if (cuttable.length === 0) {
    throw new CardReplacementError("Deck has no cards to replace");
  }

  const entries = await prisma.collectionEntry.findMany({
    where: { userId: deck.userId, cardId: { in: uniqueIds } },
    include: { card: true },
  });
  const ownedById = new Map(entries.map((entry) => [entry.cardId, entry.card]));
  const deckCardIds = new Set(deck.cards.map((deckCard) => deckCard.cardId));

  const newCards: Card[] = [];
  for (const id of uniqueIds) {
    const card = ownedById.get(id);
    if (!card) {
      throw new CardReplacementError("You do not own one of the selected cards");
    }
    if (!validateColorIdentity(colorIdentity, [card])) {
      throw new CardReplacementError(`${card.name} is outside the commander's color identity`);
    }
    if (deckCardIds.has(id) && !isBasicLand(card)) {
      throw new CardReplacementError(`${card.name} is already in the deck`);
    }
    newCards.push(card);
  }

  const completion = await getLlmProvider().complete(buildPrompt(commanders, colorIdentity, newCards, cuttable));

  const newByName = new Map(newCards.map((card) => [normalize(card.name), card]));
  const cuttableByName = new Map(cuttable.map((card) => [normalize(card.name), card]));

  const usedAdds = new Set<string>();
  const usedRemoves = new Set<string>();
  const swaps: ReplacementSuggestion[] = [];

  for (const { addName, removeName, reason } of parseReplacements(completion)) {
    const add = newByName.get(normalize(addName));
    const remove = cuttableByName.get(normalize(removeName));

    if (!add || !remove || usedAdds.has(add.id) || usedRemoves.has(remove.id)) {
      continue;
    }

    usedAdds.add(add.id);
    usedRemoves.add(remove.id);
    swaps.push({ add, remove, reason });
  }

  return swaps;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function parseReplacements(
  completion: string,
): { addName: string; removeName: string; reason: string }[] {
  return completion
    .split("\n")
    .map((line) => line.replace(/^[\s\d.\-)]+/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [addName, removeName, reason] = line.split("::").map((part) => part?.trim());
      return addName && removeName && reason ? { addName, removeName, reason } : null;
    })
    .filter(
      (swap): swap is { addName: string; removeName: string; reason: string } => swap !== null,
    );
}

function buildPrompt(
  commanders: Card[],
  colorIdentity: string[],
  newCards: Card[],
  deckCards: Card[],
): string {
  const commanderNames = commanders.map((commander) => commander.name).join(" + ");
  const newList = newCards
    .map((card) => `- ${card.name} (${card.type}${card.oracleText ? `: ${card.oracleText}` : ""})`)
    .join("\n");
  const deckList = deckCards.map((card) => `- ${card.name} (${card.type})`).join("\n");

  return [
    "You are improving an existing Magic: The Gathering Commander/EDH deck with cards the player just acquired.",
    `Commander: ${commanderNames} (color identity: ${colorIdentity.join("") || "colorless"})`,
    "",
    `For each new card below, pick one card currently in the deck that it should replace, or skip the new card if it would not improve the deck.`,
    "Never pick the same card to cut twice. Only cut cards from the deck list.",
    "Respond with one swap per line in exactly this format and nothing else:",
    "New Card Name :: Deck Card To Cut :: One-sentence reason the swap improves the deck.",
    "",
    "New cards:",
    newList,
    "",
    "Current deck (excluding commander):",
    deckList,
  ].join("\n");
}
