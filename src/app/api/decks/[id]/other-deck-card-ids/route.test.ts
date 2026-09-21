import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    deckCard: {
      findMany: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/decks/[id]/other-deck-card-ids/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckCardFindManyMock = prisma.deckCard.findMany as unknown as ReturnType<typeof vi.fn>;

function buildRequest(): Request {
  return new Request("http://localhost/api/decks/deck_1/other-deck-card-ids");
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/decks/[id]/other-deck-card-ids", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    deckCardFindManyMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(401);
    expect(deckFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("missing"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    const response = await GET(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(403);
    expect(deckCardFindManyMock).not.toHaveBeenCalled();
  });

  it("returns unique nonland card IDs used in the caller's other decks", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckCardFindManyMock.mockResolvedValue([
      { cardId: "sol_ring", card: { type: "Artifact" } },
      { cardId: "sol_ring", card: { type: "Artifact" } },
      { cardId: "plains", card: { type: "Basic Land — Plains" } },
    ]);

    const response = await GET(buildRequest(), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(["sol_ring"]);
    expect(deckCardFindManyMock).toHaveBeenCalledWith({
      where: { deckId: { not: "deck_1" }, deck: { userId: "user_1" } },
      include: { card: true },
    });
  });
});
