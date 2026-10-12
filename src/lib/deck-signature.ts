/**
 * A short fingerprint of a deck's cards and commander, so a stored grade can
 * be recognised as stale once the deck changes. Order-independent; safe to
 * compute on the client and the server alike.
 */
export function deckSignature(
  commanderCardId: string | null,
  cards: { cardId: string; quantity: number; isCommander: boolean }[],
): string {
  const text = [
    commanderCardId ?? "",
    ...cards.map((card) => `${card.cardId}:${card.quantity}:${card.isCommander ? 1 : 0}`).sort(),
  ].join("|");

  // FNV-1a, 32 bit: plenty for spotting edits to one deck.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
