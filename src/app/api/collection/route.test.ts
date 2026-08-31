import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    collectionEntry: {
      findMany: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/collection/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findManyMock = prisma.collectionEntry.findMany as unknown as ReturnType<typeof vi.fn>;

function buildRequest(query = ""): Request {
  return new Request(`http://localhost/api/collection${query}`);
}

function card(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "card_1",
    name: "Sol Ring",
    manaCost: "{1}",
    manaValue: 1,
    colors: [],
    colorIdentity: [],
    type: "Artifact",
    types: ["Artifact"],
    supertypes: [],
    subtypes: [],
    oracleText: null,
    legalities: {},
    scryfallOracleId: null,
    isCommanderEligible: false,
    ...overrides,
  };
}

function entry(cardOverrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "entry_1",
    userId: "user_1",
    cardId: "card_1",
    quantity: 1,
    foil: false,
    setCode: null,
    sourceScryfallId: null,
    card: card(cardOverrides),
  };
}

describe("GET /api/collection", () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("scopes the query to the session user with no filters", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    await GET(buildRequest());

    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      include: { card: true },
    });
  });

  it("pushes minManaValue/maxManaValue into the card.manaValue where clause", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    await GET(buildRequest("?minManaValue=2&maxManaValue=4"));

    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user_1", card: { manaValue: { gte: 2, lte: 4 } } },
      include: { card: true },
    });
  });

  it("pushes type into a case-insensitive contains filter", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    await GET(buildRequest("?type=creature"));

    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user_1", card: { type: { contains: "creature", mode: "insensitive" } } },
      include: { card: true },
    });
  });

  it("pushes commanderEligible=true into an isCommanderEligible filter", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    await GET(buildRequest("?commanderEligible=true"));

    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user_1", card: { isCommanderEligible: true } },
      include: { card: true },
    });
  });

  it("combines multiple filters in a single where clause", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    await GET(buildRequest("?minManaValue=1&type=artifact&commanderEligible=true"));

    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        card: {
          manaValue: { gte: 1 },
          type: { contains: "artifact", mode: "insensitive" },
          isCommanderEligible: true,
        },
      },
      include: { card: true },
    });
  });

  it("filters colors to only entries whose colorIdentity is a subset of the requested colors", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findManyMock.mockResolvedValue([
      entry({ name: "Mono White", colorIdentity: ["W"] }),
      entry({ name: "Azorius", colorIdentity: ["W", "U"] }),
      entry({ name: "Esper", colorIdentity: ["W", "U", "B"] }),
      entry({ name: "Colorless", colorIdentity: [] }),
    ]);

    const response = await GET(buildRequest("?colors=W,U"));
    const data = (await response.json()) as Array<{ card: { name: string } }>;

    expect(data.map((e) => e.card.name).sort()).toEqual(["Azorius", "Colorless", "Mono White"]);
  });

  it("sorts by name ascending by default", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findManyMock.mockResolvedValue([entry({ name: "Zap" }), entry({ name: "Ambush" })]);

    const response = await GET(buildRequest());
    const data = (await response.json()) as Array<{ card: { name: string } }>;

    expect(data.map((e) => e.card.name)).toEqual(["Ambush", "Zap"]);
  });

  it("sorts by manaValue ascending when sort=manaValue", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findManyMock.mockResolvedValue([
      entry({ name: "Big", manaValue: 6 }),
      entry({ name: "Small", manaValue: 1 }),
    ]);

    const response = await GET(buildRequest("?sort=manaValue"));
    const data = (await response.json()) as Array<{ card: { name: string } }>;

    expect(data.map((e) => e.card.name)).toEqual(["Small", "Big"]);
  });
});
