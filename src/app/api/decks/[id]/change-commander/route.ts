import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { changeCommander, ChangeCommanderError } from "@/lib/change-commander";

interface ChangeCommanderBody {
  fromCardId?: string;
  toCardId?: string;
  removeOffIdentity?: boolean;
}

/**
 * POST /api/decks/[id]/change-commander - session-scoped. Body
 * `{ fromCardId, toCardId, removeOffIdentity? }` replaces one of the deck's
 * commanders with another card. Responds 200 with the updated deck. If the
 * new commander's colors exclude cards already in the deck and
 * `removeOffIdentity` isn't set, responds 409 `{ conflicts: string[] }`
 * without changing anything. 404 if the deck doesn't exist, 403 if it
 * belongs to a different user, 400 for a missing id or an invalid change.
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

  const body = (await request.json().catch(() => null)) as ChangeCommanderBody | null;

  if (!body?.fromCardId || !body.toCardId) {
    return NextResponse.json({ error: "fromCardId and toCardId are required" }, { status: 400 });
  }

  try {
    const result = await changeCommander(id, body.fromCardId, body.toCardId, body.removeOffIdentity === true);

    if (result.status === "conflicts") {
      return NextResponse.json({ conflicts: result.conflicts }, { status: 409 });
    }

    const updatedDeck = await prisma.deck.findUnique({
      where: { id },
      include: { commanderCard: true, cards: { include: { card: true } } },
    });
    return NextResponse.json(updatedDeck, { status: 200 });
  } catch (error) {
    if (error instanceof ChangeCommanderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
