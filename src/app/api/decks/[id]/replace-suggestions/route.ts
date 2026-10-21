import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { suggestReplacements, CardReplacementError } from "@/lib/card-replacement";
import { llmErrorResponse } from "@/lib/llm/error-response";

interface ReplaceSuggestionsBody {
  cardIds?: unknown;
}

/**
 * POST /api/decks/[id]/replace-suggestions - session-scoped. Takes a JSON
 * body `{ cardIds: string[] }` of cards the caller wants to add (from their
 * collection or from a Scryfall search) and asks the LLM which existing card
 * in the deck each should replace. Returns `{ add, remove, reason }` swaps;
 * nothing is changed in the deck (the client applies a swap via the existing
 * add/remove card endpoints). 404 if the deck doesn't exist, 403 if it
 * belongs to a different user, 400 for a missing or invalid selection
 * (unknown card, off-color, already in the deck) or a deck with no commander.
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

  const body = (await request.json().catch(() => null)) as ReplaceSuggestionsBody | null;

  if (
    !Array.isArray(body?.cardIds) ||
    body.cardIds.length === 0 ||
    !body.cardIds.every((cardId) => typeof cardId === "string")
  ) {
    return NextResponse.json({ error: "cardIds must be a non-empty array" }, { status: 400 });
  }

  try {
    const swaps = await suggestReplacements(id, body.cardIds as string[]);
    return NextResponse.json(swaps, { status: 200 });
  } catch (error) {
    if (error instanceof CardReplacementError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return llmErrorResponse(error);
  }
}
