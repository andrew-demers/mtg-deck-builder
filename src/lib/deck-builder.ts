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

export interface BuildDeckOptions {
  /**
   * When true, the LLM's pool is widened from the user's owned collection to
   * every catalog card within the commander's color identity, so it may pick
   * strong cards the user doesn't yet own (surfaced to the user as "not
   * owned" elsewhere). Defaults to false - owned cards only.
   */
  allowUnowned?: boolean;
}

/**
 * Builds a full 100-card Commander deck around a deck's already-chosen
 * commander, picking the other 99 cards via the configured LLM provider -
 * from the user's owned collection by default, or from the full card catalog
 * (filtered to the commander's color identity) when `allowUnowned` is set.
 *
 * The LLM's picks are never trusted directly: each returned name is matched
 * case-insensitively against the offered pool, and every match is
 * re-checked against color identity and singleton before being accepted.
 * Anything hallucinated, off-color, or a repeat of a nonland card already
 * picked is dropped silently rather than surfaced as an error, since the
 * backfill step below exists precisely to make up for a shortfall.
 */
export async function buildDeck(
  deckId: string,
  options: BuildDeckOptions = {},
): Promise<BuildDeckResult> {
  const allowUnowned = options.allowUnowned ?? false;

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
  const colorIdentity = unionColorIdentity(commanders);

  const entries = await prisma.collectionEntry.findMany({
    where: { userId: deck.userId },
    include: { card: true },
  });

  // The commander already occupies its own slot, so it's excluded from the
  // pool offered to the LLM (and from anything matched back against it).
  const ownedPool = entries.map((entry) => entry.card).filter((card) => card.id !== commander.id);

  const pool = allowUnowned
    ? dedupeById([...ownedPool, ...(await findCatalogCardsInColorIdentity(colorIdentity, commander.id))])
    : ownedPool;

  const completion = await getLlmProvider().complete(buildPrompt(commanders, pool, allowUnowned));
  const pickedNames = parsePickedNames(completion);

  const cardsByName = new Map(pool.map((card) => [normalize(card.name), card]));

  const accepted = new Map<string, number>();

  for (const name of pickedNames) {
    if (sumQuantities(accepted) >= NON_COMMANDER_DECK_SIZE) {
      break;
    }

    const card = cardsByName.get(normalize(name));
    if (!card) {
      continue; // hallucinated or not owned
    }

    if (!validateColorIdentity(colorIdentity, [card])) {
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
    // Prefer basics whose own color identity is one of the commander's
    // colors (Plains/Island/Swamp/Mountain/Forest) over Wastes - Wastes has
    // an empty color identity, which passes validateColorIdentity for *any*
    // commander, so it must not be treated as interchangeable with a
    // properly colored basic. Only a truly colorless commander falls
    // through to Wastes (or any other in-identity basic the user owns).
    const ownedColoredBasics = dedupeById(
      ownedPool.filter(
        (card) =>
          isBasicLand(card) && card.colorIdentity.length === 1 && colorIdentity.includes(card.colorIdentity[0]),
      ),
    );
    const ownedBasicLands = dedupeById(
      ownedPool.filter((card) => isBasicLand(card) && validateColorIdentity(colorIdentity, [card])),
    );

    // Spread the shortfall evenly across every eligible basic land type
    // rather than dumping it all on a single one, so the mana base actually
    // reflects the commander's color identity. If the user owns none at all
    // and unowned cards aren't allowed, there's nothing legal left to pad
    // the deck with, so this fails loudly rather than silently shipping a
    // short (or illegal) deck. When unowned cards are allowed, fall back to
    // one basic land per color from the catalog before giving up.
    const backfillLands =
      ownedColoredBasics.length > 0
        ? ownedColoredBasics
        : ownedBasicLands.length > 0
          ? ownedBasicLands
          : allowUnowned
            ? await findCatalogBasicLands(colorIdentity)
            : [];

    if (backfillLands.length === 0) {
      throw new DeckBuildError(
        "Could not reach 99 legal cards and the user owns no basic lands to backfill with.",
      );
    }

    for (let i = 0; i < shortfall; i++) {
      const land = backfillLands[i % backfillLands.length];
      accepted.set(land.id, (accepted.get(land.id) ?? 0) + 1);
    }
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
function disallowedColors(colorIdentity: string[]): string[] {
  const allColors = ["W", "U", "B", "R", "G"];
  return allColors.filter((color) => !colorIdentity.includes(color));
}

async function findCatalogCardsInColorIdentity(
  colorIdentity: string[],
  excludeId: string,
): Promise<Card[]> {
  const disallowed = disallowedColors(colorIdentity);

  return prisma.card.findMany({
    where: {
      id: { not: excludeId },
      ...(disallowed.length > 0 ? { NOT: { colorIdentity: { hasSome: disallowed } } } : {}),
    },
  });
}

/**
 * Finds one basic land per color in the commander's color identity (e.g.
 * Plains for W, Island for U), or Wastes for a truly colorless commander.
 */
async function findCatalogBasicLands(colorIdentity: string[]): Promise<Card[]> {
  if (colorIdentity.length === 0) {
    const wastes = await prisma.card.findFirst({
      where: { type: { contains: "Basic Land" }, colorIdentity: { equals: [] } },
    });
    return wastes ? [wastes] : [];
  }

  const lands = await Promise.all(
    colorIdentity.map((color) =>
      prisma.card.findFirst({
        where: { type: { contains: "Basic Land" }, colorIdentity: { equals: [color] } },
      }),
    ),
  );

  return lands.filter((land): land is Card => land !== null);
}

function buildPrompt(commanders: Card[], pool: Card[], allowUnowned: boolean): string {
  const names = pool.map((card) => `- ${card.name}`).join("\n");
  const commanderNames = commanders.map((commander) => commander.name).join(" + ");
  const colorIdentity = unionColorIdentity(commanders);
  const poolDescription = allowUnowned
    ? "the following list of cards, some of which the player owns and some of which they don't"
    : "the following list of cards the player owns";

  return [
    "You are building a Magic: The Gathering Commander/EDH deck.",
    `Commander: ${commanderNames} (color identity: ${colorIdentity.join("") || "colorless"})`,
    "",
    `Pick exactly 99 more cards for this deck from ${poolDescription}.`,
    "Every card must be within the commander's color identity, and every nonland card may appear at most once (singleton). Basic lands may repeat.",
    "Respond with one card name per line and nothing else.",
    "",
    `${allowUnowned ? "Available" : "Owned"} cards:`,
    names,
  ].join("\n");
}
