import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { suggestCards, CardSuggestionError } from "@/lib/card-suggestion";
import { llmErrorResponse } from "@/lib/llm/error-response";

interface SuggestCardsBody {
  allowUnowned?: boolean;
  budgetUsd?: number;
}

/**
 * POST /api/decks/[id]/suggest-cards - session-scoped. Asks the LLM to
 * suggest additions to a deck the caller owns from the caller's remaining
 * owned cards (not already fully used in this deck), filtered to the
 * commander's color identity, and returns each matched `Card` alongside a
 * short tag and a one-sentence reason for the suggestion. An optional JSON
 * body `{ allowUnowned: boolean }` widens the pool to the full card catalog
 * (still filtered to color identity) instead of just the caller's owned
 * cards; omitted/absent defaults to false. `budgetUsd` caps the total price
 * of suggested cards the caller doesn't own (implies allowUnowned). 404 if the deck doesn't exist,
 * 403 if it belongs to a different user, 400 if the deck has no commander
 * set.
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

  const body = (await request.json().catch(() => null)) as SuggestCardsBody | null;

  try {
    const cards = await suggestCards(id, {
      allowUnowned: body?.allowUnowned ?? true,
      budgetUsd: typeof body?.budgetUsd === "number" ? body.budgetUsd : undefined,
    });
    return NextResponse.json(cards, { status: 200 });
  } catch (error) {
    if (error instanceof CardSuggestionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return llmErrorResponse(error);
  }
}
