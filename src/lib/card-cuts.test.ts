import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/llm", () => ({
  getLlmProvider: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { suggestCuts, CardCutError } from "@/lib/card-cuts";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const getLlmProviderMock = getLlmProvider as unknown as ReturnType<typeof vi.fn>;

function card(id: string, name: string, type = "Creature"): Record<string, unknown> {
  return { id, name, type, colorIdentity: ["W"], oracleText: null };
}

const commander = card("commander", "Commander");
const forest = card("forest", "Plains", "Basic Land - Plains");

/** A deck of `total` cards: commander, a basic land stack and two named spells. */
function mockDeck(total: number) {
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
});
