import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { deck: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/llm", () => ({
  getLlmProvider: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { evaluateTokens, parseRecommendations, TokenEvaluationError } from "@/lib/token-evaluation";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const getLlmProviderMock = getLlmProvider as unknown as ReturnType<typeof vi.fn>;

function card(name: string, oracleText: string | null = null, type = "Creature") {
  return { id: name, name, type, supertypes: [], oracleText };
}

describe("parseRecommendations", () => {
  const names = ["Avenger of Zendikar", "Doubling Season"];

  it("parses valid lines and keeps only cards in the deck", () => {
    const result = parseRecommendations(
      "token :: 0/1 Plant :: 12 :: Avenger of Zendikar; Fake Card :: Avenger makes a Plant per land.\n" +
        "2. counter :: +1/+1 counter :: 20 :: doubling season :: Doubled counters add up.",
      names,
    );

    expect(result).toEqual([
      { kind: "token", name: "0/1 Plant", quantity: 12, cards: ["Avenger of Zendikar"], reason: "Avenger makes a Plant per land." },
      { kind: "counter", name: "+1/+1 counter", quantity: 20, cards: ["Doubling Season"], reason: "Doubled counters add up." },
    ]);
  });

  it("drops lines with a bad kind, bad quantity, no real cards, or missing fields", () => {
    const result = parseRecommendations(
      [
        "emblem :: Thing :: 3 :: Doubling Season :: r",
        "token :: Thing :: lots :: Doubling Season :: r",
        "token :: Thing :: 0 :: Doubling Season :: r",
        "token :: Thing :: 3 :: Made Up Card :: r",
        "token :: Thing :: 3 :: Doubling Season",
        "Here are the tokens:",
      ].join("\n"),
      names,
    );

    expect(result).toEqual([]);
  });
});

describe("evaluateTokens", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    getLlmProviderMock.mockReset();
  });

  it("throws when the deck is missing or has no commander", async () => {
    deckFindUniqueMock.mockResolvedValueOnce(null);
    await expect(evaluateTokens("deck_1")).rejects.toThrow(TokenEvaluationError);

    deckFindUniqueMock.mockResolvedValueOnce({ commanderCard: null, cards: [] });
    await expect(evaluateTokens("deck_1")).rejects.toThrow(TokenEvaluationError);
  });

  it("sends every nonbasic card's rules text and returns the parsed recommendations", async () => {
    const complete = vi.fn().mockResolvedValue("token :: Treasure :: 5 :: Smothering Tithe :: It makes Treasure.");
    getLlmProviderMock.mockReturnValue({ complete });
    deckFindUniqueMock.mockResolvedValue({
      commanderCard: card("Cmdr"),
      cards: [
        { card: card("Smothering Tithe", "Whenever an opponent draws a card, create a Treasure token.", "Enchantment") },
        { card: card("Forest", null, "Basic Land"), supertypes: [] },
      ],
    });

    const result = await evaluateTokens("deck_1");

    expect(result).toHaveLength(1);
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).toContain("Smothering Tithe: Whenever an opponent draws a card");
    expect(prompt).not.toContain("- Forest");
  });
});
