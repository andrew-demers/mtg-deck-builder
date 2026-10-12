import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { suggestCommandersForPreferences, DeckWizardError } from "@/lib/deck-wizard";
import { llmErrorResponse } from "@/lib/llm/error-response";

interface WizardCommandersBody {
  winCondition?: string;
  pace?: string;
  notes?: string;
}

/**
 * POST /api/decks/wizard/commanders - session-scoped. First step of the
 * "build a deck from my collection" wizard: given the win condition and pace
 * the player says they want to play, asks the LLM to recommend owned
 * commander-eligible cards that fit. 400 if `winCondition` or `pace` is
 * missing, or if the caller owns no commander-eligible cards.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as WizardCommandersBody | null;

  if (!body?.winCondition || !body?.pace) {
    return NextResponse.json({ error: "winCondition and pace are required" }, { status: 400 });
  }

  try {
    const suggestions = await suggestCommandersForPreferences(userId, {
      winCondition: body.winCondition,
      pace: body.pace,
      notes: body.notes,
    });
    return NextResponse.json(suggestions, { status: 200 });
  } catch (error) {
    if (error instanceof DeckWizardError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return llmErrorResponse(error);
  }
}
