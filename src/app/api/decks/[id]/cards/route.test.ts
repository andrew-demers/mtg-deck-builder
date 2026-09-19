import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    card: {
      findUnique: vi.fn(),
    },
    collectionEntry: {
      findFirst: vi.fn(),
    },
    deckCard: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/decks/[id]/cards/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const cardFindUniqueMock = prisma.card.findUnique as unknown as ReturnType<typeof vi.fn>;
const collectionFindFirstMock = prisma.collectionEntry.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const deckCardFindUniqueMock = prisma.deckCard.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckCardUpdateMock = prisma.deckCard.update as unknown as ReturnType<typeof vi.fn>;
const deckCardCreateMock = prisma.deckCard.create as unknown as ReturnType<typeof vi.fn>;

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/decks/deck_1/cards", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const commander = {
  id: "commander",
  colorIdentity: ["W", "U"],
};

const validCard = {
  id: "card_valid",
  name: "Valid Card",
  colorIdentity: ["W"],
  type: "Creature",
};

const offColorCard = {
  id: "card_off_color",
  name: "Off Color Card",
  colorIdentity: ["R"],
  type: "Creature",
};

describe("POST /api/decks/[id]/cards", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    cardFindUniqueMock.mockReset();
    collectionFindFirstMock.mockReset();
    deckCardFindUniqueMock.mockReset();
    deckCardUpdateMock.mockReset();
    deckCardCreateMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ cardId: "card_valid" }), buildParams("deck_1"));

    expect(response.status).toBe(401);
    expect(deckFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the deck belongs to a different user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    const response = await POST(buildRequest({ cardId: "card_valid" }), buildParams("deck_1"));

    expect(response.status).toBe(403);
  });

  it("returns 400 when the card is outside the commander's color identity", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      commanderCard: commander,
      cards: [],
    });
    cardFindUniqueMock.mockResolvedValue(offColorCard);
    collectionFindFirstMock.mockResolvedValue({ id: "entry_1" });

    const response = await POST(buildRequest({ cardId: "card_off_color" }), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(deckCardCreateMock).not.toHaveBeenCalled();
  });

  it("accepts a card within a partner commander's color identity that the active commander alone wouldn't allow", async () => {
    const partnerCard = { id: "card_partner_color", name: "Partner Color Card", colorIdentity: ["B"], type: "Creature" };
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({
      id: "deck_1",
      userId: "user_1",
      commanderCard: commander,
      cards: [
        { cardId: commander.id, quantity: 1, isCommander: true, card: commander },
        { cardId: "partner", quantity: 1, isCommander: true, card: { colorIdentity: ["B"] } },
      ],
    });
    cardFindUniqueMock.mockResolvedValue(partnerCard);
    collectionFindFirstMock.mockResolvedValue({ id: "entry_1" });
    deckCardFindUniqueMock.mockResolvedValue(null);

    const finalDeck = { id: "deck_1", cards: [] };
    deckFindUniqueMock.mockResolvedValueOnce(finalDeck);

    const response = await POST(
      buildRequest({ cardId: "card_partner_color" }),
      buildParams("deck_1"),
    );

    expect(response.status).toBe(200);
    expect(deckCardCreateMock).toHaveBeenCalled();
  });

  it("creates a new DeckCard row when adding a card not yet in the deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({
      id: "deck_1",
      userId: "user_1",
      commanderCard: commander,
      cards: [],
    });
    cardFindUniqueMock.mockResolvedValue(validCard);
    collectionFindFirstMock.mockResolvedValue({ id: "entry_1" });
    deckCardFindUniqueMock.mockResolvedValue(null);

    const finalDeck = { id: "deck_1", cards: [] };
    deckFindUniqueMock.mockResolvedValueOnce(finalDeck);

    const response = await POST(buildRequest({ cardId: "card_valid" }), buildParams("deck_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(deckCardCreateMock).toHaveBeenCalledWith({
      data: { deckId: "deck_1", cardId: "card_valid", quantity: 1, isCommander: false },
    });
    expect(data).toEqual(finalDeck);
  });

  it("returns 400 for a singleton violation when the nonland card is already in the deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({
      id: "deck_1",
      userId: "user_1",
      commanderCard: commander,
      cards: [],
    });
    cardFindUniqueMock.mockResolvedValue(validCard);
    collectionFindFirstMock.mockResolvedValue({ id: "entry_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_1",
      quantity: 1,
      isCommander: false,
    });

    const response = await POST(buildRequest({ cardId: "card_valid" }), buildParams("deck_1"));

    expect(response.status).toBe(400);
    expect(deckCardUpdateMock).not.toHaveBeenCalled();
  });

  it("increments quantity for a basic land already in the deck", async () => {
    const land = { id: "plains", name: "Plains", colorIdentity: [], type: "Basic Land — Plains" };
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValueOnce({
      id: "deck_1",
      userId: "user_1",
      commanderCard: commander,
      cards: [],
    });
    cardFindUniqueMock.mockResolvedValue(land);
    collectionFindFirstMock.mockResolvedValue({ id: "entry_1" });
    deckCardFindUniqueMock.mockResolvedValue({
      id: "deckcard_land",
      quantity: 40,
      isCommander: false,
    });
    deckFindUniqueMock.mockResolvedValueOnce({ id: "deck_1", cards: [] });

    const response = await POST(buildRequest({ cardId: "plains" }), buildParams("deck_1"));

    expect(response.status).toBe(200);
    expect(deckCardUpdateMock).toHaveBeenCalledWith({
      where: { id: "deckcard_land" },
      data: { quantity: 41 },
    });
  });
});
