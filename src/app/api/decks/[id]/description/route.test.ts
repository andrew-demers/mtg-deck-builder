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
  },
}));

vi.mock("@/lib/deck-description", () => ({
  describeDeck: vi.fn(),
  DeckDescriptionError: class DeckDescriptionError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { describeDeck, DeckDescriptionError } from "@/lib/deck-description";
import { POST } from "@/app/api/decks/[id]/description/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckUpdateMock = prisma.deck.update as unknown as ReturnType<typeof vi.fn>;
const describeDeckMock = describeDeck as unknown as ReturnType<typeof vi.fn>;

function buildRequest(): Request {
  return new Request("http://localhost/api/decks/deck_1/description", { method: "POST" });
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function deckCard(quantity: number) {
  return { quantity };
}

describe("POST /api/decks/[id]/description", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    deckUpdateMock.mockReset();
    describeDeckMock.mockReset();
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
      cards: [deckCard(100)],
    });

    const response = await POST(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(403);
    expect(describeDeckMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the deck has fewer than 100 total cards", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      cards: [deckCard(1), deckCard(30)],
    });

    const response = await POST(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(describeDeckMock).not.toHaveBeenCalled();
  });

  it("returns 400 when describeDeck throws a DeckDescriptionError", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      cards: [deckCard(1), deckCard(99)],
    });
    describeDeckMock.mockRejectedValue(new DeckDescriptionError("Deck has no commander set"));

    const response = await POST(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(deckUpdateMock).not.toHaveBeenCalled();
  });

  it("persists and returns the description on success", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      cards: [deckCard(1), deckCard(99)],
    });
    describeDeckMock.mockResolvedValue("This deck wins by grinding out value with counters.");

    const updatedDeck = {
      id: "deck_1",
      userId: "user_1",
      description: "This deck wins by grinding out value with counters.",
      commanderCard: { id: "commander", name: "Atraxa, Praetors' Voice" },
      cards: [],
    };
    deckUpdateMock.mockResolvedValue(updatedDeck);

    const response = await POST(buildRequest(), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(deckUpdateMock).toHaveBeenCalledWith({
      where: { id: "deck_1" },
      data: { description: "This deck wins by grinding out value with counters." },
      include: { commanderCard: true, cards: { include: { card: true } } },
    });
    expect(data).toEqual(updatedDeck);
  });
});
