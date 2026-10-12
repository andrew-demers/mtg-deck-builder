import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import {
  isBasicLand,
  REQUIRED_DECK_SIZE,
  unionColorIdentity,
  validateColorIdentity,
} from "@/lib/commander-legality";
import { selectWithinBudget } from "@/lib/budget-selection";
import { findBudgetCandidates } from "@/lib/budget-candidates";
import type { Card } from "@/generated/prisma/client";

export class CardSuggestionError extends Error {}

export interface SuggestedCard {
  card: Card;
  tag: string;
  reason: string;
}

export interface SuggestCardsOptions {
  /**
   * When true, the LLM's pool is widened from the user's remaining owned
   * cards to also include every catalog card within the commander's color
   * identity that isn't already in the deck, so it may suggest strong cards
   * the user doesn't yet own (surfaced to the user as "not owned"
   * elsewhere). Defaults to true; pass false to restrict to owned cards.
   */
  allowUnowned?: boolean;
  /**
   * Maximum total USD to spend on cards the user doesn't own. Owned cards
   * are free. Implies `allowUnowned`; unowned cards with no known price are
   * excluded since their cost can't be checked. The LLM ranks a wider
   * candidate list and the best-value combination that fits is chosen.
   */
  budgetUsd?: number;
}

/**
 * Asks the LLM to suggest additions to an existing deck from the user's
 * *remaining* owned cards - cards in `CollectionEntry` whose owned quantity
 * exceeds how many copies are already in this deck's `DeckCard` set - and,
 * when `allowUnowned` is set, also from the full card catalog within the
 * commander's color identity. Cards with zero remaining availability (fully
 * used already) are excluded from the owned pool, and cards already in the
 * deck are excluded from the catalog pool, so neither can be suggested
 * again. Both pools are pre-filtered to the commander's color identity
 * before ever reaching the LLM, since a large off-color collection would
 * otherwise crowd out legal candidates in the prompt.
 *
 * The LLM's suggestions are never trusted directly: each returned name is
 * matched case-insensitively against the offered pool, and every match is
 * re-checked against the commander's color identity before being accepted.
 * Anything hallucinated, off-color, or duplicated across suggestions is
 * dropped silently. The tag and reason accompanying an accepted name are
 * trusted as-is (unlike the card name, there's no ground truth to validate
 * free-text explanations against).
 */
export async function suggestCards(
  deckId: string,
  options: SuggestCardsOptions = {},
): Promise<SuggestedCard[]> {
  const budgetUsd = options.budgetUsd;
  if (budgetUsd !== undefined && !(Number.isFinite(budgetUsd) && budgetUsd > 0)) {
    throw new CardSuggestionError("Budget must be a positive number");
  }
  const allowUnowned = (options.allowUnowned ?? true) || budgetUsd !== undefined;

  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new CardSuggestionError("Deck not found");
  }

  if (!deck.commanderCardId || !deck.commanderCard) {
    throw new CardSuggestionError("Deck has no commander set");
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

  const colorIdentity = unionColorIdentity(commanders);

  // In budget mode the player wants cards to buy, so owned cards already
  // committed to another deck don't count as free options.
  const otherDeckCardIds =
    budgetUsd === undefined
      ? new Set<string>()
      : new Set(
          (
            await prisma.deckCard.findMany({
              where: { deckId: { not: deckId }, deck: { userId: deck.userId } },
              select: { cardId: true },
            })
          ).map((deckCard) => deckCard.cardId),
        );

  const remainingPool: Card[] = [];
  for (const [cardId, { card, quantity }] of ownedByCardId) {
    const used = usedByCardId.get(cardId) ?? 0;
    // Commander's singleton rule allows only one copy of any nonbasic card,
    // so a card already in the deck can't be suggested again even if the
    // player owns further copies (e.g. foil + non-foil). Basic lands are
    // exempt and remain suggestible as long as unused copies are owned.
    const hasRemainingCopies = isBasicLand(card) ? quantity - used > 0 : used === 0;
    // Filtering to color identity here (rather than trusting the LLM's
    // instructions) keeps a mostly off-color collection from crowding out
    // legal candidates in the prompt and burning suggestion slots on cards
    // that would just get rejected by validateColorIdentity below anyway.
    const inOtherDeck = otherDeckCardIds.has(cardId) && !isBasicLand(card);
    if (hasRemainingCopies && !inOtherDeck && validateColorIdentity(colorIdentity, [card])) {
      remainingPool.push(card);
    }
  }

  const excludeIds = [
    ...commanders.map((c) => c.id),
    ...Array.from(usedByCardId.keys()),
    // Owned cards are either already in the pool above or deliberately left
    // out of it (in another deck), so the catalog must not re-add them as
    // cards to buy.
    ...(budgetUsd !== undefined ? Array.from(ownedByCardId.keys()) : []),
  ];
  let pool: Card[];
  if (budgetUsd !== undefined) {
    // Budget mode searches Scryfall for affordable, role- and
    // synergy-matched cards (already priced) instead of offering the
    // whole local catalog to the LLM.
    let candidates: Card[];
    try {
      candidates = await findBudgetCandidates({
        commanders,
        colorIdentity,
        budgetUsd,
        excludeIds,
        complete: (prompt) => getLlmProvider().complete(prompt),
      });
    } catch {
      throw new CardSuggestionError(
        "Couldn't search Scryfall for cards within your budget. Try again shortly.",
      );
    }
    pool = dedupeById([...remainingPool, ...candidates]);
  } else {
    pool = allowUnowned
      ? dedupeById([...remainingPool, ...(await findCatalogCardsInColorIdentity(colorIdentity, excludeIds))])
      : remainingPool;
  }

  if (pool.length === 0) {
    return [];
  }

  // When the deck isn't full yet, ask the LLM for enough suggestions to
  // fill it; a full deck (e.g. reviewing for upgrades) falls back to a
  // reasonable default count instead of asking for zero.
  const DEFAULT_SUGGESTION_COUNT = 10;
  const deckSize = deck.cards.reduce((sum, deckCard) => sum + deckCard.quantity, 0);
  const neededToFillDeck = Math.max(REQUIRED_DECK_SIZE - deckSize, 0);
  const requestCount = Math.min(pool.length, neededToFillDeck || DEFAULT_SUGGESTION_COUNT);

  // Under a budget the LLM ranks extra candidates so the knapsack has
  // alternatives to trade between.
  const candidateCount =
    budgetUsd !== undefined ? Math.min(pool.length, requestCount * 2) : requestCount;
  const ownedIds = new Set(remainingPool.map((card) => card.id));

  const completion = await getLlmProvider().complete(
    buildPrompt(commanders, pool, allowUnowned, candidateCount, budgetUsd, ownedIds, deck.critique),
  );
  const suggestions = parseSuggestions(completion);

  const cardsByName = new Map(pool.map((card) => [normalize(card.name), card]));

  const matched = new Map<string, SuggestedCard>();
  for (const { name, tag, reason } of suggestions) {
    const card = cardsByName.get(normalize(name));
    if (!card) {
      continue; // hallucinated, or owned but with no remaining availability
    }

    if (!validateColorIdentity(colorIdentity, [card])) {
      continue; // outside the commander's color identity
    }

    matched.set(card.id, { card, tag, reason });
  }

  const ranked = Array.from(matched.values());
  if (budgetUsd === undefined) {
    return ranked;
  }

  const chosenIds = new Set(
    selectWithinBudget(
      ranked.map(({ card }) => ({
        id: card.id,
        costCents: ownedIds.has(card.id) ? 0 : Math.round((card.priceUsd ?? 0) * 100),
      })),
      Math.round(budgetUsd * 100),
      requestCount,
    ),
  );
  return ranked.filter(({ card }) => chosenIds.has(card.id));
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function dedupeById(cards: Card[]): Card[] {
  const byId = new Map<string, Card>();
  for (const card of cards) {
    byId.set(card.id, card);
  }
  return Array.from(byId.values());
}

/**
 * Cards outside the commander's color identity can never legally join the
 * deck, so they're excluded at the database level (via the identity's
 * disallowed colors) rather than fetching the whole catalog and filtering
 * in memory.
 */
async function findCatalogCardsInColorIdentity(
  colorIdentity: string[],
  excludeIds: string[],
): Promise<Card[]> {
  const allColors = ["W", "U", "B", "R", "G"];
  const disallowed = allColors.filter((color) => !colorIdentity.includes(color));

  return prisma.card.findMany({
    where: {
      id: { notIn: excludeIds },
      ...(disallowed.length > 0 ? { NOT: { colorIdentity: { hasSome: disallowed } } } : {}),
    },
  });
}

function parseSuggestions(completion: string): { name: string; tag: string; reason: string }[] {
  return completion
    .split("\n")
    .map((line) => line.replace(/^[\s\d.\-)]+/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name, tag, reason] = line.split("::").map((part) => part?.trim());
      return name && tag && reason ? { name, tag, reason } : null;
    })
    .filter((suggestion): suggestion is { name: string; tag: string; reason: string } => suggestion !== null);
}

function buildPrompt(
  commanders: Card[],
  pool: Card[],
  allowUnowned: boolean,
  requestCount: number,
  budgetUsd?: number,
  ownedIds: Set<string> = new Set(),
  critique: string | null = null,
): string {
  const names = pool
    .map((card) => {
      if (budgetUsd === undefined) {
        return `- ${card.name}`;
      }
      const cost = ownedIds.has(card.id)
        ? " (owned)"
        : card.priceUsd !== null
          ? ` ($${card.priceUsd.toFixed(2)})`
          : "";
      return `- ${card.name}${cost}`;
    })
    .join("\n");
  const commanderNames = commanders.map((commander) => commander.name).join(" + ");
  const colorIdentity = unionColorIdentity(commanders);
  const poolDescription = allowUnowned
    ? "the following list of cards, some of which the player owns but has not yet fully used in this deck, and some of which they don't own"
    : "the following list of cards the player owns but has not yet fully used in this deck";

  return [
    "You are suggesting additions to an existing Magic: The Gathering Commander/EDH deck.",
    `Commander: ${commanderNames} (color identity: ${colorIdentity.join("") || "colorless"})`,
    "",
    `Suggest exactly ${requestCount} card${requestCount === 1 ? "" : "s"} to add to this deck from ${poolDescription}.`,
    "Every suggestion must be within the commander's color identity.",
    ...(allowUnowned
      ? ["Pick the strongest cards for this deck whether or not the player owns them; ownership is not a factor."]
      : []),
    ...(critique
      ? [
          "",
          "A previous critique of this deck follows. Let it guide which weaknesses your suggestions address:",
          critique,
          "",
        ]
      : []),
    ...(budgetUsd !== undefined
      ? [
          `The player has $${budgetUsd.toFixed(2)} to spend in total on cards they don't own (owned cards are free).`,
          "Prices are shown where known; otherwise use your knowledge of typical prices and avoid cards that would eat the whole budget.",
          "Rank the suggestions from best to worst for this deck, favoring strong cards that are cheap for what they do; the cheapest combination that fits will be chosen from your ranking.",
        ]
      : []),
    "Respond with one suggestion per line in exactly this format and nothing else:",
    "Card Name :: Short tag (e.g. Ramp, Removal, Card Draw, Synergy: <theme>) :: One-sentence reason this card was suggested for this deck.",
    "",
    `${allowUnowned ? "Available" : "Owned"} cards:`,
    names,
  ].join("\n");
}
