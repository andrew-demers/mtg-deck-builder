import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    collectionEntry: {
      findMany: vi.fn(),
    },
    card: {
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
const cardFindManyMock = prisma.card.findMany as unknown as ReturnType<typeof vi.fn>;
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

function mockSuggestion(name: string, tag = "Synergy", reason = "Fits the deck's plan.") {
  mockCompletion(`${name} :: ${tag} :: ${reason}`);
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
    cardFindManyMock.mockReset();
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
    mockSuggestion(offColor.name as string);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([]);
  });

  it("filters out a suggestion that is already fully in the deck (no remaining availability)", async () => {
    const usedUp = card({ id: "used_up", name: "Used Up Card", colorIdentity: ["W"] });
    mockDeck([{ cardId: usedUp.id, quantity: 1, isCommander: false }]);
    collectionFindManyMock.mockResolvedValue([
      { cardId: usedUp.id, card: usedUp, quantity: 1 },
    ]);
    mockSuggestion(usedUp.name as string);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([]);
  });

  it("keeps a valid remaining-owned suggestion", async () => {
    const validCard = card({ id: "valid_card", name: "Valid Card", colorIdentity: ["W"] });
    mockDeck([]);
    collectionFindManyMock.mockResolvedValue([
      { cardId: validCard.id, card: validCard, quantity: 1 },
    ]);
    mockSuggestion(validCard.name as string, "Ramp", "Helps ramp into the commander's high cost.");

    const result = await suggestCards("deck_1");

    expect(result).toEqual([
      { card: validCard, tag: "Ramp", reason: "Helps ramp into the commander's high cost." },
    ]);
  });

  it("sums quantity across multiple CollectionEntry rows for the same card (e.g. foil + non-foil)", async () => {
    const owned = card({
      id: "owned_twice",
      name: "Owned Twice Card",
      colorIdentity: ["W"],
    });
    mockDeck([]);
    collectionFindManyMock.mockResolvedValue([
      { cardId: owned.id, card: owned, quantity: 1 },
      { cardId: owned.id, card: owned, quantity: 1 },
    ]);
    mockSuggestion(owned.name as string);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([{ card: owned, tag: "Synergy", reason: "Fits the deck's plan." }]);
  });

  it("does not re-suggest a nonbasic card already in the deck even when further copies are owned (singleton rule)", async () => {
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
    mockSuggestion(partiallyUsed.name as string);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([]);
  });

  it("keeps suggesting a basic land already in the deck as long as unused copies are owned", async () => {
    const basicLand = card({
      id: "basic_land",
      name: "Forest",
      colorIdentity: ["G"],
      type: "Basic Land — Forest",
    });
    mockDeck([{ cardId: basicLand.id, quantity: 1, isCommander: false }]);
    collectionFindManyMock.mockResolvedValue([
      { cardId: basicLand.id, card: basicLand, quantity: 3 },
    ]);
    mockSuggestion(basicLand.name as string, "Land", "Keeps land drops consistent.");

    const result = await suggestCards("deck_1");

    expect(result).toEqual([
      { card: basicLand, tag: "Land", reason: "Keeps land drops consistent." },
    ]);
  });

  it("accepts a suggestion within a partner commander's color identity that the active commander alone wouldn't allow", async () => {
    const commanderA = card({
      id: "cmd_a",
      name: "Commander A",
      colorIdentity: ["W"],
      isCommanderEligible: true,
    });
    const commanderB = card({
      id: "cmd_b",
      name: "Commander B",
      colorIdentity: ["U"],
      isCommanderEligible: true,
    });
    const blueCard = card({ id: "blue_card", name: "Blue Card", colorIdentity: ["U"] });

    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      name: "Test Deck",
      commanderCardId: commanderA.id,
      commanderCard: commanderA,
      cards: [
        { cardId: commanderA.id, quantity: 1, isCommander: true, card: commanderA },
        { cardId: commanderB.id, quantity: 1, isCommander: true, card: commanderB },
      ],
    });
    collectionFindManyMock.mockResolvedValue([
      { cardId: blueCard.id, card: blueCard, quantity: 1 },
    ]);
    mockSuggestion(blueCard.name as string);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([
      { card: blueCard, tag: "Synergy", reason: "Fits the deck's plan." },
    ]);
  });

  it("returns an empty list without calling the LLM when there is no remaining-owned pool", async () => {
    mockDeck([]);
    collectionFindManyMock.mockResolvedValue([]);

    const result = await suggestCards("deck_1");

    expect(result).toEqual([]);
    expect(getLlmProviderMock).not.toHaveBeenCalled();
  });

  it("does not query the catalog when allowUnowned is false", async () => {
    mockDeck([]);
    const validCard = card({ id: "valid_card", name: "Valid Card", colorIdentity: ["W"] });
    collectionFindManyMock.mockResolvedValue([
      { cardId: validCard.id, card: validCard, quantity: 1 },
    ]);
    mockSuggestion(validCard.name as string);

    await suggestCards("deck_1");

    expect(cardFindManyMock).not.toHaveBeenCalled();
  });

  it("accepts an unowned catalog suggestion when allowUnowned is true", async () => {
    mockDeck([]);
    const unowned = card({ id: "unowned_card", name: "Unowned Card", colorIdentity: ["W"] });
    collectionFindManyMock.mockResolvedValue([]);
    cardFindManyMock.mockResolvedValue([unowned]);
    mockSuggestion(unowned.name as string, "Synergy", "Great with the commander's plan.");

    const result = await suggestCards("deck_1", { allowUnowned: true });

    expect(cardFindManyMock).toHaveBeenCalled();
    expect(result).toEqual([
      { card: unowned, tag: "Synergy", reason: "Great with the commander's plan." },
    ]);
  });

  it("excludes the commander and already-used cards from the catalog pool when allowUnowned is true", async () => {
    const usedUp = card({ id: "used_up", name: "Used Up Card", colorIdentity: ["W"] });
    mockDeck([{ cardId: usedUp.id, quantity: 1, isCommander: false }]);
    collectionFindManyMock.mockResolvedValue([]);
    cardFindManyMock.mockResolvedValue([]);

    await suggestCards("deck_1", { allowUnowned: true });

    const excludeIds = cardFindManyMock.mock.calls[0][0].where.id.notIn;
    expect(excludeIds).toEqual(expect.arrayContaining([commander.id, usedUp.id]));
  });

  it("returns an empty list without calling the LLM when both pools are empty, even with allowUnowned", async () => {
    mockDeck([]);
    collectionFindManyMock.mockResolvedValue([]);
    cardFindManyMock.mockResolvedValue([]);

    const result = await suggestCards("deck_1", { allowUnowned: true });

    expect(result).toEqual([]);
    expect(getLlmProviderMock).not.toHaveBeenCalled();
  });

  it("asks the LLM for enough suggestions to fill the remaining deck slots", async () => {
    const filler = card({ id: "filler", name: "Filler Card", colorIdentity: ["W"] });
    // 95 cards already in the deck (via one bulky DeckCard row) leaves 5 slots to fill.
    mockDeck([{ cardId: "bulk", quantity: 95, isCommander: false, card: filler }]);
    collectionFindManyMock.mockResolvedValue([{ cardId: filler.id, card: filler, quantity: 1 }]);
    const completeMock = vi.fn().mockResolvedValue(`${filler.name} :: Synergy :: Fits the plan.`);
    getLlmProviderMock.mockReturnValue({ complete: completeMock });

    await suggestCards("deck_1");

    const prompt = completeMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Suggest exactly 1 card ");
  });

  it("caps the requested suggestion count at the available pool size", async () => {
    const filler = card({ id: "filler", name: "Filler Card", colorIdentity: ["W"] });
    mockDeck([]); // 0 cards in the deck leaves 100 slots to fill, but the pool only has 1 card.
    collectionFindManyMock.mockResolvedValue([{ cardId: filler.id, card: filler, quantity: 1 }]);
    const completeMock = vi.fn().mockResolvedValue(`${filler.name} :: Synergy :: Fits the plan.`);
    getLlmProviderMock.mockReturnValue({ complete: completeMock });

    await suggestCards("deck_1");

    const prompt = completeMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Suggest exactly 1 card ");
  });

  it("falls back to a default suggestion count when the deck is already full", async () => {
    const filler = card({ id: "filler", name: "Filler Card", colorIdentity: ["W"] });
    mockDeck([{ cardId: "bulk", quantity: 100, isCommander: false, card: filler }]);
    collectionFindManyMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        cardId: `owned_${i}`,
        card: card({ id: `owned_${i}`, name: `Owned Card ${i}`, colorIdentity: ["W"] }),
        quantity: 1,
      })),
    );
    const completeMock = vi.fn().mockResolvedValue("Owned Card 0 :: Synergy :: Fits the plan.");
    getLlmProviderMock.mockReturnValue({ complete: completeMock });

    await suggestCards("deck_1");

    const prompt = completeMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Suggest exactly 10 cards ");
  });
});
