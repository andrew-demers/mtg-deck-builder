import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deckCard: {
      findMany: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/decks/card-ids-in-use/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckCardFindManyMock = prisma.deckCard.findMany as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/decks/card-ids-in-use", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckCardFindManyMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(deckCardFindManyMock).not.toHaveBeenCalled();
  });

  it("returns unique nonland card IDs used across all of the caller's decks", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckCardFindManyMock.mockResolvedValue([
      { cardId: "sol_ring", card: { type: "Artifact" } },
      { cardId: "sol_ring", card: { type: "Artifact" } },
      { cardId: "plains", card: { type: "Basic Land — Plains" } },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(["sol_ring"]);
    expect(deckCardFindManyMock).toHaveBeenCalledWith({
      where: { deck: { userId: "user_1" } },
      include: { card: true },
    });
  });
});
