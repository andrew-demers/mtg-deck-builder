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
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/deck-builder", () => ({
  buildDeck: vi.fn(),
  DeckBuildError: class DeckBuildError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildDeck, DeckBuildError } from "@/lib/deck-builder";
import { POST } from "@/app/api/decks/[id]/build/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckCardFindUniqueMock = prisma.deckCard.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckCardUpdateMock = prisma.deckCard.update as unknown as ReturnType<typeof vi.fn>;
const deckCardCreateMock = prisma.deckCard.create as unknown as ReturnType<typeof vi.fn>;
const buildDeckMock = buildDeck as unknown as ReturnType<typeof vi.fn>;

function buildRequest(): Request {
  return new Request("http://localhost/api/decks/deck_1/build", { method: "POST" });
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/decks/[id]/build", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    deckCardFindUniqueMock.mockReset();
    deckCardUpdateMock.mockReset();
    deckCardCreateMock.mockReset();
    buildDeckMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(401);
    expect(deckFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);

    const response = await POST(buildRequest(), buildParams("missing"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "someone_else",
      commanderCardId: "commander",
    });

    const response = await POST(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(403);
    expect(buildDeckMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the deck has no commander set", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({
      id: "deck_1",
      userId: "user_1",
      commanderCardId: null,
    });

    const response = await POST(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(buildDeckMock).not.toHaveBeenCalled();
  });

  it("returns 400 when buildDeck throws a DeckBuildError", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({
      id: "deck_1",
      userId: "user_1",
      commanderCardId: "commander",
    });
    buildDeckMock.mockRejectedValue(new DeckBuildError("no basic lands to backfill with"));

    const response = await POST(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(deckCardCreateMock).not.toHaveBeenCalled();
  });

  it("persists exactly 100 total quantity across DeckCard rows on a successful build", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({
      id: "deck_1",
      userId: "user_1",
      commanderCardId: "commander",
    });

    buildDeckMock.mockResolvedValue({
      cards: [
        { cardId: "commander", quantity: 1, isCommander: true },
        { cardId: "sol_ring", quantity: 1, isCommander: false },
        { cardId: "plains", quantity: 98, isCommander: false },
      ],
    });

    deckCardFindUniqueMock.mockResolvedValue(null);

    const finalDeck = {
      id: "deck_1",
      userId: "user_1",
      commanderCardId: "commander",
      cards: [
        { cardId: "commander", quantity: 1, isCommander: true },
        { cardId: "sol_ring", quantity: 1, isCommander: false },
        { cardId: "plains", quantity: 98, isCommander: false },
      ],
    };
    deckFindUniqueMock.mockResolvedValueOnce(finalDeck);

    const response = await POST(buildRequest(), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(deckCardCreateMock).toHaveBeenCalledTimes(3);

    const totalQuantity = deckCardCreateMock.mock.calls.reduce(
      (sum: number, call) => sum + (call[0] as { data: { quantity: number } }).data.quantity,
      0,
    );
    expect(totalQuantity).toBe(100);
    expect(data).toEqual(finalDeck);
  });

  it("updates an existing DeckCard row's quantity instead of creating a duplicate", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({
      id: "deck_1",
      userId: "user_1",
      commanderCardId: "commander",
    });

    buildDeckMock.mockResolvedValue({
      cards: [{ cardId: "sol_ring", quantity: 1, isCommander: false }],
    });

    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_1",
      deckId: "deck_1",
      cardId: "sol_ring",
      quantity: 1,
      isCommander: false,
    });

    deckFindUniqueMock.mockResolvedValueOnce({ id: "deck_1" });

    await POST(buildRequest(), buildParams("deck_1"));

    expect(deckCardUpdateMock).toHaveBeenCalledWith({
      where: { id: "deckcard_1" },
      data: { quantity: 1, isCommander: false },
    });
    expect(deckCardCreateMock).not.toHaveBeenCalled();
  });
});
