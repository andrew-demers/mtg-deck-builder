import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/llm", () => ({
  getLlmProvider: vi.fn(),
}));

vi.mock("@/lib/deck-grade", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deck-grade")>("@/lib/deck-grade");
  return { ...actual, gradeDeck: vi.fn() };
});

import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { GRADE_CATEGORIES, gradeDeck, type GradeInput } from "@/lib/deck-grade";
import { suggestCuts, CardCutError } from "@/lib/card-cuts";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const getLlmProviderMock = getLlmProvider as unknown as ReturnType<typeof vi.fn>;
const gradeDeckMock = gradeDeck as unknown as ReturnType<typeof vi.fn>;

function raisingGrade(input: GradeInput) {
  const score = input.previous ? input.previous.score + 4 : 60;
  return {
    score,
    breakdown: GRADE_CATEGORIES.map((category) => ({ category, score, note: "Note." })),
    summary: "Summary.",
  };
}

function card(id: string, name: string, type = "Creature"): Record<string, unknown> {
  return { id, name, type, colorIdentity: ["W"], oracleText: null };
}

const commander = card("commander", "Commander");
const forest = card("forest", "Plains", "Basic Land - Plains");

/** A deck of `total` cards: commander, a basic land stack and two named spells. */
function mockDeck(total: number, cardDecisions: unknown = null) {
  deckFindUniqueMock.mockResolvedValue({
    id: "deck_1",
    commanderCardId: "commander",
    commanderCard: commander,
    cards: [
      { cardId: "commander", quantity: 1, isCommander: true, card: commander },
      { cardId: "forest", quantity: total - 3, isCommander: false, card: forest },
      { cardId: "a", quantity: 1, isCommander: false, card: card("a", "Old A") },
      { cardId: "b", quantity: 1, isCommander: false, card: card("b", "Old B") },
    ],
    cardDecisions,
  });
}

function mockLlm(response: string) {
  const complete = vi.fn().mockResolvedValue(response);
  getLlmProviderMock.mockReturnValue({ complete });
  return complete;
}

describe("suggestCuts", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    getLlmProviderMock.mockReset();
    gradeDeckMock.mockReset();
    gradeDeckMock.mockImplementation(raisingGrade);
  });

  it("rejects a deck of 100 cards or fewer", async () => {
    mockDeck(100);
    await expect(suggestCuts("deck_1")).rejects.toBeInstanceOf(CardCutError);
  });

  it("asks for exactly the excess and returns matching cards", async () => {
    mockDeck(102);
    const complete = mockLlm("old a :: Weak.\nOld B :: Also weak.");

    const cuts = await suggestCuts("deck_1");

    expect(cuts.map((cut) => cut.card.id)).toEqual(["a", "b"]);
    expect(complete.mock.calls[0][0]).toContain("exactly 2 cards");
  });

  it("drops unknown, duplicate, basic land and commander names and caps at the excess", async () => {
    mockDeck(101);
    mockLlm("Made Up :: x\nPlains :: x\nCommander :: x\nOld A :: ok\nOld A :: dup\nOld B :: extra");

    const cuts = await suggestCuts("deck_1");

    expect(cuts.map((cut) => cut.card.id)).toEqual(["a"]);
  });

  it("does not offer a card the player just added when other cards can be cut", async () => {
    mockDeck(101, { cuts: [], adds: [{ id: "a", name: "Old A" }] });
    const complete = mockLlm("Old A :: Just added.\nOld B :: Weak.");

    const cuts = await suggestCuts("deck_1");

    expect(cuts.map((cut) => cut.card.id)).toEqual(["b"]);
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).toContain("Do not recommend cutting: Old A");
    expect(prompt).not.toContain("- Old A (");
  });

  it("can still cut a just-added card when nothing else covers the surplus", async () => {
    mockDeck(102, { cuts: [], adds: [{ id: "a", name: "Old A" }] });
    const complete = mockLlm("Old A :: Last resort.\nOld B :: Weak.");

    const cuts = await suggestCuts("deck_1");

    expect(cuts.map((cut) => cut.card.id)).toEqual(["a", "b"]);
    expect(complete.mock.calls[0][0]).toContain("Cut those only if you cannot reach 2 cuts");
    expect(complete.mock.calls[0][0]).toContain("current overall grade is 60 out of 100");
  });

  it("drops a cut that does not raise the deck's grade", async () => {
    mockDeck(102);
    mockLlm("Old A :: Weak.\nOld B :: Also weak.");
    gradeDeckMock.mockImplementation(async (input: GradeInput) => {
      const removed = input.previous?.removed ?? [];
      const score = removed.includes("Old A") ? 64 : 60;
      return {
        score,
        breakdown: GRADE_CATEGORIES.map((category) => ({ category, score, note: "Note." })),
        summary: "Summary.",
      };
    });

    const cuts = await suggestCuts("deck_1");

    expect(cuts.map((cut) => cut.card.name)).toEqual(["Old A"]);
    expect(cuts[0].reason).toContain("Raises the grade from 60 to 64.");
  });
});
