import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DeckVersionError, gradeDeckVersion } from "@/lib/deck-version";
import { llmErrorResponse } from "@/lib/llm/error-response";

/**
 * POST /api/decks/[id]/versions/[versionId]/grade - session-scoped. Grades a
 * saved version against the deck's goal and stores the grade on the version
 * (replacing any earlier one). Returns the grade. 404 if the deck or version
 * doesn't exist, 403 if the deck belongs to a different user, 400 if the
 * deck has no goal or the model's answer couldn't be read.
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
    return NextResponse.json(await gradeDeckVersion(id, versionId));
  } catch (error) {
    if (error instanceof DeckVersionError) {
      const status = error.message === "Version not found" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return llmErrorResponse(error);
  }
}
