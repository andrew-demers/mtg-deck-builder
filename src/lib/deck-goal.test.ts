import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { deck: { findUnique: vi.fn() } } }));

const completeMock = vi.fn();
vi.mock("@/lib/llm", () => ({ getLlmProvider: () => ({ complete: completeMock }) }));

import { prisma } from "@/lib/prisma";
import { DeckGoalError, draftDeckGoal } from "@/lib/deck-goal";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;

const commanderCard = { name: "Kinnan" };
const cards = [
  { quantity: 1, isCommander: true, card: { name: "Kinnan" } },
  { quantity: 1, isCommander: false, card: { name: "Sol Ring" } },
  { quantity: 5, isCommander: false, card: { name: "Forest" } },
];

describe("draftDeckGoal", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    completeMock.mockReset();
  });

  it("throws when the deck is missing, has no commander, or has no cards", async () => {
    deckFindUniqueMock.mockResolvedValueOnce(null);
    await expect(draftDeckGoal("d")).rejects.toThrow(DeckGoalError);

    deckFindUniqueMock.mockResolvedValueOnce({ commanderCard: null, cards });
    await expect(draftDeckGoal("d")).rejects.toThrow("no commander");

    deckFindUniqueMock.mockResolvedValueOnce({ commanderCard, cards: [] });
    await expect(draftDeckGoal("d")).rejects.toThrow("Build the deck");
  });

  it("prompts with the commander, non-commander cards, and description, and trims the reply", async () => {
    deckFindUniqueMock.mockResolvedValue({ commanderCard, cards, description: "Ramp into hoof." });
    completeMock.mockResolvedValue("  Win by turn 8 with Craterhoof.\n");

    const goal = await draftDeckGoal("d");

    expect(goal).toBe("Win by turn 8 with Craterhoof.");
    const prompt = completeMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Commander: Kinnan");
    expect(prompt).toContain("- Sol Ring");
    expect(prompt).toContain("- Forest x5");
    expect(prompt).toContain("Ramp into hoof.");
    expect(prompt).not.toContain("- Kinnan");
  });
});
