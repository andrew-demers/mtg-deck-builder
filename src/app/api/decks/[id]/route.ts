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

interface UpdateDeckBody {
  name?: string;
  goal?: string;
}

/**
 * PATCH /api/decks/[id] - session-scoped. Renames the deck and/or sets the
 * `goal` its versions are graded against (a blank goal clears it). 404 if
 * the deck doesn't exist, 403 if it belongs to a different user, 400 if
 * neither field is given or `name` is blank.
 */
export async function PATCH(
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

  const body = (await request.json().catch(() => null)) as UpdateDeckBody | null;
  const data: { name?: string; goal?: string | null } = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    data.name = name;
  }

  if (body?.goal !== undefined) {
    if (typeof body.goal !== "string") {
      return NextResponse.json({ error: "goal must be a string" }, { status: 400 });
    }
    data.goal = body.goal.trim() || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const updatedDeck = await prisma.deck.update({
    where: { id },
    data,
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json(updatedDeck);
}

/**
 * DELETE /api/decks/[id] - session-scoped. Deletes the deck, its DeckCards,
 * and its saved versions (the foreign keys are ON DELETE RESTRICT, so
 * children must be removed first). 404 if the deck doesn't exist, 403 if it
 * belongs to a different user.
 */
export async function DELETE(
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

  await prisma.$transaction([
    prisma.deckVersionCard.deleteMany({ where: { version: { deckId: id } } }),
    prisma.deckVersion.deleteMany({ where: { deckId: id } }),
    prisma.deckCard.deleteMany({ where: { deckId: id } }),
    prisma.deck.delete({ where: { id } }),
  ]);

  return new NextResponse(null, { status: 204 });
}
