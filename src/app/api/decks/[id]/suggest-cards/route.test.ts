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

vi.mock("@/lib/card-suggestion", () => ({
  suggestCards: vi.fn(),
  CardSuggestionError: class CardSuggestionError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { suggestCards, CardSuggestionError } from "@/lib/card-suggestion";
import { POST } from "@/app/api/decks/[id]/suggest-cards/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const suggestCardsMock = suggestCards as unknown as ReturnType<typeof vi.fn>;

function buildRequest(): Request {
  return new Request("http://localhost/api/decks/deck_1/suggest-cards", { method: "POST" });
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const suggestedCard = {
  card: {
    id: "card_valid",
    name: "Valid Card",
    colorIdentity: ["W"],
  },
  tag: "Ramp",
  reason: "Helps ramp into the commander's high cost.",
};

describe("POST /api/decks/[id]/suggest-cards", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    suggestCardsMock.mockReset();
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
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    const response = await POST(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(403);
    expect(suggestCardsMock).not.toHaveBeenCalled();
  });

  it("returns the suggested cards on success", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    suggestCardsMock.mockResolvedValue([suggestedCard]);

    const response = await POST(buildRequest(), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([suggestedCard]);
    expect(suggestCardsMock).toHaveBeenCalledWith("deck_1");
  });

  it("returns 400 when suggestCards throws a CardSuggestionError", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    suggestCardsMock.mockRejectedValue(new CardSuggestionError("Deck has no commander set"));

    const response = await POST(buildRequest(), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "Deck has no commander set" });
  });
});
