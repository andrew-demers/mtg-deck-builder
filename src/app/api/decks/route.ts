import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

interface CreateDeckBody {
  name?: string;
  commanderCardId?: string;
}

/**
 * GET /api/decks - session-scoped. Returns the caller's decks with their
 * commander Card (if any) joined in as `commanderCard`.
 */
export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decks = await prisma.deck.findMany({
    where: { userId },
    include: { commanderCard: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(decks);
}

/**
 * POST /api/decks - session-scoped. Creates a Deck around a chosen
 * commander. The commander card must be commander-eligible and must be a
 * card the caller owns (has a `CollectionEntry` for) - both checked here
 * rather than trusted from the request body.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CreateDeckBody | null;

  if (!body?.name || !body?.commanderCardId) {
    return NextResponse.json(
      { error: "name and commanderCardId are required" },
      { status: 400 },
    );
  }

  const commanderCard = await prisma.card.findUnique({
    where: { id: body.commanderCardId },
  });

  if (!commanderCard) {
    return NextResponse.json({ error: "Card not found" }, { status: 400 });
  }

  if (!commanderCard.isCommanderEligible) {
    return NextResponse.json(
      { error: "Card is not commander-eligible" },
      { status: 400 },
    );
  }

  const ownedEntry = await prisma.collectionEntry.findFirst({
    where: { userId, cardId: commanderCard.id },
  });

  if (!ownedEntry) {
    return NextResponse.json({ error: "You do not own this card" }, { status: 400 });
  }

  const deck = await prisma.deck.create({
    data: {
      userId,
      name: body.name,
      commanderCardId: commanderCard.id,
    },
  });

  return NextResponse.json(deck, { status: 201 });
}
