import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { isBasicLand, unionColorIdentity } from "@/lib/commander-legality";
import { parseCardDecisions, settledEditLines } from "@/lib/deck-decisions";
import type { Card } from "@/generated/prisma/client";

export const COMMANDER_DECK_SIZE = 100;

export class CardCutError extends Error {}

export interface CutSuggestion {
  card: Card;
  reason: string;
}

/**
 * For a Commander deck holding more than 100 cards, asks the LLM which cards
 * to cut to bring it back to 100. Exactly `total - 100` cuts are requested;
 * the commander and basic lands are never offered, and as with
 * `suggestReplacements` the LLM's output is matched case-insensitively
 * against what was offered, so unknown or duplicate names are dropped (the
 * result can therefore be shorter than the number requested). Cards the
 * player just added are left out when other cards can cover the surplus, so
 * a card that was just put in is not immediately offered as a cut. A deck of
 * 100 cards or fewer is a `CardCutError`.
 */
export async function suggestCuts(deckId: string): Promise<CutSuggestion[]> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new CardCutError("Deck not found");
  }

  if (!deck.commanderCardId || !deck.commanderCard) {
    throw new CardCutError("Deck has no commander set");
  }

  const total = deck.cards.reduce((sum, deckCard) => sum + deckCard.quantity, 0);
  const excess = total - COMMANDER_DECK_SIZE;

  if (excess <= 0) {
    throw new CardCutError("Deck has no more than 100 cards");
  }

  const commanderDeckCards = deck.cards.filter((deckCard) => deckCard.isCommander);
  const commanders =
    commanderDeckCards.length > 0
      ? commanderDeckCards.map((deckCard) => deckCard.card)
      : [deck.commanderCard];
  const colorIdentity = unionColorIdentity(commanders);

  const decisions = parseCardDecisions(deck.cardDecisions);
  const protectedIds = new Set(decisions.adds.map((card) => card.id));
  const allCuttable = deck.cards
    .filter((deckCard) => !deckCard.isCommander && !isBasicLand(deckCard.card))
    .map((deckCard) => deckCard.card);

  if (allCuttable.length === 0) {
    throw new CardCutError("Deck has no cards to cut");
  }

  // Leave cards the player just added alone when something else can be cut
  // to reach 100. If those adds are the only surplus, they can still be cut.
  const unprotected = allCuttable.filter((card) => !protectedIds.has(card.id));
  const canSpareAdds = unprotected.length >= excess;
  const cuttable = canSpareAdds ? unprotected : allCuttable;

  const completion = await getLlmProvider().complete(
    buildPrompt(commanders, colorIdentity, cuttable, excess, canSpareAdds ? decisions : null, canSpareAdds ? [] : decisions.adds.map((card) => card.name)),
  );

  const cuttableByName = new Map(cuttable.map((card) => [normalize(card.name), card]));
  const used = new Set<string>();
  const cuts: CutSuggestion[] = [];

  for (const { name, reason } of parseCuts(completion)) {
    const card = cuttableByName.get(normalize(name));

    if (!card || used.has(card.id)) {
      continue;
    }

    used.add(card.id);
    cuts.push({ card, reason });

    if (cuts.length === excess) {
      break;
    }
  }

  return cuts;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function parseCuts(completion: string): { name: string; reason: string }[] {
  return completion
    .split("\n")
    .map((line) => line.replace(/^[\s\d.\-)]+/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name, reason] = line.split("::").map((part) => part?.trim());
      return name && reason ? { name, reason } : null;
    })
    .filter((cut): cut is { name: string; reason: string } => cut !== null);
}

function buildPrompt(
  commanders: Card[],
  colorIdentity: string[],
  deckCards: Card[],
  count: number,
  decisions: ReturnType<typeof parseCardDecisions> | null = null,
  addedNamesToCutLast: string[] = [],
): string {
  const commanderNames = commanders.map((commander) => commander.name).join(" + ");
  const deckList = deckCards
    .map((card) => `- ${card.name} (${card.type}${card.oracleText ? `: ${card.oracleText}` : ""})`)
    .join("\n");

  return [
    "You are trimming an oversized Magic: The Gathering Commander/EDH deck down to 100 cards.",
    `Commander: ${commanderNames} (color identity: ${colorIdentity.join("") || "colorless"})`,
    "",
    `Pick exactly ${count} card${count === 1 ? "" : "s"} to cut: the weakest or least synergistic with the commander and the rest of the deck. Keep the mana base and core strategy functional.`,
    "Only cut cards from the deck list, and never pick the same card twice.",
    ...(decisions ? settledEditLines(decisions) : []),
    ...(addedNamesToCutLast.length > 0
      ? [
          `The player just added ${addedNamesToCutLast.join(", ")}. Cut those only if you cannot reach ${count} cuts without them.`,
        ]
      : []),
    "Respond with one cut per line in exactly this format and nothing else:",
    "Deck Card To Cut :: One-sentence reason it should go.",
    "",
    "Current deck (excluding commander and basic lands):",
    deckList,
  ].join("\n");
}
