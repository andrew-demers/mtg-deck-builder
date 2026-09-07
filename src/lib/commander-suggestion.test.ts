import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
import { suggestCommander } from "@/lib/commander-suggestion";

const findManyMock = prisma.collectionEntry.findMany as unknown as ReturnType<typeof vi.fn>;
const getLlmProviderMock = getLlmProvider as unknown as ReturnType<typeof vi.fn>;

function eligibleEntry(cardOverrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "entry_1",
    userId: "user_1",
    cardId: "card_1",
    quantity: 1,
    foil: false,
    card: {
      id: "card_1",
      name: "Atraxa, Praetors' Voice",
      manaCost: "{G}{W}{U}{B}",
      manaValue: 4,
      colors: ["G", "W", "U", "B"],
      colorIdentity: ["G", "W", "U", "B"],
      type: "Legendary Creature — Phyrexian Angel Horror",
      types: ["Creature"],
      supertypes: ["Legendary"],
      subtypes: ["Phyrexian", "Angel", "Horror"],
      oracleText: null,
      legalities: {},
      scryfallOracleId: null,
      isCommanderEligible: true,
      ...cardOverrides,
    },
  };
}

describe("suggestCommander", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    getLlmProviderMock.mockReset();
  });

  it("returns the matched card when the LLM suggests one of the user's eligible cards", async () => {
    const entry = eligibleEntry();
    findManyMock.mockResolvedValue([entry]);
    const completeMock = vi.fn().mockResolvedValue("Atraxa, Praetors' Voice");
    getLlmProviderMock.mockReturnValue({ complete: completeMock });

    const result = await suggestCommander("user_1");

    expect(result).toEqual({ success: true, card: entry.card });
    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user_1", card: { isCommanderEligible: true } },
      include: { card: true },
    });
  });

  it("matches case-insensitively and ignores surrounding whitespace", async () => {
    const entry = eligibleEntry();
    findManyMock.mockResolvedValue([entry]);
    const completeMock = vi.fn().mockResolvedValue("  atraxa, praetors' voice  \n");
    getLlmProviderMock.mockReturnValue({ complete: completeMock });

    const result = await suggestCommander("user_1");

    expect(result).toEqual({ success: true, card: entry.card });
  });

  it("rejects a hallucinated commander name that does not match any owned card", async () => {
    const entry = eligibleEntry();
    findManyMock.mockResolvedValue([entry]);
    const completeMock = vi.fn().mockResolvedValue("Some Card The User Does Not Own");
    getLlmProviderMock.mockReturnValue({ complete: completeMock });

    const result = await suggestCommander("user_1");

    expect(result).toEqual({
      success: false,
      error: "The suggested commander does not match any card you own.",
    });
  });

  it("returns an error result when the user has no commander-eligible cards", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await suggestCommander("user_1");

    expect(result).toEqual({
      success: false,
      error: "You have no commander-eligible cards in your collection.",
    });
    expect(getLlmProviderMock).not.toHaveBeenCalled();
  });
});
