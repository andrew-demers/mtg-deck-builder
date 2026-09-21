import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isBasicLand } from "@/lib/commander-legality";

/**
 * GET /api/decks/card-ids-in-use - session-scoped. Returns the unique card
 * IDs (basic lands excluded, since those are freely reused across decks)
 * that appear in any of the caller's decks, so the UI can flag a card as
 * already committed elsewhere before a deck (and thus an `[id]` to exclude
 * via other-deck-card-ids) even exists yet - e.g. the wizard's
 * commander-choice step.
 */
export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deckCards = await prisma.deckCard.findMany({
    where: { deck: { userId } },
    include: { card: true },
  });

  const cardIds = Array.from(
    new Set(deckCards.filter((deckCard) => !isBasicLand(deckCard.card)).map((deckCard) => deckCard.cardId)),
  );

  return NextResponse.json(cardIds);
}
