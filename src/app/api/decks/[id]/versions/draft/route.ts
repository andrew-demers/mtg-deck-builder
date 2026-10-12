import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DeckVersionError, draftVersionDescription } from "@/lib/deck-version";
import { llmErrorResponse } from "@/lib/llm/error-response";

/**
 * POST /api/decks/[id]/versions/draft - session-scoped. Asks the LLM to draft
 * a description of the deck's unsaved changes since its latest version, for
 * the caller to edit before saving. Nothing is persisted. 404 if the deck
 * doesn't exist, 403 if it belongs to a different user, 400 if nothing has
 * changed.
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
    const description = await draftVersionDescription(id);
    return NextResponse.json({ description });
  } catch (error) {
    if (error instanceof DeckVersionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return llmErrorResponse(error);
  }
}
