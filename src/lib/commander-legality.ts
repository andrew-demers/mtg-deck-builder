const REQUIRED_DECK_SIZE = 100;

export interface SingletonCheckCard {
  cardId: string;
  quantity: number;
  isBasicLand: boolean;
}

export interface ColorIdentityCheckCard {
  colorIdentity: string[];
}

export interface DeckSizeCheckCard {
  quantity: number;
}

export interface DeckValidationCard {
  cardId: string;
  quantity: number;
  colorIdentity: string[];
  type: string;
}

export interface ValidateDeckInput {
  commanderColorIdentity: string[];
  cards: DeckValidationCard[];
}

export interface ValidateDeckResult {
  valid: boolean;
  errors: string[];
}

/**
 * Determines whether a card counts as a "basic land" for singleton purposes.
 *
 * Basic lands are exempt from the Commander singleton rule (unlimited
 * copies allowed), unlike every other card in the deck.
 */
export function isBasicLand(card: { type: string }): boolean {
  return card.type.includes("Basic Land");
}

/**
 * Enforces the Commander singleton rule: at most one copy of any nonland
 * card. Basic lands are exempt and may appear in any quantity.
 */
export function validateSingleton(cards: SingletonCheckCard[]): boolean {
  return cards.every((card) => card.isBasicLand || card.quantity <= 1);
}

/**
 * Enforces the Commander color-identity rule: every card's color identity
 * must be a subset of the commander's color identity.
 */
export function validateColorIdentity(
  commanderColorIdentity: string[],
  cards: ColorIdentityCheckCard[],
): boolean {
  const allowedColors = new Set(commanderColorIdentity);

  return cards.every((card) =>
    card.colorIdentity.every((color) => allowedColors.has(color)),
  );
}

/**
 * Combines every commander's color identity into one set, so a
 * partner/background pair (two `isCommander: true` DeckCard rows) restricts
 * the deck no more narrowly than either commander alone would - a single
 * commander's identity passed through here is returned unchanged.
 */
export function unionColorIdentity(commanders: { colorIdentity: string[] }[]): string[] {
  const colors = new Set<string>();

  for (const commander of commanders) {
    for (const color of commander.colorIdentity) {
      colors.add(color);
    }
  }

  return Array.from(colors);
}

/**
 * Enforces the Commander deck size rule: the deck (including the
 * commander) must total exactly 100 cards.
 */
export function validateDeckSize(cards: DeckSizeCheckCard[]): boolean {
  const total = cards.reduce((sum, card) => sum + card.quantity, 0);
  return total === REQUIRED_DECK_SIZE;
}

/**
 * Runs the full Commander legality check (singleton, color identity, deck
 * size) against a deck's cards, returning a combined result with one error
 * message per failing rule rather than just the first failure.
 */
export function validateDeck(input: ValidateDeckInput): ValidateDeckResult {
  const { commanderColorIdentity, cards } = input;
  const errors: string[] = [];

  const singletonCards: SingletonCheckCard[] = cards.map((card) => ({
    cardId: card.cardId,
    quantity: card.quantity,
    isBasicLand: isBasicLand(card),
  }));

  if (!validateSingleton(singletonCards)) {
    errors.push("Deck contains more than one copy of a nonland card.");
  }

  if (!validateColorIdentity(commanderColorIdentity, cards)) {
    errors.push("Deck contains a card outside the commander's color identity.");
  }

  if (!validateDeckSize(cards)) {
    const total = cards.reduce((sum, card) => sum + card.quantity, 0);
    errors.push(`Deck must contain exactly ${REQUIRED_DECK_SIZE} cards, found ${total}.`);
  }

  return { valid: errors.length === 0, errors };
}
