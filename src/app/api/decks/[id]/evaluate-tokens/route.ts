import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { evaluateTokens, TokenEvaluationError } from "@/lib/token-evaluation";

/**
 * POST /api/decks/[id]/evaluate-tokens - session-scoped. Asks the LLM to go
 * through every card in a deck the caller owns and recommend how many of each
 * token and counter type to have on hand. Returns the list of
 * `{ kind, name, quantity, cards, reason }` recommendations without
 * persisting them. 404 if the deck doesn't exist, 403 if it belongs to a
 * different user, 400 if the deck has no commander set.
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
    return NextResponse.json(await evaluateTokens(id), { status: 200 });
  } catch (error) {
    if (error instanceof TokenEvaluationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
