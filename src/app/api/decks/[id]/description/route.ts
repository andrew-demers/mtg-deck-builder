import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { describeDeck, DeckDescriptionError } from "@/lib/deck-description";

/**
 * POST /api/decks/[id]/description - session-scoped. Asks the LLM to
 * describe a deck the caller owns (win condition, game plan) and persists
 * the result onto `Deck.description`. 404 if the deck doesn't exist, 403 if
 * it belongs to a different user, 400 if the deck isn't fully built yet
 * (total `DeckCard` quantity must be exactly 100).
 */
export async function POST(
  _request: Request,
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
    include: { cards: true },
  });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const totalQuantity = deck.cards.reduce((sum, deckCard) => sum + deckCard.quantity, 0);

  if (totalQuantity !== 100) {
    return NextResponse.json(
      { error: "Deck must be fully built (100 cards) before requesting a description" },
      { status: 400 },
    );
  }

  let description: string;
  try {
    description = await describeDeck(id);
  } catch (error) {
    if (error instanceof DeckDescriptionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const updatedDeck = await prisma.deck.update({
    where: { id },
    data: { description },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json(updatedDeck, { status: 200 });
}
