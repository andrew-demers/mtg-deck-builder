import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    collectionEntry: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  getLlmProvider: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { suggestCards, CardSuggestionError } from "@/lib/card-suggestion";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const collectionFindManyMock = prisma.collectionEntry.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const getLlmProviderMock = getLlmProvider as unknown as ReturnType<typeof vi.fn>;

function card(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? "card_x",
    name: overrides.name ?? "Card X",
    manaCost: null,
    manaValue: 1,
    colors: [],
    colorIdentity: ["W", "U"],
    type: "Creature",
    types: ["Creature"],
    supertypes: [],
    subtypes: [],
    oracleText: null,
    legalities: {},
    scryfallOracleId: null,
    isCommanderEligible: false,
    ...overrides,
  };
}

const commander = card({
  id: "commander",
  name: "Atraxa, Praetors' Voice",
  colorIdentity: ["W", "U", "B", "G"],
  type: "Legendary Creature — Phyrexian Angel Horror",
  isCommanderEligible: true,
});

function mockCompletion(text: string) {
  getLlmProviderMock.mockReturnValue({ complete: vi.fn().mockResolvedValue(text) });
}

function mockDeck(deckCards: Record<string, unknown>[]) {
  deckFindUniqueMock.mockResolvedValue({
    id: "deck_1",
    userId: "user_1",
    name: "Test Deck",
    commanderCardId: commander.id,
    commanderCard: commander,
    cards: deckCards,
  });
}

describe("suggestCards", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    collectionFindManyMock.mockReset();
    getLlmProviderMock.mockReset();
  });

  it("throws when the deck does not exist", async () => {
    deckFindUniqueMock.mockResolvedValue(null);

    await expect(suggestCards("deck_1")).rejects.toThrow(CardSuggestionError);
  });

  it("throws when the deck has no commander set", async () => {
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      commanderCardId: null,
      commanderCard: null,
      cards: [],
    });

    await expect(suggestCards("deck_1")).rejects.toThrow(CardSuggestionError);
  });

  it("filters out an off-color owned suggestion", async () => {
    mockDeck([]);
    const offColor = card({
      id: "off_color",
      name: "Off Color Card",
      colorIdentity: ["R"],
    });
    collectionFindManyMock.mockResolvedValue([
      { cardId: offColor.id, card: offColor, quantity: 1 },
    ]);
    mockCompletion(offColor.name as string);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([]);
  });

  it("filters out a suggestion that is already fully in the deck (no remaining availability)", async () => {
    const usedUp = card({ id: "used_up", name: "Used Up Card", colorIdentity: ["W"] });
    mockDeck([{ cardId: usedUp.id, quantity: 1, isCommander: false }]);
    collectionFindManyMock.mockResolvedValue([
      { cardId: usedUp.id, card: usedUp, quantity: 1 },
    ]);
    mockCompletion(usedUp.name as string);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([]);
  });

  it("keeps a valid remaining-owned suggestion", async () => {
    const validCard = card({ id: "valid_card", name: "Valid Card", colorIdentity: ["W"] });
    mockDeck([]);
    collectionFindManyMock.mockResolvedValue([
      { cardId: validCard.id, card: validCard, quantity: 1 },
    ]);
    mockCompletion(validCard.name as string);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([validCard]);
  });

  it("sums quantity across multiple CollectionEntry rows for the same card (e.g. foil + non-foil)", async () => {
    const partiallyUsed = card({
      id: "partially_used",
      name: "Partially Used Card",
      colorIdentity: ["W"],
    });
    mockDeck([{ cardId: partiallyUsed.id, quantity: 1, isCommander: false }]);
    collectionFindManyMock.mockResolvedValue([
      { cardId: partiallyUsed.id, card: partiallyUsed, quantity: 1 },
      { cardId: partiallyUsed.id, card: partiallyUsed, quantity: 1 },
    ]);
    mockCompletion(partiallyUsed.name as string);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([partiallyUsed]);
  });

  it("returns an empty list without calling the LLM when there is no remaining-owned pool", async () => {
    mockDeck([]);
    collectionFindManyMock.mockResolvedValue([]);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([]);
    expect(getLlmProviderMock).not.toHaveBeenCalled();
  });
});
