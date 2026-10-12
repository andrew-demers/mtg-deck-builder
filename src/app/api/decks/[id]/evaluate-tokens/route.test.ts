import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { deck: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/token-evaluation", () => ({
  evaluateTokens: vi.fn(),
  TokenEvaluationError: class TokenEvaluationError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { evaluateTokens, TokenEvaluationError } from "@/lib/token-evaluation";
import { POST } from "@/app/api/decks/[id]/evaluate-tokens/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const evaluateTokensMock = evaluateTokens as unknown as ReturnType<typeof vi.fn>;

const request = new Request("http://localhost/api/decks/deck_1/evaluate-tokens", { method: "POST" });
const params = { params: Promise.resolve({ id: "deck_1" }) };

describe("POST /api/decks/[id]/evaluate-tokens", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    evaluateTokensMock.mockReset();
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(request, params)).status).toBe(401);
  });

  it("returns 404 when the deck doesn't exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);
    expect((await POST(request, params)).status).toBe(404);
  });

  it("returns 403 for another user's deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ userId: "user_2" });
    expect((await POST(request, params)).status).toBe(403);
    expect(evaluateTokensMock).not.toHaveBeenCalled();
  });

  it("returns 400 when evaluation fails with a TokenEvaluationError", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ userId: "user_1" });
    evaluateTokensMock.mockRejectedValue(new TokenEvaluationError("Deck has no commander set"));

    const response = await POST(request, params);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Deck has no commander set" });
  });

  it("returns the recommendations", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ userId: "user_1" });
    const recommendations = [{ kind: "token", name: "Treasure", quantity: 5, cards: ["A"], reason: "r" }];
    evaluateTokensMock.mockResolvedValue(recommendations);

    const response = await POST(request, params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(recommendations);
  });
});
