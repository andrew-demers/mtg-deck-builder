import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/decks/[id] - session-scoped. Returns the deck with its
 * `DeckCard`s joined to `Card` (as `cards`) and the commander `Card` joined
 * in (as `commanderCard`). 404 if the deck doesn't exist, 403 if it exists
 * but belongs to a different user.
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

  const deck = await prisma.deck.findUnique({
    where: { id },
    include: {
      commanderCard: true,
      cards: { include: { card: true } },
    },
  });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(deck);
}
