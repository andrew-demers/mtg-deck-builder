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

vi.mock("@/lib/deck-critique", () => ({
  critiqueDeck: vi.fn(),
  DeckCritiqueError: class DeckCritiqueError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { critiqueDeck, DeckCritiqueError } from "@/lib/deck-critique";
import { POST } from "@/app/api/decks/[id]/critique/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckUpdateMock = prisma.deck.update as unknown as ReturnType<typeof vi.fn>;
const critiqueDeckMock = critiqueDeck as unknown as ReturnType<typeof vi.fn>;

function buildRequest(): Request {
  return new Request("http://localhost/api/decks/deck_1/critique", { method: "POST" });
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function deckCard(quantity: number) {
  return { quantity };
}

describe("POST /api/decks/[id]/critique", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    deckUpdateMock.mockReset();
    critiqueDeckMock.mockReset();
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
    expect(critiqueDeckMock).not.toHaveBeenCalled();
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
    expect(critiqueDeckMock).not.toHaveBeenCalled();
  });

  it("returns 400 when critiqueDeck throws a DeckCritiqueError", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      cards: [deckCard(1), deckCard(99)],
    });
    critiqueDeckMock.mockRejectedValue(new DeckCritiqueError("Deck has no commander set"));

    const response = await POST(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(deckUpdateMock).not.toHaveBeenCalled();
  });

  it("persists and returns the critique on success", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      cards: [deckCard(1), deckCard(99)],
    });
    critiqueDeckMock.mockResolvedValue("This deck has a strong ramp package.");

    const updatedDeck = {
      id: "deck_1",
      userId: "user_1",
      critique: "This deck has a strong ramp package.",
      commanderCard: { id: "commander", name: "Atraxa, Praetors' Voice" },
      cards: [],
    };
    deckUpdateMock.mockResolvedValue(updatedDeck);

    const response = await POST(buildRequest(), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(deckUpdateMock).toHaveBeenCalledWith({
      where: { id: "deck_1" },
      data: { critique: "This deck has a strong ramp package." },
      include: { commanderCard: true, cards: { include: { card: true } } },
    });
    expect(data).toEqual(updatedDeck);
  });
});
