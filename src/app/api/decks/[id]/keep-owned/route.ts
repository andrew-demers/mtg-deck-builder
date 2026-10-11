import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { keepOnlyOwnedCards } from "@/lib/keep-owned-cards";

/**
 * POST /api/decks/[id]/keep-owned - session-scoped. Removes every card the
 * caller doesn't own, and every card already in another of their decks, from
 * this deck (commanders and basic lands are kept). Returns the removed cards
 * as `{ removed: [{ cardId, name, reason }] }`. 404 if the deck doesn't
 * exist, 403 if it belongs to a different user.
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

  const deck = await prisma.deck.findUnique({ where: { id } });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const removed = await keepOnlyOwnedCards(id);
  return NextResponse.json({ removed }, { status: 200 });
}
