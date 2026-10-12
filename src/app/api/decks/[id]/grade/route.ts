import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { DeckVersionError, gradeCurrentDeck } from "@/lib/deck-version";
import { llmErrorResponse } from "@/lib/llm/error-response";

/**
 * POST /api/decks/[id]/grade - session-scoped. Grades the deck as it is now,
 * saved as a version or not, against its goal and stores the grade on the
 * deck (the same columns the critique uses). Returns the updated deck. 404 if
 * the deck doesn't exist, 403 if it belongs to a different user, 400 if the
 * deck has no goal or no cards, or the model's answer couldn't be read.
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

  let grade: Awaited<ReturnType<typeof gradeCurrentDeck>>;
  try {
    grade = await gradeCurrentDeck(id);
  } catch (error) {
    if (error instanceof DeckVersionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return llmErrorResponse(error);
  }

  const updatedDeck = await prisma.deck.update({
    where: { id },
    data: {
      gradeScore: grade.score,
      gradeGoal: grade.goal,
      gradeBreakdown: grade.breakdown as unknown as Prisma.InputJsonValue,
      gradeSummary: grade.summary,
      gradeSignature: grade.signature,
    },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  return NextResponse.json(updatedDeck);
}
