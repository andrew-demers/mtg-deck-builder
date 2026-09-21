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
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  getLlmProvider: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { buildDeck, DeckBuildError } from "@/lib/deck-builder";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const collectionFindManyMock = prisma.collectionEntry.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const cardFindManyMock = prisma.card.findMany as unknown as ReturnType<typeof vi.fn>;
const cardFindFirstMock = prisma.card.findFirst as unknown as ReturnType<typeof vi.fn>;
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

function makeOwnedPool(count: number, colorIdentity: string[]): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) =>
    card({
      id: `owned_${index}`,
      name: `Owned Card ${index}`,
      colorIdentity,
    }),
  );
}

function plains(): Record<string, unknown> {
  return card({
    id: "plains",
    name: "Plains",
    colorIdentity: ["W"],
    type: "Basic Land — Plains",
  });
}

function mockCompletion(text: string) {
  getLlmProviderMock.mockReturnValue({ complete: vi.fn().mockResolvedValue(text) });
}

function mockDeckAndCollection(
  entries: Record<string, unknown>[],
  deckCards: Record<string, unknown>[] = [],
) {
  deckFindUniqueMock.mockResolvedValue({
    id: "deck_1",
    userId: "user_1",
    name: "Test Deck",
    commanderCardId: commander.id,
    commanderCard: commander,
    cards: deckCards,
  });
  collectionFindManyMock.mockResolvedValue(entries.map((c) => ({ card: c })));
}

describe("buildDeck", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    collectionFindManyMock.mockReset();
    cardFindManyMock.mockReset();
    cardFindFirstMock.mockReset();
    getLlmProviderMock.mockReset();
  });

  it("throws when the deck has no commander set", async () => {
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      name: "Test Deck",
      commanderCardId: null,
      commanderCard: null,
    });

    await expect(buildDeck("deck_1")).rejects.toThrow(DeckBuildError);
  });

  it("accepts all 99 LLM picks when every pick is legal and owned", async () => {
    const owned = makeOwnedPool(99, ["W", "U", "B", "G"]);
    mockDeckAndCollection(owned);
    mockCompletion(owned.map((c) => c.name as string).join("\n"));

    const result = await buildDeck("deck_1");

    expect(result.cards).toHaveLength(100);
    const commanderEntry = result.cards.find((c) => c.isCommander);
    expect(commanderEntry).toEqual({ cardId: "commander", quantity: 1, isCommander: true });

    const total = result.cards.reduce((sum, c) => sum + c.quantity, 0);
    expect(total).toBe(100);

    const nonCommanderCardIds = result.cards.filter((c) => !c.isCommander).map((c) => c.cardId);
    expect(new Set(nonCommanderCardIds).size).toBe(99);
  });

  it("drops off-color and duplicate picks, backfilling the shortfall with owned basic lands", async () => {
    const legalOwned = makeOwnedPool(50, ["W", "U", "B", "G"]);
    const offColor = card({
      id: "off_color",
      name: "Off Color Card",
      colorIdentity: ["R"],
    });
    const land = plains();
    mockDeckAndCollection([...legalOwned, offColor, land]);

    const picks = [
      ...legalOwned.map((c) => c.name as string),
      // duplicate of an already-picked legal card - should be dropped
      legalOwned[0].name as string,
      // off-color - should be dropped
      offColor.name as string,
      // hallucinated name not in the owned pool - should be dropped
      "Card That Does Not Exist",
    ];
    mockCompletion(picks.join("\n"));

    const result = await buildDeck("deck_1");

    const total = result.cards.reduce((sum, c) => sum + c.quantity, 0);
    expect(total).toBe(100);

    const offColorEntry = result.cards.find((c) => c.cardId === "off_color");
    expect(offColorEntry).toBeUndefined();

    const landEntry = result.cards.find((c) => c.cardId === "plains");
    expect(landEntry?.quantity).toBe(100 - 1 - legalOwned.length);
  });

  it("backfills with basic lands when the LLM's picks fall short of 99", async () => {
    const legalOwned = makeOwnedPool(30, ["W", "U", "B", "G"]);
    const land = plains();
    mockDeckAndCollection([...legalOwned, land]);
    mockCompletion(legalOwned.map((c) => c.name as string).join("\n"));

    const result = await buildDeck("deck_1");

    const total = result.cards.reduce((sum, c) => sum + c.quantity, 0);
    expect(total).toBe(100);

    const landEntry = result.cards.find((c) => c.cardId === "plains");
    expect(landEntry?.quantity).toBe(99 - legalOwned.length);
  });

  it("throws when picks fall short and the user owns no basic lands to backfill with", async () => {
    const legalOwned = makeOwnedPool(10, ["W", "U", "B", "G"]);
    mockDeckAndCollection(legalOwned);
    mockCompletion(legalOwned.map((c) => c.name as string).join("\n"));

    await expect(buildDeck("deck_1")).rejects.toThrow(DeckBuildError);
  });

  it("accepts a pick within a partner commander's color identity that the active commander alone wouldn't allow", async () => {
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
    const land = plains();

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
    collectionFindManyMock.mockResolvedValue([blueCard, land].map((c) => ({ card: c })));
    mockCompletion(blueCard.name as string);

    const result = await buildDeck("deck_1");

    const blueEntry = result.cards.find((c) => c.cardId === "blue_card");
    expect(blueEntry).toBeDefined();
  });

  it("does not query the catalog when allowUnowned is false", async () => {
    const owned = makeOwnedPool(99, ["W", "U", "B", "G"]);
    mockDeckAndCollection(owned);
    mockCompletion(owned.map((c) => c.name as string).join("\n"));

    await buildDeck("deck_1");

    expect(cardFindManyMock).not.toHaveBeenCalled();
  });

  it("accepts an unowned pick from the catalog when allowUnowned is true", async () => {
    const owned = makeOwnedPool(50, ["W", "U", "B", "G"]);
    const unowned = card({
      id: "unowned_card",
      name: "Unowned Card",
      colorIdentity: ["W"],
    });
    const land = plains();
    mockDeckAndCollection(owned);
    cardFindManyMock.mockResolvedValue([unowned]);
    cardFindFirstMock.mockResolvedValue(land);
    mockCompletion([...owned.map((c) => c.name as string), unowned.name as string].join("\n"));

    const result = await buildDeck("deck_1", { allowUnowned: true });

    expect(cardFindManyMock).toHaveBeenCalled();
    const unownedEntry = result.cards.find((c) => c.cardId === "unowned_card");
    expect(unownedEntry).toEqual({ cardId: "unowned_card", quantity: 1, isCommander: false });
  });

  it("backfills from the catalog when allowUnowned is true and the user owns no basic lands", async () => {
    const owned = makeOwnedPool(10, ["W", "U", "B", "G"]);
    const catalogLand = card({
      id: "catalog_plains",
      name: "Plains",
      colorIdentity: ["W"],
      type: "Basic Land — Plains",
    });
    mockDeckAndCollection(owned);
    cardFindManyMock.mockResolvedValue([]);
    cardFindFirstMock.mockResolvedValue(catalogLand);
    mockCompletion(owned.map((c) => c.name as string).join("\n"));

    const result = await buildDeck("deck_1", { allowUnowned: true });

    const landEntry = result.cards.find((c) => c.cardId === "catalog_plains");
    expect(landEntry?.quantity).toBe(99 - owned.length);
  });

  it("does not backfill with an owned basic land outside the commander's color identity", async () => {
    const monoRedCommander = card({
      id: "smaug",
      name: "Smaug, the Magnificent",
      colorIdentity: ["R"],
      isCommanderEligible: true,
    });
    const legalOwned = makeOwnedPool(3, ["R"]);
    const offColorLand = card({
      id: "island",
      name: "Island",
      colorIdentity: ["U"],
      type: "Basic Land — Island",
    });

    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      name: "Test Deck",
      commanderCardId: monoRedCommander.id,
      commanderCard: monoRedCommander,
      cards: [],
    });
    collectionFindManyMock.mockResolvedValue(
      [...legalOwned, offColorLand].map((c) => ({ card: c })),
    );
    mockCompletion(legalOwned.map((c) => c.name as string).join("\n"));

    await expect(buildDeck("deck_1")).rejects.toThrow(DeckBuildError);
  });

  it("backfills from the catalog instead of an off-color owned land when allowUnowned is true", async () => {
    const monoRedCommander = card({
      id: "smaug",
      name: "Smaug, the Magnificent",
      colorIdentity: ["R"],
      isCommanderEligible: true,
    });
    const legalOwned = makeOwnedPool(3, ["R"]);
    const offColorLand = card({
      id: "island",
      name: "Island",
      colorIdentity: ["U"],
      type: "Basic Land — Island",
    });
    const catalogMountain = card({
      id: "catalog_mountain",
      name: "Mountain",
      colorIdentity: ["R"],
      type: "Basic Land — Mountain",
    });

    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      userId: "user_1",
      name: "Test Deck",
      commanderCardId: monoRedCommander.id,
      commanderCard: monoRedCommander,
      cards: [],
    });
    collectionFindManyMock.mockResolvedValue(
      [...legalOwned, offColorLand].map((c) => ({ card: c })),
    );
    cardFindManyMock.mockResolvedValue([]);
    cardFindFirstMock.mockResolvedValue(catalogMountain);
    mockCompletion(legalOwned.map((c) => c.name as string).join("\n"));

    const result = await buildDeck("deck_1", { allowUnowned: true });

    const islandEntry = result.cards.find((c) => c.cardId === "island");
    expect(islandEntry).toBeUndefined();
    const mountainEntry = result.cards.find((c) => c.cardId === "catalog_mountain");
    expect(mountainEntry?.quantity).toBe(99 - legalOwned.length);
  });

  it("throws when allowUnowned is true but no basic land exists anywhere to backfill with", async () => {
    const owned = makeOwnedPool(10, ["W", "U", "B", "G"]);
    mockDeckAndCollection(owned);
    cardFindManyMock.mockResolvedValue([]);
    cardFindFirstMock.mockResolvedValue(null);
    mockCompletion(owned.map((c) => c.name as string).join("\n"));

    await expect(buildDeck("deck_1", { allowUnowned: true })).rejects.toThrow(DeckBuildError);
  });
});
