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
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DELETE, PATCH } from "@/app/api/decks/[id]/cards/[cardId]/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckCardFindUniqueMock = prisma.deckCard.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckCardDeleteMock = prisma.deckCard.delete as unknown as ReturnType<typeof vi.fn>;
const deckCardUpdateMock = prisma.deckCard.update as unknown as ReturnType<typeof vi.fn>;

function buildRequest(body?: unknown): Request {
  return new Request("http://localhost/api/decks/deck_1/cards/card_1", {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function buildParams(id: string, cardId: string): { params: Promise<{ id: string; cardId: string }> } {
  return { params: Promise.resolve({ id, cardId }) };
}

describe("DELETE /api/decks/[id]/cards/[cardId]", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    deckCardFindUniqueMock.mockReset();
    deckCardDeleteMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await DELETE(buildRequest(), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(401);
    expect(deckFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck doesn't exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);

    const response = await DELETE(buildRequest(), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    const response = await DELETE(buildRequest(), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(403);
  });

  it("returns 404 when there is no DeckCard for this card", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue(null);

    const response = await DELETE(buildRequest(), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(404);
  });

  it("returns 400 when the matched card is the commander", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_1",
      isCommander: true,
    });

    const response = await DELETE(buildRequest(), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(400);
    expect(deckCardDeleteMock).not.toHaveBeenCalled();
  });

  it("deletes the DeckCard and returns the updated deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_1",
      isCommander: false,
    });

    const finalDeck = { id: "deck_1", cards: [] };
    deckFindUniqueMock.mockResolvedValueOnce(finalDeck);

    const response = await DELETE(buildRequest(), buildParams("deck_1", "card_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(deckCardDeleteMock).toHaveBeenCalledWith({ where: { id: "deckcard_1" } });
    expect(data).toEqual(finalDeck);
  });
});

describe("PATCH /api/decks/[id]/cards/[cardId]", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    deckCardFindUniqueMock.mockReset();
    deckCardUpdateMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await PATCH(buildRequest({ quantity: 5 }), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(401);
    expect(deckFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck doesn't exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);

    const response = await PATCH(buildRequest({ quantity: 5 }), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    const response = await PATCH(buildRequest({ quantity: 5 }), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(403);
  });

  it("returns 404 when there is no DeckCard for this card", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue(null);

    const response = await PATCH(buildRequest({ quantity: 5 }), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(404);
  });

  it("returns 400 when the matched card is not a basic land", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_1",
      quantity: 1,
      card: { type: "Creature" },
    });

    const response = await PATCH(buildRequest({ quantity: 5 }), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(400);
    expect(deckCardUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when quantity is 0", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_1",
      quantity: 40,
      card: { type: "Basic Land — Plains" },
    });

    const response = await PATCH(buildRequest({ quantity: 0 }), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(400);
    expect(deckCardUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when quantity is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_1",
      quantity: 40,
      card: { type: "Basic Land — Plains" },
    });

    const response = await PATCH(buildRequest({}), buildParams("deck_1", "card_1"));

    expect(response.status).toBe(400);
    expect(deckCardUpdateMock).not.toHaveBeenCalled();
  });

  it("updates a basic land's quantity and returns the updated deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({ id: "deck_1", userId: "user_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_1",
      quantity: 40,
      card: { type: "Basic Land — Plains" },
    });

    const finalDeck = { id: "deck_1", cards: [] };
    deckFindUniqueMock.mockResolvedValueOnce(finalDeck);

    const response = await PATCH(buildRequest({ quantity: 41 }), buildParams("deck_1", "card_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(deckCardUpdateMock).toHaveBeenCalledWith({
      where: { id: "deckcard_1" },
      data: { quantity: 41 },
    });
    expect(data).toEqual(finalDeck);
  });
});
