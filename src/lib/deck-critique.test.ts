import { describe, expect, it, vi, beforeEach } from "vitest";
import { DEFAULT_GRADE_GOAL } from "@/lib/deck-grade";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
    deckVersion: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/llm", () => ({
  getLlmProvider: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { critiqueAndGradeDeck, critiqueDeck, DeckCritiqueError } from "@/lib/deck-critique";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const getLlmProviderMock = getLlmProvider as unknown as ReturnType<typeof vi.fn>;

function deckCard(name: string, quantity = 1, isCommander = false) {
  return { quantity, isCommander, card: { name } };
}

describe("critiqueDeck", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    getLlmProviderMock.mockReset();
  });

  it("throws when the deck does not exist", async () => {
    deckFindUniqueMock.mockResolvedValue(null);

    await expect(critiqueDeck("deck_1")).rejects.toThrow(DeckCritiqueError);
  });

  it("throws when the deck has no commander set", async () => {
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      commanderCard: null,
      cards: [],
    });

    await expect(critiqueDeck("deck_1")).rejects.toThrow(DeckCritiqueError);
  });

  it("passes a prompt including the commander and card names, and returns the response unmodified", async () => {
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      commanderCard: { name: "Atraxa, Praetors' Voice" },
      cards: [deckCard("Atraxa, Praetors' Voice", 1, true), deckCard("Sol Ring"), deckCard("Plains", 40)],
    });
    const completeMock = vi.fn().mockResolvedValue("This deck has a strong ramp package.");
    getLlmProviderMock.mockReturnValue({ complete: completeMock });

    const result = await critiqueDeck("deck_1");

    expect(result).toBe("This deck has a strong ramp package.");
    expect(completeMock).toHaveBeenCalledTimes(1);
    const prompt = completeMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Atraxa, Praetors' Voice");
    expect(prompt).toContain("Sol Ring");
    expect(prompt).toContain("Plains");
  });
});

describe("critiqueAndGradeDeck", () => {
  const scores = [
    "Goal execution",
    "Consistency",
    "Mana development",
    "Card advantage",
    "Interaction",
    "Resilience",
    "Mana base",
  ]
    .map((category) => `${category} :: 80 :: ok`)
    .join("\n");

  function deckWith(goal: string | null) {
    return {
      id: "deck_1",
      goal,
      commanderCardId: "k",
      commanderCard: { name: "Kinnan" },
      cards: [
        { cardId: "k", quantity: 1, isCommander: true, card: { name: "Kinnan" } },
        { cardId: "s", quantity: 1, isCommander: false, card: { name: "Sol Ring" } },
      ],
    };
  }

  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    getLlmProviderMock.mockReset();
    (prisma.deckVersion.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("returns the critique and a grade from a single LLM call when the deck has a goal", async () => {
    deckFindUniqueMock.mockResolvedValue(deckWith("Combo off"));
    const complete = vi.fn().mockResolvedValue(`${scores}\nSUMMARY :: Fine.\n=== CRITIQUE ===\nGood ramp.`);
    getLlmProviderMock.mockReturnValue({ complete });

    const result = await critiqueAndGradeDeck("deck_1");

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.critique).toBe("Good ramp.");
    expect(result.grade?.score).toBe(80);
    expect(result.grade?.goal).toBe("Combo off");
    expect(result.grade?.signature).toBeTruthy();
  });

  it("grades against the win condition the model infers when the deck has no goal", async () => {
    deckFindUniqueMock.mockResolvedValue(deckWith(null));
    const complete = vi
      .fn()
      .mockResolvedValue(`WIN CONDITION :: Win with tokens.\n${scores}\nSUMMARY :: Fine.\n=== CRITIQUE ===\nGood ramp.`);
    getLlmProviderMock.mockReturnValue({ complete });

    const result = await critiqueAndGradeDeck("deck_1");

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toContain("WIN CONDITION ::");
    expect(result.grade?.goal).toBe("Win with tokens.");
  });

  it("falls back to the default goal when the model omits the win condition", async () => {
    deckFindUniqueMock.mockResolvedValue(deckWith(null));
    const complete = vi.fn().mockResolvedValue(`${scores}\nSUMMARY :: Fine.\n=== CRITIQUE ===\nGood ramp.`);
    getLlmProviderMock.mockReturnValue({ complete });

    expect((await critiqueAndGradeDeck("deck_1")).grade?.goal).toBe(DEFAULT_GRADE_GOAL);
  });
});
