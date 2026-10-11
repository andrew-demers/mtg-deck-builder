import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
    collectionEntry: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/llm", () => ({
  getLlmProvider: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { suggestReplacements, CardReplacementError } from "@/lib/card-replacement";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const collectionFindManyMock = prisma.collectionEntry.findMany as unknown as ReturnType<typeof vi.fn>;
const getLlmProviderMock = getLlmProvider as unknown as ReturnType<typeof vi.fn>;

function card(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "card_x",
    name: "Card X",
    manaCost: null,
    manaValue: 1,
    colors: [],
    colorIdentity: ["W"],
    type: "Creature",
    types: ["Creature"],
    oracleText: null,
    ...overrides,
  };
}

const commander = card({ id: "commander", name: "Commander", colorIdentity: ["W", "U"] });
const oldA = card({ id: "old_a", name: "Old A" });
const oldB = card({ id: "old_b", name: "Old B" });
const newA = card({ id: "new_a", name: "New A" });
const newB = card({ id: "new_b", name: "New B" });
const offColor = card({ id: "off", name: "Off Color", colorIdentity: ["R"] });

function mockDeck() {
  deckFindUniqueMock.mockResolvedValue({
    id: "deck_1",
    userId: "user_1",
    commanderCardId: "commander",
    commanderCard: commander,
    cards: [
      { cardId: "commander", quantity: 1, isCommander: true, card: commander },
      { cardId: "old_a", quantity: 1, isCommander: false, card: oldA },
      { cardId: "old_b", quantity: 1, isCommander: false, card: oldB },
    ],
  });
}

function mockOwned(...cards: Record<string, unknown>[]) {
  collectionFindManyMock.mockResolvedValue(
    cards.map((owned) => ({ cardId: owned.id, card: owned })),
  );
}

function mockCompletion(text: string) {
  getLlmProviderMock.mockReturnValue({ complete: vi.fn().mockResolvedValue(text) });
}

describe("suggestReplacements", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    collectionFindManyMock.mockReset();
    getLlmProviderMock.mockReset();
  });

  it("rejects an empty selection", async () => {
    await expect(suggestReplacements("deck_1", [])).rejects.toThrow(CardReplacementError);
  });

  it("rejects a card the user does not own", async () => {
    mockDeck();
    mockOwned();

    await expect(suggestReplacements("deck_1", ["new_a"])).rejects.toThrow(/do not own/);
  });

  it("rejects a card outside the commander's color identity", async () => {
    mockDeck();
    mockOwned(offColor);

    await expect(suggestReplacements("deck_1", ["off"])).rejects.toThrow(/color identity/);
  });

  it("rejects a nonbasic card already in the deck", async () => {
    mockDeck();
    mockOwned(oldA);

    await expect(suggestReplacements("deck_1", ["old_a"])).rejects.toThrow(/already in the deck/);
  });

  it("returns matched swaps with full card records", async () => {
    mockDeck();
    mockOwned(newA);
    mockCompletion("New A :: Old B :: Strictly better.");

    const swaps = await suggestReplacements("deck_1", ["new_a"]);

    expect(swaps).toEqual([{ add: newA, remove: oldB, reason: "Strictly better." }]);
  });

  it("never offers or accepts the commander as a cut", async () => {
    mockDeck();
    mockOwned(newA);
    const complete = vi.fn().mockResolvedValue("New A :: Commander :: Cut it.");
    getLlmProviderMock.mockReturnValue({ complete });

    const swaps = await suggestReplacements("deck_1", ["new_a"]);

    expect(swaps).toEqual([]);
    expect(complete.mock.calls[0][0]).not.toContain("- Commander");
  });

  it("drops hallucinated names and reused cuts", async () => {
    mockDeck();
    mockOwned(newA, newB);
    mockCompletion(
      [
        "New A :: Old A :: First.",
        "New B :: Old A :: Same cut again.",
        "Made Up :: Old B :: Not selected.",
        "New B :: Not In Deck :: Unknown cut.",
      ].join("\n"),
    );

    const swaps = await suggestReplacements("deck_1", ["new_a", "new_b"]);

    expect(swaps.map((swap) => [swap.add.id, swap.remove.id])).toEqual([["new_a", "old_a"]]);
  });
});
