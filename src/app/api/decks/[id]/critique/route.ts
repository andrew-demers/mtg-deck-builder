import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { critiqueAndGradeDeck, DeckCritiqueError } from "@/lib/deck-critique";

/**
 * POST /api/decks/[id]/critique - session-scoped. Asks the LLM to critique a
 * deck the caller owns and persists the result onto `Deck.critique`. When the deck has a goal the
 * same call also grades it, and the grade is stored on the deck too. 404 if
 * the deck doesn't exist, 403 if it belongs to a different user, 400 if the
 * deck isn't fully built yet (total `DeckCard` quantity must be exactly 100).
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
      { error: "Deck must be fully built (100 cards) before requesting a critique" },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof critiqueAndGradeDeck>>;
  try {
    result = await critiqueAndGradeDeck(id);
  } catch (error) {
    if (error instanceof DeckCritiqueError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const updatedDeck = await prisma.deck.update({
    where: { id },
    data: {
      critique: result.critique,
      // Always overwritten so a no-goal or unreadable result never leaves an
      // older grade sitting next to a newer critique.
      gradeScore: result.grade?.score ?? null,
      gradeGoal: result.grade?.goal ?? null,
      gradeBreakdown: result.grade
        ? (result.grade.breakdown as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      gradeSummary: result.grade?.summary ?? null,
      gradeSignature: result.grade?.signature ?? null,
    },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json(updatedDeck, { status: 200 });
}
