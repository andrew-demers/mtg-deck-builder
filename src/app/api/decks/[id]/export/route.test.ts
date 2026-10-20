import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    deckCard: {
      findMany: vi.fn(),
    },
    collectionEntry: {
      findMany: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/decks/[id]/export/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckCardFindManyMock = prisma.deckCard.findMany as unknown as ReturnType<typeof vi.fn>;
const collectionEntryFindManyMock = prisma.collectionEntry.findMany as unknown as ReturnType<typeof vi.fn>;

function buildRequest(): Request {
  return new Request("http://localhost/api/decks/deck_1/export");
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/decks/[id]/export", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    deckCardFindManyMock.mockReset();
    collectionEntryFindManyMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(401);
    expect(deckFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deck does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("missing"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else", name: "Not Mine" });

    const response = await GET(buildRequest(), buildParams("deck_1"));

    expect(response.status).toBe(403);
    expect(deckCardFindManyMock).not.toHaveBeenCalled();
  });

  it("returns a ManaBox-format CSV attachment with owned-copy data filled in", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1", name: "Atraxa Superfriends!" });
    deckCardFindManyMock.mockResolvedValue([
      { cardId: "sol_ring", quantity: 1, card: { name: "Sol Ring" } },
      { cardId: "plains", quantity: 5, card: { name: "Plains" } },
    ]);
    collectionEntryFindManyMock.mockResolvedValue([
      { cardId: "sol_ring", quantity: 1, foil: true, setCode: "C21", sourceScryfallId: "scry-sol-ring" },
    ]);

    const response = await GET(buildRequest(), buildParams("deck_1"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="atraxa-superfriends.csv"',
    );
    expect(body).toBe(
      "Name,Set code,Scryfall ID,Quantity,Foil\r\n" +
        "Sol Ring,C21,scry-sol-ring,1,foil\r\n" +
        "Plains,,,5,normal\r\n",
    );
    expect(collectionEntryFindManyMock).toHaveBeenCalledWith({
      where: { userId: "user_1", cardId: { in: ["sol_ring", "plains"] } },
    });
  });

  it.each([
    ["arena", "Commander\n1 Atraxa\n\nDeck\n1 Sol Ring\n", "atraxa-arena.txt"],
    ["mtgo", "1 Sol Ring\n\nSB: 1 Atraxa\n", "atraxa-mtgo.txt"],
  ])("returns a %s text decklist", async (format, expectedBody, filename) => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      name: "Atraxa",
      commanderCardId: "atraxa",
    });
    deckCardFindManyMock.mockResolvedValue([
      { cardId: "atraxa", quantity: 1, card: { name: "Atraxa" } },
      { cardId: "sol_ring", quantity: 1, card: { name: "Sol Ring" } },
    ]);

    const response = await GET(
      new Request(`http://localhost/api/decks/deck_1/export?format=${format}`),
      buildParams("deck_1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="${filename}"`);
    expect(await response.text()).toBe(expectedBody);
    expect(collectionEntryFindManyMock).not.toHaveBeenCalled();
  });
});
