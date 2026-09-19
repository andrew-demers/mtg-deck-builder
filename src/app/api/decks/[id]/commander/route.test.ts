import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    deckCard: {
      findUnique: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/decks/[id]/commander/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckUpdateMock = prisma.deck.update as unknown as ReturnType<typeof vi.fn>;
const deckCardFindUniqueMock = prisma.deckCard.findUnique as unknown as ReturnType<typeof vi.fn>;

function buildRequest(body?: unknown): Request {
  return new Request("http://localhost/api/decks/deck_1/commander", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/decks/[id]/commander", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    deckUpdateMock.mockReset();
    deckCardFindUniqueMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ cardId: "card_partner" }), buildParams("deck_1"));

    expect(response.status).toBe(401);
    expect(deckFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck doesn't exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ cardId: "card_partner" }), buildParams("deck_1"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    const response = await POST(buildRequest({ cardId: "card_partner" }), buildParams("deck_1"));

    expect(response.status).toBe(403);
  });

  it("returns 400 when the body has no cardId", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });

    const response = await POST(buildRequest({}), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(deckCardFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when there is no DeckCard for this card in this deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ cardId: "card_partner" }), buildParams("deck_1"));

    expect(response.status).toBe(404);
    expect(deckUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the matched DeckCard is not a commander", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_1",
      isCommander: false,
    });

    const response = await POST(buildRequest({ cardId: "card_noncommander" }), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(deckUpdateMock).not.toHaveBeenCalled();
  });

  it("sets commanderCardId and returns the updated deck on success", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_partner",
      isCommander: true,
    });

    const finalDeck = { id: "deck_1", commanderCardId: "card_partner", cards: [] };
    deckFindUniqueMock.mockResolvedValueOnce(finalDeck);

    const response = await POST(buildRequest({ cardId: "card_partner" }), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(deckUpdateMock).toHaveBeenCalledWith({
      where: { id: "deck_1" },
      data: { commanderCardId: "card_partner" },
    });
    expect(data).toEqual(finalDeck);
  });
});
