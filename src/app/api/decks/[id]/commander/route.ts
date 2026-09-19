import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

interface SetCommanderBody {
  cardId?: string;
}

/**
 * POST /api/decks/[id]/commander - session-scoped. Switches which of a
 * deck's `isCommander: true` DeckCard rows is the *active* commander
 * (`Deck.commanderCardId`) - the only way a two-commander (partner) deck's
 * active commander changes, since `commanderCardId` otherwise keeps its
 * existing single-FK meaning everywhere else in the app.
 *
 * 404 if the deck doesn't exist, 403 if it belongs to a different user, 400
 * if the body has no `cardId`, 404 if there's no `DeckCard` for this card in
 * this deck, 400 if that `DeckCard` isn't a commander row.
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

  const deck = await prisma.deck.findUnique({ where: { id } });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as SetCommanderBody | null;

  if (!body?.cardId) {
    return NextResponse.json({ error: "cardId is required" }, { status: 400 });
  }

  const deckCard = await prisma.deckCard.findUnique({
    where: { deckId_cardId: { deckId: id, cardId: body.cardId } },
  });

  if (!deckCard) {
    return NextResponse.json({ error: "Card not found in deck" }, { status: 404 });
  }

  if (!deckCard.isCommander) {
    return NextResponse.json(
      { error: "Card is not a commander for this deck" },
      { status: 400 },
    );
  }

  await prisma.deck.update({
    where: { id },
    data: { commanderCardId: body.cardId },
  });

  const updatedDeck = await prisma.deck.findUnique({
    where: { id },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json(updatedDeck, { status: 200 });
}
