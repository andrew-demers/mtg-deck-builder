import { isBasicLand } from "@/lib/commander-legality";

interface BuyDeckCard {
  cardId: string;
  quantity: number;
  card: { name: string; type: string };
}

export interface BuyListLine {
  name: string;
  quantity: number;
}

// Mass Entry reads the whole list from the query string; past this length
// browsers and proxies start truncating or rejecting the URL.
const MAX_URL_LENGTH = 7000;

/** Deck cards the player doesn't own. Basic lands are skipped, they aren't worth shipping. */
export function buildBuyList(deckCards: BuyDeckCard[], ownedCardIds: Set<string>): BuyListLine[] {
  return deckCards
    .filter((deckCard) => !ownedCardIds.has(deckCard.cardId) && !isBasicLand(deckCard.card))
    .map((deckCard) => ({ name: deckCard.card.name, quantity: deckCard.quantity }));
}

/** One "qty name" line per card, the format Mass Entry accepts when pasted. */
export function formatBuyListText(lines: BuyListLine[]): string {
  return lines.map((line) => `${line.quantity} ${line.name}`).join("\n");
}

/**
 * Link to TCGplayer's Mass Entry page prefilled with the list, or null when
 * the list is empty or too long for a URL (callers fall back to copying).
 */
export function buildMassEntryUrl(lines: BuyListLine[]): string | null {
  if (lines.length === 0) {
    return null;
  }

  const list = lines.map((line) => `${line.quantity} ${line.name}`).join("||");
  const url = `https://www.tcgplayer.com/massentry?productline=Magic&c=${encodeURIComponent(list)}`;
  return url.length <= MAX_URL_LENGTH ? url : null;
}
