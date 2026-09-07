import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/decks/[id]/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;

function buildRequest(): Request {
  return new Request("http://localhost/api/decks/deck_1");
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/decks/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUniqueMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("missing"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "someone_else",
      name: "Not Yours",
      commanderCardId: "card_atraxa",
      commanderCard: null,
      cards: [],
    });

    const response = await GET(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(403);
  });

  it("returns the deck with DeckCards joined to Card for the owning user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    const deck = {
      id: "deck_1",
      userId: "user_1",
      name: "Superfriends",
      commanderCardId: "card_atraxa",
      commanderCard: { id: "card_atraxa", name: "Atraxa, Praetors' Voice" },
      cards: [
        {
          id: "deckcard_1",
          deckId: "deck_1",
          cardId: "card_atraxa",
          quantity: 1,
          isCommander: true,
          card: { id: "card_atraxa", name: "Atraxa, Praetors' Voice" },
        },
      ],
    };
    findUniqueMock.mockResolvedValue(deck);

    const response = await GET(buildRequest(), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(deck);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "deck_1" },
      include: {
        commanderCard: true,
        cards: { include: { card: true } },
      },
    });
  });
});
