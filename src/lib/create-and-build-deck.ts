export interface CreateAndBuildInput {
  name: string;
  commanderCardId: string;
  allowUnowned: boolean;
}

export interface CreateAndBuildResult {
  deckId: string;
  /** Set when the deck was created but filling in the rest of the cards failed. */
  buildError: string | null;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

/**
 * Client-side helper shared by the new-deck pages: creates a deck around the
 * chosen commander, then asks the server to build the rest of it. Throws if
 * the deck can't be created. If only the build step fails, the deck still
 * exists, so it resolves with `buildError` set and callers can send the user
 * to the deck anyway.
 */
export async function createAndBuildDeck(input: CreateAndBuildInput): Promise<CreateAndBuildResult> {
  const createResponse = await fetch("/api/decks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, commanderCardId: input.commanderCardId }),
  });

  if (!createResponse.ok) {
    throw new Error(await readError(createResponse, "Something went wrong creating this deck."));
  }

  const deck = (await createResponse.json()) as { id: string };

  const buildResponse = await fetch(`/api/decks/${deck.id}/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowUnowned: input.allowUnowned }),
  });

  if (!buildResponse.ok) {
    return {
      deckId: deck.id,
      buildError: await readError(
        buildResponse,
        "Deck was created, but something went wrong filling in the rest of the cards.",
      ),
    };
  }

  return { deckId: deck.id, buildError: null };
}
