import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isBasicLand } from "@/lib/commander-legality";

/**
 * GET /api/decks/[id]/other-deck-card-ids - session-scoped. Returns the
 * unique card IDs (basic lands excluded, since those are freely reused
 * across decks) that appear in any of the caller's *other* decks, so the UI
 * can flag a card as already committed elsewhere before it gets added here
 * too. 404 if this deck doesn't exist, 403 if it belongs to a different
 * user.
 */
export async function GET(
  _request: Request,
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

  const otherDeckCards = await prisma.deckCard.findMany({
    where: { deckId: { not: id }, deck: { userId } },
    include: { card: true },
  });

  const cardIds = Array.from(
    new Set(
      otherDeckCards.filter((deckCard) => !isBasicLand(deckCard.card)).map((deckCard) => deckCard.cardId),
    ),
  );

  return NextResponse.json(cardIds);
}
