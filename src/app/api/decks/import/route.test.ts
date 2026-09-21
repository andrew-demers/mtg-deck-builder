// @vitest-environment node
//
// Overrides the project-wide jsdom environment for this file only: jsdom's
// `File`/`FormData` are not the same objects Next.js's Request/undici expect,
// which trips an internal webidl assertion when the route handler calls
// `request.formData()`. Node's native File/FormData (global since Node 20)
// are compatible.
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    card: {
      findFirst: vi.fn(),
    },
    deck: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    deckCard: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/manabox-decklist", () => ({
  parseManaBoxDecklist: vi.fn(),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseManaBoxDecklist } from "@/lib/manabox-decklist";
import { POST } from "@/app/api/decks/import/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const parseMock = parseManaBoxDecklist as unknown as ReturnType<typeof vi.fn>;
const cardFindFirstMock = prisma.card.findFirst as unknown as ReturnType<typeof vi.fn>;
const deckCreateMock = prisma.deck.create as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckCardCreateMock = prisma.deckCard.create as unknown as ReturnType<typeof vi.fn>;

function buildRequest(): Request {
  const formData = new FormData();
  formData.set("file", new File(["decklist text"], "deck.txt", { type: "text/plain" }));

  return new Request("http://localhost/api/decks/import", {
    method: "POST",
    body: formData,
  });
}

const korvold = { id: "korvold", name: "Korvold, Fae-Cursed King", isCommanderEligible: true };
const szarel = { id: "szarel", name: "Szarel, Genesis Shepherd", isCommanderEligible: true };
const solRing = { id: "sol_ring", name: "Sol Ring" };

function mockCardsByName(cards: Record<string, unknown>): void {
  cardFindFirstMock.mockImplementation(
    async ({ where }: { where: { name: { equals: string } } }) => {
      for (const [name, card] of Object.entries(cards)) {
        if (name.toLowerCase() === where.name.equals.toLowerCase()) {
          return card;
        }
      }
      return null;
    },
  );
}

describe("POST /api/decks/import", () => {
  beforeEach(() => {
    authMock.mockReset();
    parseMock.mockReset();
    cardFindFirstMock.mockReset();
    deckCreateMock.mockReset();
    deckFindUniqueMock.mockReset();
    deckCardCreateMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("returns 400 with the parser's error message on a parse failure", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    parseMock.mockImplementation(() => {
      throw new Error('ManaBox decklist is missing the "// COMMANDER" header');
    });

    const response = await POST(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/COMMANDER/i);
  });

  it("returns 400 when there are more than 2 commanders", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    parseMock.mockReturnValue({
      commanderNames: ["A", "B", "C"],
      cards: [],
    });

    const response = await POST(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/at most 2 commanders/i);
    expect(cardFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the first commander name doesn't resolve to any card", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    parseMock.mockReturnValue({
      commanderNames: ["Nonexistent Commander"],
      cards: [],
    });
    mockCardsByName({});

    const response = await POST(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/Commander not found/i);
    expect(deckCreateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the first commander card is not commander-eligible", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    parseMock.mockReturnValue({
      commanderNames: ["Sol Ring"],
      cards: [],
    });
    mockCardsByName({ "Sol Ring": { ...solRing, isCommanderEligible: false } });

    const response = await POST(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/not commander-eligible/i);
    expect(deckCreateMock).not.toHaveBeenCalled();
  });

  it("collects a mainboard line that doesn't match any card into unmatchedNames", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    parseMock.mockReturnValue({
      commanderNames: [korvold.name],
      cards: [{ name: "Unknown Card", quantity: 2 }],
    });
    mockCardsByName({ [korvold.name]: korvold });
    deckCreateMock.mockResolvedValue({ id: "deck_1" });
    const finalDeck = { id: "deck_1", cards: [] };
    deckFindUniqueMock.mockResolvedValue(finalDeck);

    const response = await POST(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.unmatchedNames).toEqual(["Unknown Card"]);
    expect(deckCardCreateMock).toHaveBeenCalledTimes(1);
    expect(deckCardCreateMock).toHaveBeenCalledWith({
      data: { deckId: "deck_1", cardId: korvold.id, quantity: 1, isCommander: true },
    });
  });

  it("does not create a duplicate DeckCard when a mainboard line names a commander a second time", async () => {
    // Real ManaBox exports can list a commander again in the mainboard
    // section as a second printing - re-creating its DeckCard would violate
    // the (deckId, cardId) unique constraint.
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    parseMock.mockReturnValue({
      commanderNames: [korvold.name],
      cards: [
        { name: korvold.name, quantity: 1 },
        { name: solRing.name, quantity: 1 },
      ],
    });
    mockCardsByName({ [korvold.name]: korvold, [solRing.name]: solRing });
    deckCreateMock.mockResolvedValue({ id: "deck_1" });
    const finalDeck = { id: "deck_1", cards: [] };
    deckFindUniqueMock.mockResolvedValue(finalDeck);

    const response = await POST(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.unmatchedNames).toEqual([]);
    expect(deckCardCreateMock).toHaveBeenCalledTimes(2);
    expect(deckCardCreateMock).toHaveBeenCalledWith({
      data: { deckId: "deck_1", cardId: korvold.id, quantity: 1, isCommander: true },
    });
    expect(deckCardCreateMock).toHaveBeenCalledWith({
      data: { deckId: "deck_1", cardId: solRing.id, quantity: 1, isCommander: false },
    });
  });

  it("creates a deck with two commanders on the success path", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    parseMock.mockReturnValue({
      commanderNames: [korvold.name, szarel.name],
      cards: [{ name: solRing.name, quantity: 1 }],
    });
    mockCardsByName({
      [korvold.name]: korvold,
      [szarel.name]: szarel,
      [solRing.name]: solRing,
    });
    deckCreateMock.mockResolvedValue({ id: "deck_1" });
    const finalDeck = { id: "deck_1", cards: [] };
    deckFindUniqueMock.mockResolvedValue(finalDeck);

    const response = await POST(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ ...finalDeck, unmatchedNames: [] });
    expect(deckCreateMock).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        name: `${korvold.name} (Imported)`,
        commanderCardId: korvold.id,
      },
    });
    expect(deckCardCreateMock).toHaveBeenCalledWith({
      data: { deckId: "deck_1", cardId: korvold.id, quantity: 1, isCommander: true },
    });
    expect(deckCardCreateMock).toHaveBeenCalledWith({
      data: { deckId: "deck_1", cardId: szarel.id, quantity: 1, isCommander: true },
    });
    expect(deckCardCreateMock).toHaveBeenCalledWith({
      data: { deckId: "deck_1", cardId: solRing.id, quantity: 1, isCommander: false },
    });
    expect(deckCardCreateMock).toHaveBeenCalledTimes(3);
    expect(deckFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "deck_1" },
      include: { commanderCard: true, cards: { include: { card: true } } },
    });
  });
});
