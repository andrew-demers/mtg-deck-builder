import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    card: {
      findUnique: vi.fn(),
    },
    collectionEntry: {
      findFirst: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/decks/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findManyMock = prisma.deck.findMany as unknown as ReturnType<typeof vi.fn>;
const createMock = prisma.deck.create as unknown as ReturnType<typeof vi.fn>;
const cardFindUniqueMock = prisma.card.findUnique as unknown as ReturnType<typeof vi.fn>;
const collectionFindFirstMock = prisma.collectionEntry.findFirst as unknown as ReturnType<
  typeof vi.fn
>;

function buildPostRequest(body: unknown): Request {
  return new Request("http://localhost/api/decks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function commanderCard(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "card_atraxa",
    name: "Atraxa, Praetors' Voice",
    manaCost: "{G}{W}{U}{B}",
    manaValue: 4,
    colors: ["G", "W", "U", "B"],
    colorIdentity: ["G", "W", "U", "B"],
    type: "Legendary Creature — Phyrexian Angel Horror",
    types: ["Creature"],
    supertypes: ["Legendary"],
    subtypes: ["Phyrexian", "Angel", "Horror"],
    oracleText: null,
    legalities: {},
    scryfallOracleId: null,
    isCommanderEligible: true,
    ...overrides,
  };
}

describe("GET /api/decks", () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("lists the session user's decks with the commander card joined in", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    await GET();

    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      include: { commanderCard: true },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("POST /api/decks", () => {
  beforeEach(() => {
    authMock.mockReset();
    createMock.mockReset();
    cardFindUniqueMock.mockReset();
    collectionFindFirstMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildPostRequest({ name: "Deck", commanderCardId: "card_atraxa" }));

    expect(response.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 when name or commanderCardId is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    const response = await POST(buildPostRequest({ name: "Deck" }));

    expect(response.status).toBe(400);
    expect(cardFindUniqueMock).not.toHaveBeenCalled();
  });

  it("creates the deck when the commander is eligible and owned", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    cardFindUniqueMock.mockResolvedValue(commanderCard());
    collectionFindFirstMock.mockResolvedValue({
      id: "entry_1",
      userId: "user_1",
      cardId: "card_atraxa",
      quantity: 1,
      foil: false,
    });
    createMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      name: "Superfriends",
      commanderCardId: "card_atraxa",
    });

    const response = await POST(
      buildPostRequest({ name: "Superfriends", commanderCardId: "card_atraxa" }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({
      id: "deck_1",
      userId: "user_1",
      name: "Superfriends",
      commanderCardId: "card_atraxa",
    });
    expect(collectionFindFirstMock).toHaveBeenCalledWith({
      where: { userId: "user_1", cardId: "card_atraxa" },
    });
    expect(createMock).toHaveBeenCalledWith({
      data: { userId: "user_1", name: "Superfriends", commanderCardId: "card_atraxa" },
    });
  });

  it("rejects a card that is not commander-eligible", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    cardFindUniqueMock.mockResolvedValue(commanderCard({ isCommanderEligible: false }));

    const response = await POST(
      buildPostRequest({ name: "Superfriends", commanderCardId: "card_atraxa" }),
    );

    expect(response.status).toBe(400);
    expect(collectionFindFirstMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a commander-eligible card the user does not own", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    cardFindUniqueMock.mockResolvedValue(commanderCard());
    collectionFindFirstMock.mockResolvedValue(null);

    const response = await POST(
      buildPostRequest({ name: "Superfriends", commanderCardId: "card_atraxa" }),
    );

    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the commander card does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    cardFindUniqueMock.mockResolvedValue(null);

    const response = await POST(
      buildPostRequest({ name: "Superfriends", commanderCardId: "missing" }),
    );

    expect(response.status).toBe(400);
    expect(collectionFindFirstMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
