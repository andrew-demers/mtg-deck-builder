import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshCardPrices } from "@/lib/card-prices";

/**
 * POST /api/decks/[id]/prices - session-scoped. Refreshes Scryfall prices and
 * images for every card in the deck (always forced, since the user asked).
 * Returns `{ updated }`. 502 if Scryfall can't be reached. 404 if the deck
 * doesn't exist, 403 if it belongs to a different user.
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
    include: { cards: { select: { cardId: true } } },
  });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cardIds = deck.cards.map((deckCard) => deckCard.cardId);
  if (deck.commanderCardId) {
    cardIds.push(deck.commanderCardId);
  }

  try {
    const updated = await refreshCardPrices([...new Set(cardIds)], { force: true });
    return NextResponse.json({ updated });
  } catch {
    return NextResponse.json({ error: "Could not reach Scryfall" }, { status: 502 });
  }
}
