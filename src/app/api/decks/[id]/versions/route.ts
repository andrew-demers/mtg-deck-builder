import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DeckVersionError, listDeckVersions, saveDeckVersion } from "@/lib/deck-version";
import { llmErrorResponse } from "@/lib/llm/error-response";

/**
 * GET /api/decks/[id]/versions - session-scoped. Returns the deck's saved
 * versions newest first, each with a diff against the version before it.
 * 404 if the deck doesn't exist, 403 if it belongs to a different user.
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

  const deck = await prisma.deck.findUnique({ where: { id } });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(await listDeckVersions(id));
}

interface SaveVersionBody {
  description?: string;
}

/**
 * POST /api/decks/[id]/versions - session-scoped. Saves the deck's current
 * cards and commander as its next version, with the caller's `description`
 * of what changed. 404 if the deck doesn't exist, 403 if it belongs to a
 * different user, 400 if the description is missing, the deck has no cards,
 * or nothing changed since the latest version.
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

  const body = (await request.json().catch(() => null)) as SaveVersionBody | null;

  if (typeof body?.description !== "string" || !body.description.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  try {
    const version = await saveDeckVersion(id, body.description);
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    if (error instanceof DeckVersionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return llmErrorResponse(error);
  }
}
