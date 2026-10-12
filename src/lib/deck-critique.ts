import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { DEFAULT_GRADE_GOAL, gradeAndCritiqueDeck, type DeckGrade } from "@/lib/deck-grade";
import { buildGradeInput, loadEarlierGraded, snapshotOf } from "@/lib/deck-version";
import { deckSignature } from "@/lib/deck-signature";

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

export interface CritiqueResult {
  critique: string;
  /** Null when the scores couldn't be read. */
  grade: (DeckGrade & { goal: string; signature: string }) | null;
}

/**
 * Critiques the deck and grades it in the same LLM call so the written
 * critique and the scores agree. Decks without a goal are graded against
 * the win condition the model infers, which is stored as the grade's goal. The grade is anchored to the
 * latest graded version (when graded against the same goal) so it stays
 * comparable with version history.
 */
export async function critiqueAndGradeDeck(deckId: string): Promise<CritiqueResult> {
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

  const goal = deck.goal?.trim() || null;

  const { grade, critique } = await gradeAndCritiqueDeck(
    buildGradeInput(snapshotOf(deck), goal, await loadEarlierGraded(deckId)),
  );

  return {
    critique,
    grade: grade
      ? {
          ...grade,
          // Without a stated goal, grade against the win condition the model inferred.
          goal: goal ?? grade.winCondition ?? DEFAULT_GRADE_GOAL,
          signature: deckSignature(deck.commanderCardId, deck.cards),
        }
      : null,
  };
}
