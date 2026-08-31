import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    card: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/cards/search/route";

const findManyMock = prisma.card.findMany as unknown as ReturnType<typeof vi.fn>;

function buildRequest(query: string): Request {
  return new Request(`http://localhost/api/cards/search${query}`);
}

describe("GET /api/cards/search", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("returns an empty array when q is missing", async () => {
    const response = await GET(buildRequest(""));
    const data = await response.json();

    expect(data).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("returns an empty array when q is blank", async () => {
    const response = await GET(buildRequest("?q=%20%20"));
    const data = await response.json();

    expect(data).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("queries by case-insensitive substring and sorts shorter matches first", async () => {
    findManyMock.mockResolvedValue([
      { id: "card_2", name: "Sol Ring Replica", type: "Artifact", manaCost: "{1}" },
      { id: "card_1", name: "Sol Ring", type: "Artifact", manaCost: "{1}" },
    ]);

    const response = await GET(buildRequest("?q=Sol%20Ring"));
    const data = await response.json();

    expect(findManyMock).toHaveBeenCalledWith({
      where: { name: { contains: "Sol Ring", mode: "insensitive" } },
      take: 50,
    });
    expect(data).toEqual([
      { id: "card_1", name: "Sol Ring", type: "Artifact", manaCost: "{1}" },
      { id: "card_2", name: "Sol Ring Replica", type: "Artifact", manaCost: "{1}" },
    ]);
  });

  it("caps results at 20", async () => {
    const cards = Array.from({ length: 30 }, (_, index) => ({
      id: `card_${index}`,
      name: `Card ${index}`,
      type: "Creature",
      manaCost: "{1}",
    }));
    findManyMock.mockResolvedValue(cards);

    const response = await GET(buildRequest("?q=Card"));
    const data = await response.json();

    expect(data).toHaveLength(20);
  });
});
