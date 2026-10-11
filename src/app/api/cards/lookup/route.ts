import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { autocompleteCardNames, lookupCardByName } from "@/lib/scryfall";

/**
 * GET /api/cards/lookup?name=... - session-scoped. Fuzzy-looks-up a single
 * card on Scryfall and returns its oracle text, image, and current USD prices
 * (404 if nothing matches). With `?autocomplete=1`, returns `{ names }`
 * suggestions for the query instead. 502 if Scryfall can't be reached.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim() ?? "";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    if (searchParams.get("autocomplete")) {
      return NextResponse.json({ names: await autocompleteCardNames(name) });
    }

    const card = await lookupCardByName(name);
    if (!card) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(card);
  } catch {
    return NextResponse.json({ error: "Could not reach Scryfall" }, { status: 502 });
  }
}
