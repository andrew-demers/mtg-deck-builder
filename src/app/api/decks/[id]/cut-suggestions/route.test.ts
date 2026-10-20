import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/card-cuts", () => ({
  suggestCuts: vi.fn(),
  CardCutError: class CardCutError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { suggestCuts, CardCutError } from "@/lib/card-cuts";
import { POST } from "@/app/api/decks/[id]/cut-suggestions/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const suggestCutsMock = suggestCuts as unknown as ReturnType<typeof vi.fn>;

const request = () =>
  new Request("http://localhost/api/decks/deck_1/cut-suggestions", { method: "POST" });
const params = { params: Promise.resolve({ id: "deck_1" }) };

describe("POST /api/decks/[id]/cut-suggestions", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    suggestCutsMock.mockReset();
  });

  it("returns 401 when signed out", async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(401);
  });

  it("returns 404 when the deck doesn't exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(404);
  });

  it("returns 403 for another user's deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_2" });
    expect((await POST(request(), params)).status).toBe(403);
  });

  it("returns 400 on a CardCutError", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    suggestCutsMock.mockRejectedValue(new CardCutError("Deck has no more than 100 cards"));
    expect((await POST(request(), params)).status).toBe(400);
  });

  it("returns the suggestions", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    suggestCutsMock.mockResolvedValue([{ card: { id: "a" }, reason: "weak" }]);
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ card: { id: "a" }, reason: "weak" }]);
  });
});
