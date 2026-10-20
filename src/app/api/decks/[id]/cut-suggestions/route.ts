import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { suggestCuts, CardCutError } from "@/lib/card-cuts";
import { llmErrorResponse } from "@/lib/llm/error-response";

/**
 * POST /api/decks/[id]/cut-suggestions - session-scoped. For a deck over 100
 * cards, asks the LLM which cards to cut to get back to 100. Returns
 * `{ card, reason }` suggestions; nothing is changed in the deck (the client
 * removes a card via the existing remove endpoint). 404 if the deck doesn't
 * exist, 403 if it belongs to a different user, 400 if the deck has no
 * commander or isn't over 100 cards.
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
    return NextResponse.json(await suggestCuts(id), { status: 200 });
  } catch (error) {
    if (error instanceof CardCutError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return llmErrorResponse(error);
  }
}
