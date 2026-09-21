import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildDeck, DeckBuildError } from "@/lib/deck-builder";

interface BuildDeckBody {
  allowUnowned?: boolean;
}

/**
 * POST /api/decks/[id]/build - session-scoped. Builds the full 100-card deck
 * (commander + LLM-picked/backfilled cards) for a deck the caller owns and
 * persists it as `DeckCard` rows. The deck must already have a commander
 * set. An optional JSON body `{ allowUnowned: boolean }` widens the LLM's
 * pool to the full card catalog (still filtered to color identity) instead
 * of just the caller's owned cards; omitted/absent defaults to false. 404 if
 * the deck doesn't exist, 403 if it belongs to a different user, 400 if it
 * has no commander or if the build itself can't reach a legal 100 cards
 * (e.g. no basic lands to backfill with).
 *
 * `DeckCard` rows are upserted following collection-entry.ts's
 * read-then-write pattern: read any existing row for (deckId, cardId) and
 * update its quantity/isCommander, or create a new row - rather than a
 * single upsert. Any existing row for a card that isn't in the new result
 * is deleted first, so a re-run (e.g. after the collection changes, or after
 * a bad build) fully replaces the deck's cards rather than leaving stale
 * ones (like a backfilled off-color basic land) behind alongside the new
 * picks.
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

  if (!deck.commanderCardId) {
    return NextResponse.json({ error: "Deck has no commander set" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as BuildDeckBody | null;

  let result;
  try {
    result = await buildDeck(id, { allowUnowned: body?.allowUnowned ?? false });
  } catch (error) {
    if (error instanceof DeckBuildError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await prisma.deckCard.deleteMany({
    where: { deckId: id, cardId: { notIn: result.cards.map((card) => card.cardId) } },
  });

  for (const card of result.cards) {
    const existing = await prisma.deckCard.findUnique({
      where: { deckId_cardId: { deckId: id, cardId: card.cardId } },
    });

    if (existing) {
      await prisma.deckCard.update({
        where: { id: existing.id },
        data: { quantity: card.quantity, isCommander: card.isCommander },
      });
    } else {
      await prisma.deckCard.create({
        data: {
          deckId: id,
          cardId: card.cardId,
          quantity: card.quantity,
          isCommander: card.isCommander,
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
