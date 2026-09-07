import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { suggestCommander } from "@/lib/commander-suggestion";

/**
 * POST /api/decks/suggest-commander - session-scoped. Asks the LLM to
 * suggest a Commander from the caller's owned commander-eligible cards and
 * returns the matched `Card`. 400 if the caller owns no commander-eligible
 * cards, or if the LLM's suggestion doesn't match any card they own.
 */
export async function POST(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await suggestCommander(userId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.card);
}
