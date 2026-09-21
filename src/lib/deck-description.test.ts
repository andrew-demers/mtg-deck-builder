import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  getLlmProvider: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { describeDeck, DeckDescriptionError } from "@/lib/deck-description";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const getLlmProviderMock = getLlmProvider as unknown as ReturnType<typeof vi.fn>;

function deckCard(name: string, quantity = 1, isCommander = false) {
  return { quantity, isCommander, card: { name } };
}

describe("describeDeck", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    getLlmProviderMock.mockReset();
  });

  it("throws when the deck does not exist", async () => {
    deckFindUniqueMock.mockResolvedValue(null);

    await expect(describeDeck("deck_1")).rejects.toThrow(DeckDescriptionError);
  });

  it("throws when the deck has no commander set", async () => {
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      commanderCard: null,
      cards: [],
    });

    await expect(describeDeck("deck_1")).rejects.toThrow(DeckDescriptionError);
  });

  it("passes a prompt including the commander and card names, and returns the response unmodified", async () => {
    deckFindUniqueMock.mockResolvedValue({
      id: "deck_1",
      commanderCard: { name: "Atraxa, Praetors' Voice" },
      cards: [
        deckCard("Atraxa, Praetors' Voice", 1, true),
        deckCard("Sol Ring"),
        deckCard("Plains", 40),
      ],
    });
    const completeMock = vi
      .fn()
      .mockResolvedValue("This deck wins by grinding out value with counters and superfriends.");
    getLlmProviderMock.mockReturnValue({ complete: completeMock });

    const result = await describeDeck("deck_1");

    expect(result).toBe("This deck wins by grinding out value with counters and superfriends.");
    expect(completeMock).toHaveBeenCalledTimes(1);
    const prompt = completeMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Atraxa, Praetors' Voice");
    expect(prompt).toContain("Sol Ring");
    expect(prompt).toContain("Plains");
    expect(prompt).toContain("win condition");
  });
});
