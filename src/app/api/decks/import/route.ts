import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseManaBoxDecklist, type ManaBoxDecklist } from "@/lib/manabox-decklist";

/**
 * POST /api/decks/import - session-scoped. Creates a new Deck from an
 * uploaded ManaBox `.txt` decklist export. Unlike `POST /api/decks`, this
 * deliberately does not check card ownership - a decklist import brings in
 * cards the caller may not own yet (see the plan's "not owned" indicator,
 * which surfaces this on the deck detail page instead of blocking import).
 *
 * 401 with no session. 400 with the parser's error message on a malformed
 * file. 400 if the decklist names more than two commanders. 400 if the
 * first commander name doesn't resolve to any card, or resolves to a card
 * that isn't commander-eligible. The second commander name (if present)
 * only needs to resolve to some card - Partner/Background legality is out
 * of scope for this import. Mainboard names that don't match any card are
 * collected into `unmatchedNames` rather than failing the import.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "A decklist file is required" }, { status: 400 });
  }

  const text = await file.text();

  let decklist: ManaBoxDecklist;

  try {
    decklist = parseManaBoxDecklist(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid decklist";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (decklist.commanderNames.length > 2) {
    return NextResponse.json(
      { error: "A decklist can have at most 2 commanders" },
      { status: 400 },
    );
  }

  const [primaryCommanderName, secondaryCommanderName] = decklist.commanderNames;

  const primaryCommanderCard = await prisma.card.findFirst({
    where: { name: { equals: primaryCommanderName, mode: "insensitive" } },
  });

  if (!primaryCommanderCard) {
    return NextResponse.json({ error: "Commander not found" }, { status: 400 });
  }

  if (!primaryCommanderCard.isCommanderEligible) {
    return NextResponse.json(
      { error: "Commander is not commander-eligible" },
      { status: 400 },
    );
  }

  const secondaryCommanderCard = secondaryCommanderName
    ? await prisma.card.findFirst({
        where: { name: { equals: secondaryCommanderName, mode: "insensitive" } },
      })
    : null;

  if (secondaryCommanderName && !secondaryCommanderCard) {
    return NextResponse.json({ error: "Commander not found" }, { status: 400 });
  }

  const unmatchedNames: string[] = [];
  const matchedMainboard: { cardId: string; quantity: number }[] = [];

  for (const { name, quantity } of decklist.cards) {
    const card = await prisma.card.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });

    if (card) {
      matchedMainboard.push({ cardId: card.id, quantity });
    } else {
      unmatchedNames.push(name);
    }
  }

  const deck = await prisma.deck.create({
    data: {
      userId,
      name: `${primaryCommanderCard.name} (Imported)`,
      commanderCardId: primaryCommanderCard.id,
    },
  });

  await prisma.deckCard.create({
    data: {
      deckId: deck.id,
      cardId: primaryCommanderCard.id,
      quantity: 1,
      isCommander: true,
    },
  });

  if (secondaryCommanderCard) {
    await prisma.deckCard.create({
      data: {
        deckId: deck.id,
        cardId: secondaryCommanderCard.id,
        quantity: 1,
        isCommander: true,
      },
    });
  }

  for (const { cardId, quantity } of matchedMainboard) {
    await prisma.deckCard.create({
      data: { deckId: deck.id, cardId, quantity, isCommander: false },
    });
  }

  const createdDeck = await prisma.deck.findUnique({
    where: { id: deck.id },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json({ ...createdDeck, unmatchedNames }, { status: 201 });
}
