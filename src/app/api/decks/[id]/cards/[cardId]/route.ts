import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isBasicLand } from "@/lib/commander-legality";
import { cardDecisionsJson, decisionsAfterCut, parseCardDecisions } from "@/lib/deck-decisions";

interface UpdateDeckCardBody {
  quantity?: number;
}

/**
 * DELETE /api/decks/[id]/cards/[cardId] - session-scoped. Removes a
 * non-commander card from a deck the caller owns. 404 if the deck doesn't
 * exist or has no `DeckCard` row for this card, 403 if the deck belongs to a
 * different user, 400 if the matched `DeckCard` is the commander (removing
 * the commander is a "start a new deck" operation, not an edit).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; cardId: string }> },
): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, cardId } = await params;

  const deck = await prisma.deck.findUnique({ where: { id } });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deckCard = await prisma.deckCard.findUnique({
    where: { deckId_cardId: { deckId: id, cardId } },
    include: { card: true },
  });

  if (!deckCard) {
    return NextResponse.json({ error: "Card not found in deck" }, { status: 404 });
  }

  if (deckCard.isCommander) {
    return NextResponse.json({ error: "Cannot remove the deck's commander" }, { status: 400 });
  }

  await prisma.deckCard.delete({ where: { id: deckCard.id } });

  // Remember nonbasic cuts so the next suggestion pass does not add them back.
  if (!isBasicLand(deckCard.card)) {
    await prisma.deck.update({
      where: { id },
      data: {
        cardDecisions: cardDecisionsJson(
          decisionsAfterCut(parseCardDecisions(deck.cardDecisions), {
            id: cardId,
            name: deckCard.card.name,
          }),
        ),
      },
    });
  }

  const updatedDeck = await prisma.deck.findUnique({
    where: { id },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json(updatedDeck, { status: 200 });
}

/**
 * PATCH /api/decks/[id]/cards/[cardId] - session-scoped. Sets a basic
 * land's `DeckCard.quantity` in a deck the caller owns (nonland quantity is
 * fixed at 1 by the singleton rule and isn't editable this way). Same
 * 401/403/404 checks as DELETE, plus 400 if the matched card isn't a basic
 * land, or if `quantity` is missing, not an integer, or less than 1.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; cardId: string }> },
): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, cardId } = await params;

  const deck = await prisma.deck.findUnique({ where: { id } });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deckCard = await prisma.deckCard.findUnique({
    where: { deckId_cardId: { deckId: id, cardId } },
    include: { card: true },
  });

  if (!deckCard) {
    return NextResponse.json({ error: "Card not found in deck" }, { status: 404 });
  }

  if (!isBasicLand(deckCard.card)) {
    return NextResponse.json(
      { error: "Only a basic land's quantity can be adjusted" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as UpdateDeckCardBody | null;

  if (!body || typeof body.quantity !== "number" || !Number.isInteger(body.quantity) || body.quantity < 1) {
    return NextResponse.json(
      { error: "quantity must be an integer of at least 1" },
      { status: 400 },
    );
  }

  await prisma.deckCard.update({
    where: { id: deckCard.id },
    data: { quantity: body.quantity },
  });

  const updatedDeck = await prisma.deck.findUnique({
    where: { id },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json(updatedDeck, { status: 200 });
}
