import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isBasicLand, unionColorIdentity, validateColorIdentity } from "@/lib/commander-legality";
import { cardDecisionsJson, decisionsAfterAdd, parseCardDecisions } from "@/lib/deck-decisions";

interface AddDeckCardBody {
  cardId?: string;
}

/**
 * POST /api/decks/[id]/cards - session-scoped. Adds one copy of a card (owned or
 * not) to a deck the caller owns (e.g. from the card-suggestion
 * list). This is a minimal "add a single card" path, distinct from
 * `[id]/build`, which regenerates and overwrites the deck's entire card set
 * in one shot - adding here instead increments the existing `DeckCard`
 * quantity read-then-write style (following the same pattern as
 * `collection-entry.ts` and `[id]/build/route.ts`), so it composes with a
 * deck that's already built rather than replacing it.
 *
 * 404 if the deck doesn't exist, 403 if it belongs to a different user, 400
 * if the card doesn't exist, is outside the
 * deck's commander's color identity, or would violate the singleton rule
 * (a nonland card already in the deck).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const deck = await prisma.deck.findUnique({
    where: { id },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as AddDeckCardBody | null;

  if (!body?.cardId) {
    return NextResponse.json({ error: "cardId is required" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({ where: { id: body.cardId } });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 400 });
  }

  // A deck whose commander was just chosen but never built yet has no
  // DeckCard rows at all, so fall back to the single chosen commander in
  // that case rather than treating the deck as commander-less.
  const commanderDeckCards = deck.cards.filter((deckCard) => deckCard.isCommander);
  const commanders =
    commanderDeckCards.length > 0
      ? commanderDeckCards.map((deckCard) => deckCard.card)
      : deck.commanderCard
        ? [deck.commanderCard]
        : [];

  if (deck.commanderCard && !validateColorIdentity(unionColorIdentity(commanders), [card])) {
    return NextResponse.json(
      { error: "Card is outside the commander's color identity" },
      { status: 400 },
    );
  }

  const existing = await prisma.deckCard.findUnique({
    where: { deckId_cardId: { deckId: id, cardId: card.id } },
  });

  if (existing) {
    if (!isBasicLand(card)) {
      return NextResponse.json(
        { error: "This card is already in the deck" },
        { status: 400 },
      );
    }

    await prisma.deckCard.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + 1 },
    });
  } else {
    await prisma.deckCard.create({
      data: { deckId: id, cardId: card.id, quantity: 1, isCommander: false },
    });

    // Remember nonbasic adds so the next cut pass does not turn around and cut them.
    if (!isBasicLand(card)) {
      await prisma.deck.update({
        where: { id },
        data: {
          cardDecisions: cardDecisionsJson(
            decisionsAfterAdd(parseCardDecisions(deck.cardDecisions), {
              id: card.id,
              name: card.name,
            }),
          ),
        },
      });
    }
  }

  const updatedDeck = await prisma.deck.findUnique({
    where: { id },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json(updatedDeck, { status: 200 });
}
