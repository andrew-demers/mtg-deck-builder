import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
    card: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/scryfall", () => ({
  searchCards: vi.fn(),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { searchCards } from "@/lib/scryfall";
import { GET, scryfallNameQuery } from "@/app/api/decks/[id]/scryfall-search/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const cardFindManyMock = prisma.card.findMany as unknown as ReturnType<typeof vi.fn>;
const searchCardsMock = searchCards as unknown as ReturnType<typeof vi.fn>;

function buildRequest(query: string): Request {
  return new Request(`http://localhost/api/decks/deck_1/scryfall-search${query}`);
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: "card_1",
    name: "Sol Ring",
    manaCost: "{1}",
    manaValue: 1,
    type: "Artifact",
    types: ["Artifact"],
    colors: [],
    colorIdentity: [],
    oracleText: "{T}: Add {C}{C}.",
    priceUsd: 1.5,
    ...overrides,
  };
}

describe("scryfallNameQuery", () => {
  it("quotes a name search and ignores a query shorter than two characters", () => {
    expect(scryfallNameQuery("  sol ring  ")).toBe('name:"sol ring"');
    expect(scryfallNameQuery('so"l')).toBe('name:"sol"');
    expect(scryfallNameQuery(" s ")).toBeNull();
    expect(scryfallNameQuery("   ")).toBeNull();
  });
});

describe("GET /api/decks/[id]/scryfall-search", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    cardFindManyMock.mockReset();
    searchCardsMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(buildRequest("?q=sol"), buildParams("deck_1"));

    expect(response.status).toBe(401);
    expect(deckFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);

    const response = await GET(buildRequest("?q=sol"), buildParams("missing"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    const response = await GET(buildRequest("?q=sol"), buildParams("deck_1"));

    expect(response.status).toBe(403);
    expect(searchCardsMock).not.toHaveBeenCalled();
  });

  it("returns an empty list for a short query without calling Scryfall", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      commanderCard: null,
      cards: [],
    });

    const response = await GET(buildRequest("?q=s"), buildParams("deck_1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(searchCardsMock).not.toHaveBeenCalled();
  });

  it("keeps on-color catalog cards in Scryfall order and drops the rest", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    const commander = card({
      id: "commander",
      name: "Commander",
      type: "Legendary Creature",
      colorIdentity: ["W"],
    });
    const solRing = card();
    const swords = card({
      id: "swords",
      name: "Swords to Plowshares",
      type: "Instant",
      colorIdentity: ["W"],
    });
    const bolt = card({
      id: "bolt",
      name: "Lightning Bolt",
      type: "Instant",
      colorIdentity: ["R"],
    });
    const plains = card({
      id: "plains",
      name: "Plains",
      type: "Basic Land — Plains",
      colorIdentity: ["W"],
    });

    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      commanderCard: commander,
      cards: [
        { cardId: "commander", isCommander: true, card: commander },
        { cardId: "sol_in_deck", isCommander: false, card: { ...solRing, id: "sol_in_deck" } },
        { cardId: "plains", isCommander: false, card: plains },
      ],
    });
    searchCardsMock.mockResolvedValue([
      { name: "Sol Ring" },
      { name: "Not In Catalog" },
      { name: "Lightning Bolt" },
      { name: "Swords to Plowshares" },
      { name: "Plains" },
    ]);
    cardFindManyMock.mockResolvedValue([
      plains,
      bolt,
      swords,
      { ...solRing, id: "sol_in_deck" },
    ]);

    const response = await GET(buildRequest("?q=sol"), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(searchCardsMock).toHaveBeenCalledWith('name:"sol"', 60);
    expect(data.map((item: { name: string }) => item.name)).toEqual([
      "Swords to Plowshares",
      "Plains",
    ]);
    expect(data[0]).toMatchObject({ id: "swords", oracleText: "{T}: Add {C}{C}." });
  });

  it("falls back to the card catalog when Scryfall can't be reached", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    const commander = card({
      id: "commander",
      name: "Commander",
      type: "Legendary Creature",
      colorIdentity: ["G"],
    });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      commanderCard: commander,
      cards: [{ cardId: "commander", isCommander: true, card: commander }],
    });
    searchCardsMock.mockRejectedValue(new Error("403"));
    cardFindManyMock.mockResolvedValue([
      card({ id: "replica", name: "Pongify Replica", type: "Instant", colorIdentity: ["G"] }),
      card({ id: "pongify", name: "Pongify", type: "Instant", colorIdentity: ["G"] }),
      card({ id: "bolt", name: "Pongify Bolt", type: "Instant", colorIdentity: ["R"] }),
    ]);

    const response = await GET(buildRequest("?q=pong"), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(cardFindManyMock).toHaveBeenCalledWith({
      where: { name: { contains: "pong", mode: "insensitive" } },
      take: 50,
    });
    expect(data.map((item: { name: string }) => item.name)).toEqual(["Pongify", "Pongify Replica"]);
  });
});
