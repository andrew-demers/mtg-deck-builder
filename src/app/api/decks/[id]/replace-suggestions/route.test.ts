import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/card-replacement", () => ({
  suggestReplacements: vi.fn(),
  CardReplacementError: class CardReplacementError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { suggestReplacements, CardReplacementError } from "@/lib/card-replacement";
import { POST } from "@/app/api/decks/[id]/replace-suggestions/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const suggestReplacementsMock = suggestReplacements as unknown as ReturnType<typeof vi.fn>;

function buildRequest(body?: unknown): Request {
  return new Request("http://localhost/api/decks/deck_1/replace-suggestions", {
    method: "POST",
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/decks/[id]/replace-suggestions", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    suggestReplacementsMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ cardIds: ["a"] }), buildParams("deck_1"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the deck does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ cardIds: ["a"] }), buildParams("deck_1"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to another user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_2" });

    const response = await POST(buildRequest({ cardIds: ["a"] }), buildParams("deck_1"));

    expect(response.status).toBe(403);
    expect(suggestReplacementsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing or empty cardIds", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });

    expect((await POST(buildRequest({}), buildParams("deck_1"))).status).toBe(400);
    expect((await POST(buildRequest({ cardIds: [] }), buildParams("deck_1"))).status).toBe(400);
    expect((await POST(buildRequest({ cardIds: [1] }), buildParams("deck_1"))).status).toBe(400);
  });

  it("returns 400 with the message when the selection is invalid", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    suggestReplacementsMock.mockRejectedValue(new CardReplacementError("You do not own one of the selected cards"));

    const response = await POST(buildRequest({ cardIds: ["a"] }), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "You do not own one of the selected cards" });
  });

  it("returns the swaps on success", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    const swaps = [{ add: { id: "a" }, remove: { id: "b" }, reason: "Better." }];
    suggestReplacementsMock.mockResolvedValue(swaps);

    const response = await POST(buildRequest({ cardIds: ["a"] }), buildParams("deck_1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(swaps);
    expect(suggestReplacementsMock).toHaveBeenCalledWith("deck_1", ["a"]);
  });
});
