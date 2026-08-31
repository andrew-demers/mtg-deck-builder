/**
 * Determines whether a card is eligible to be used as a Commander.
 *
 * A card is commander-eligible if it is a legendary creature, or if its
 * oracle text explicitly grants commander eligibility (e.g. "Spell
 * commander (This card can be your commander. ...)").
 */
export function isCommanderEligible(card: {
  type: string;
  oracleText?: string | null;
}): boolean {
  if (card.type.includes("Legendary Creature")) {
    return true;
  }

  return /can be your commander/i.test(card.oracleText ?? "");
}
