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
import { suggestCommandersForPreferences, DeckWizardError } from "@/lib/deck-wizard";

const findManyMock = prisma.collectionEntry.findMany as unknown as ReturnType<typeof vi.fn>;
const getLlmProviderMock = getLlmProvider as unknown as ReturnType<typeof vi.fn>;

function card(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? "card_x",
    name: overrides.name ?? "Card X",
    manaCost: null,
    manaValue: 1,
    colors: [],
    colorIdentity: ["W"],
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

function mockCompletion(text: string) {
  getLlmProviderMock.mockReturnValue({ complete: vi.fn().mockResolvedValue(text) });
}

const preferences = { winCondition: "Combat damage", pace: "Fast and aggressive" };

describe("suggestCommandersForPreferences", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    getLlmProviderMock.mockReset();
  });

  it("throws when the user has no commander-eligible cards", async () => {
    findManyMock.mockResolvedValue([]);

    await expect(suggestCommandersForPreferences("user_1", preferences)).rejects.toThrow(
      DeckWizardError,
    );
    expect(getLlmProviderMock).not.toHaveBeenCalled();
    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user_1", card: { isCommanderEligible: true } },
      include: { card: true },
    });
  });

  it("returns matched owned commanders with their reason", async () => {
    const commanderCard = card({
      id: "cmd_1",
      name: "Krenko, Mob Boss",
      isCommanderEligible: true,
    });
    findManyMock.mockResolvedValue([{ card: commanderCard }]);
    mockCompletion("Krenko, Mob Boss :: Builds a wide board that swings for lethal quickly.");

    const result = await suggestCommandersForPreferences("user_1", preferences);

    expect(result).toEqual([
      { card: commanderCard, reason: "Builds a wide board that swings for lethal quickly." },
    ]);
  });

  it("drops a hallucinated commander name that does not match any owned card", async () => {
    const commanderCard = card({
      id: "cmd_1",
      name: "Krenko, Mob Boss",
      isCommanderEligible: true,
    });
    findManyMock.mockResolvedValue([{ card: commanderCard }]);
    mockCompletion("Some Card The User Does Not Own :: Sounds great.");

    const result = await suggestCommandersForPreferences("user_1", preferences);

    expect(result).toEqual([]);
  });
});
