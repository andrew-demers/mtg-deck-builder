import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    deckCard: {
      deleteMany: vi.fn(),
    },
    deckVersion: {
      deleteMany: vi.fn(),
    },
    deckVersionCard: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DELETE, GET, PATCH } from "@/app/api/decks/[id]/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckDeleteMock = prisma.deck.delete as unknown as ReturnType<typeof vi.fn>;
const deckCardDeleteManyMock = prisma.deckCard.deleteMany as unknown as ReturnType<typeof vi.fn>;
const versionDeleteManyMock = prisma.deckVersion.deleteMany as unknown as ReturnType<typeof vi.fn>;
const versionCardDeleteManyMock = prisma.deckVersionCard.deleteMany as unknown as ReturnType<typeof vi.fn>;
const transactionMock = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

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

describe("DELETE /api/decks/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUniqueMock.mockReset();
    deckDeleteMock.mockReset();
    deckCardDeleteManyMock.mockReset();
    versionDeleteManyMock.mockReset();
    versionCardDeleteManyMock.mockReset();
    transactionMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await DELETE(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue(null);

    const response = await DELETE(buildRequest(), buildParams("missing"));

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    const response = await DELETE(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("deletes the deck's versions, DeckCards, and the deck in a transaction", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    transactionMock.mockResolvedValue(undefined);

    const response = await DELETE(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(204);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock.mock.calls[0][0]).toHaveLength(4);
    expect(versionCardDeleteManyMock).toHaveBeenCalledWith({ where: { version: { deckId: "deck_1" } } });
    expect(versionDeleteManyMock).toHaveBeenCalledWith({ where: { deckId: "deck_1" } });
    expect(deckCardDeleteManyMock).toHaveBeenCalledWith({ where: { deckId: "deck_1" } });
    expect(deckDeleteMock).toHaveBeenCalledWith({ where: { id: "deck_1" } });
  });
});

describe("PATCH /api/decks/[id]", () => {
  const deckUpdateMock = prisma.deck.update as unknown as ReturnType<typeof vi.fn>;

  function patchRequest(body: unknown): Request {
    return new Request("http://localhost/api/decks/deck_1", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    authMock.mockReset();
    findUniqueMock.mockReset();
    deckUpdateMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ name: "New" }), buildParams("deck_1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the deck does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ name: "New" }), buildParams("missing"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    const response = await PATCH(patchRequest({ name: "New" }), buildParams("deck_1"));

    expect(response.status).toBe(403);
    expect(deckUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the name is blank or missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });

    expect((await PATCH(patchRequest({ name: "   " }), buildParams("deck_1"))).status).toBe(400);
    expect((await PATCH(patchRequest({}), buildParams("deck_1"))).status).toBe(400);
    expect(deckUpdateMock).not.toHaveBeenCalled();
  });

  it("saves the trimmed name and returns the deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    deckUpdateMock.mockResolvedValue({ id: "deck_1", name: "New name" });

    const response = await PATCH(patchRequest({ name: "  New name " }), buildParams("deck_1"));

    expect(response.status).toBe(200);
    expect(deckUpdateMock.mock.calls[0][0].data).toEqual({ name: "New name" });
    expect((await response.json()).name).toBe("New name");
  });
});
