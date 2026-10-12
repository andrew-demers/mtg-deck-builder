import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DeckGoalError, draftDeckGoal } from "@/lib/deck-goal";
import { llmErrorResponse } from "@/lib/llm/error-response";

/**
 * POST /api/decks/[id]/goal/draft - session-scoped. Asks the LLM to draft the
 * deck's goal from its commander and cards, for the caller to edit before
 * saving. Nothing is persisted. 404 if the deck doesn't exist, 403 if it
 * belongs to a different user, 400 if the deck has no commander or no cards.
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

  try {
    const goal = await draftDeckGoal(id);
    return NextResponse.json({ goal });
  } catch (error) {
    if (error instanceof DeckGoalError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return llmErrorResponse(error);
  }
}
