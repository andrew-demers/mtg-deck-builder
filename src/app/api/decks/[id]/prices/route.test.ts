import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { deck: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/card-prices", () => ({ refreshCardPrices: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshCardPrices } from "@/lib/card-prices";
import { POST } from "@/app/api/decks/[id]/prices/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const refreshMock = refreshCardPrices as unknown as ReturnType<typeof vi.fn>;

const request = new Request("http://localhost/api/decks/deck_1/prices", { method: "POST" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/decks/[id]/prices", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    refreshMock.mockReset();
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(request, params("deck_1"))).status).toBe(401);
  });

  it("returns 404 for a missing deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);
    expect((await POST(request, params("deck_1"))).status).toBe(404);
  });

  it("returns 403 for another user's deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ userId: "user_2", cards: [] });
    expect((await POST(request, params("deck_1"))).status).toBe(403);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("force-refreshes the deck's cards plus the commander, de-duplicated", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      userId: "user_1",
      commanderCardId: "c1",
      cards: [{ cardId: "c1" }, { cardId: "c2" }],
    });
    refreshMock.mockResolvedValue(2);

    const response = await POST(request, params("deck_1"));

    expect(refreshMock).toHaveBeenCalledWith(["c1", "c2"], { force: true });
    expect(await response.json()).toEqual({ updated: 2 });
  });

  it("returns 502 when Scryfall is unreachable", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ userId: "user_1", commanderCardId: null, cards: [] });
    refreshMock.mockRejectedValue(new Error("403"));

    expect((await POST(request, params("deck_1"))).status).toBe(502);
  });
});
