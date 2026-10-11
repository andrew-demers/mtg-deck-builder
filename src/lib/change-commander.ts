import { prisma } from "@/lib/prisma";
import { unionColorIdentity, validateColorIdentity } from "@/lib/commander-legality";

export class ChangeCommanderError extends Error {}

export type ChangeCommanderResult =
  /** Nothing changed: these cards fall outside the new commander's colors. */
  | { status: "conflicts"; conflicts: string[] }
  | { status: "changed"; removed: string[] };

/**
 * Replaces one of a deck's commanders (`fromCardId`) with `toCardId`. The old
 * commander leaves the deck. For a partner deck the other commander stays and
 * the color identity is the union of both. If `toCardId` was already a
 * regular card in the deck it's promoted rather than duplicated.
 *
 * A new commander can have a narrower color identity than the old one, which
 * would leave illegal cards in the deck. Unless `removeOffIdentity` is set,
 * that case changes nothing and returns the offending card names so the
 * caller can confirm; with it set, those cards are removed. If the replaced
 * commander was the active one, the new one becomes active. A deck that was
 * never built has no card rows, so only `commanderCardId` changes.
 */
export async function changeCommander(
  deckId: string,
  fromCardId: string,
  toCardId: string,
  removeOffIdentity = false,
): Promise<ChangeCommanderResult> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new ChangeCommanderError("Deck not found");
  }

  const to = await prisma.card.findUnique({ where: { id: toCardId } });
  if (!to) {
    throw new ChangeCommanderError("New commander not found");
  }
  if (!to.isCommanderEligible) {
    throw new ChangeCommanderError("That card can't be a commander");
  }
  if (fromCardId === toCardId) {
    throw new ChangeCommanderError("That card is already a commander of this deck");
  }

  const commanderRows = deck.cards.filter((deckCard) => deckCard.isCommander);
  const fromRow = commanderRows.find((deckCard) => deckCard.cardId === fromCardId);
  const isUnbuilt = commanderRows.length === 0;

  if (isUnbuilt ? deck.commanderCardId !== fromCardId : !fromRow) {
    throw new ChangeCommanderError("The commander being replaced isn't in this deck");
  }
  if (commanderRows.some((deckCard) => deckCard.cardId === toCardId)) {
    throw new ChangeCommanderError("That card is already a commander of this deck");
  }

  const nextActiveId = deck.commanderCardId === fromCardId ? toCardId : deck.commanderCardId;

  if (isUnbuilt) {
    await prisma.deck.update({ where: { id: deckId }, data: { commanderCardId: toCardId } });
    return { status: "changed", removed: [] };
  }

  const identity = unionColorIdentity([
    ...commanderRows.filter((deckCard) => deckCard.cardId !== fromCardId).map((deckCard) => deckCard.card),
    to,
  ]);
  const conflicts = deck.cards.filter(
    (deckCard) =>
      !deckCard.isCommander && deckCard.cardId !== toCardId && !validateColorIdentity(identity, [deckCard.card]),
  );

  if (conflicts.length > 0 && !removeOffIdentity) {
    return { status: "conflicts", conflicts: conflicts.map((deckCard) => deckCard.card.name) };
  }

  const removeIds = [
    fromRow!.id,
    ...conflicts.map((deckCard) => deckCard.id),
    ...deck.cards.filter((deckCard) => deckCard.cardId === toCardId).map((deckCard) => deckCard.id),
  ];

  await prisma.$transaction([
    prisma.deckCard.deleteMany({ where: { id: { in: removeIds } } }),
    prisma.deckCard.create({ data: { deckId, cardId: toCardId, quantity: 1, isCommander: true } }),
    prisma.deck.update({ where: { id: deckId }, data: { commanderCardId: nextActiveId } }),
  ]);

  return { status: "changed", removed: conflicts.map((deckCard) => deckCard.card.name) };
}
