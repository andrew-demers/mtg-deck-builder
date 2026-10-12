import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DeckVersionError, restoreDeckVersion } from "@/lib/deck-version";

/**
 * POST /api/decks/[id]/versions/[versionId]/restore - session-scoped. Makes
 * the deck match a saved version (cards and commander) and records that as a
 * new version, so history is never rewritten. Returns the updated deck. 404
 * if the deck or version doesn't exist, 403 if the deck belongs to a
 * different user, 400 if the deck already matches that version.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, versionId } = await params;

  const deck = await prisma.deck.findUnique({ where: { id } });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await restoreDeckVersion(id, versionId);
  } catch (error) {
    if (error instanceof DeckVersionError) {
      const status = error.message === "Version not found" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }

  const updatedDeck = await prisma.deck.findUnique({
    where: { id },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json(updatedDeck);
}
