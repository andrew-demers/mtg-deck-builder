import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findUnique: vi.fn(), update: vi.fn() },
    deckCard: { deleteMany: vi.fn(), createMany: vi.fn() },
    deckVersion: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const completeMock = vi.fn();
vi.mock("@/lib/llm", () => ({
  getLlmProvider: () => ({ complete: completeMock }),
}));

import { prisma } from "@/lib/prisma";
import { deckSignature } from "@/lib/deck-signature";
import {
  DeckVersionError,
  diffSnapshots,
  draftVersionDescription,
  gradeCurrentDeck,
  hasChanges,
  listDeckVersions,
  restoreDeckVersion,
  saveDeckVersion,
  type DeckSnapshot,
} from "@/lib/deck-version";

const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const versionFindFirstMock = prisma.deckVersion.findFirst as unknown as ReturnType<typeof vi.fn>;
const versionFindManyMock = prisma.deckVersion.findMany as unknown as ReturnType<typeof vi.fn>;
const versionFindUniqueMock = prisma.deckVersion.findUnique as unknown as ReturnType<typeof vi.fn>;
const versionCreateMock = prisma.deckVersion.create as unknown as ReturnType<typeof vi.fn>;
const transactionMock = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function row(cardId: string, quantity = 1, isCommander = false) {
  return { cardId, quantity, isCommander, card: { name: cardId.toUpperCase() } };
}

function stored(cards: ReturnType<typeof row>[], commander: string | null = "atraxa", extra = {}) {
  return {
    commanderCardId: commander,
    commanderCard: commander ? { name: commander.toUpperCase() } : null,
    cards,
    ...extra,
  };
}

function snapshot(commanderName: string | null, cards: [string, number, boolean?][]): DeckSnapshot {
  return {
    commanderName,
    cards: cards.map(([cardId, quantity, isCommander = false]) => ({
      cardId,
      name: cardId.toUpperCase(),
      quantity,
      isCommander,
    })),
  };
}

describe("diffSnapshots", () => {
  it("reports added, removed, and quantity-changed cards sorted by name", () => {
    const before = snapshot("ATRAXA", [
      ["atraxa", 1, true],
      ["sol-ring", 1],
      ["forest", 10],
      ["arcane-signet", 1],
    ]);
    const after = snapshot("ATRAXA", [
      ["atraxa", 1, true],
      ["sol-ring", 1],
      ["forest", 8],
      ["birds", 1],
    ]);

    const changes = diffSnapshots(before, after);

    expect(changes.added).toEqual([{ name: "BIRDS", quantity: 1 }]);
    expect(changes.removed).toEqual([{ name: "ARCANE-SIGNET", quantity: 1 }]);
    expect(changes.changed).toEqual([{ name: "FOREST", from: 10, to: 8 }]);
    expect(changes.commander).toBeNull();
  });

  it("reports a commander change without listing commanders as added or removed", () => {
    const before = snapshot("ATRAXA", [
      ["atraxa", 1, true],
      ["sol-ring", 1],
    ]);
    const after = snapshot("KENRITH", [
      ["kenrith", 1, true],
      ["sol-ring", 1],
    ]);

    const changes = diffSnapshots(before, after);

    expect(changes.commander).toEqual({ from: "ATRAXA", to: "KENRITH" });
    expect(changes.added).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it("treats every non-commander card as added when there is no previous version", () => {
    const changes = diffSnapshots(
      null,
      snapshot("ATRAXA", [
        ["atraxa", 1, true],
        ["sol-ring", 1],
      ]),
    );

    expect(changes.added).toEqual([{ name: "SOL-RING", quantity: 1 }]);
  });

  it("hasChanges is false for identical snapshots", () => {
    const same = snapshot("ATRAXA", [
      ["atraxa", 1, true],
      ["sol-ring", 1],
    ]);

    expect(hasChanges(diffSnapshots(same, same))).toBe(false);
  });
});

describe("saveDeckVersion", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    versionFindFirstMock.mockReset();
    versionCreateMock.mockReset();
  });

  it("rejects a blank description", async () => {
    await expect(saveDeckVersion("deck_1", "   ")).rejects.toThrow("description of what changed");
    expect(versionCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a deck with no cards", async () => {
    deckFindUniqueMock.mockResolvedValue(stored([]));

    await expect(saveDeckVersion("deck_1", "x")).rejects.toThrow("Build the deck");
  });

  it("rejects a deck identical to its latest version", async () => {
    deckFindUniqueMock.mockResolvedValue(stored([row("atraxa", 1, true), row("sol-ring")]));
    versionFindFirstMock.mockResolvedValue(
      stored([row("atraxa", 1, true), row("sol-ring")], "atraxa", { number: 1 }),
    );

    await expect(saveDeckVersion("deck_1", "x")).rejects.toBeInstanceOf(DeckVersionError);
    expect(versionCreateMock).not.toHaveBeenCalled();
  });

  it("saves version 1 with the deck's cards when there are no versions yet", async () => {
    deckFindUniqueMock.mockResolvedValue(stored([row("atraxa", 1, true), row("sol-ring")]));
    versionFindFirstMock.mockResolvedValue(null);
    versionCreateMock.mockResolvedValue({ id: "v1" });

    await saveDeckVersion("deck_1", "  Initial build  ");

    const data = versionCreateMock.mock.calls[0][0].data;
    expect(data.number).toBe(1);
    expect(data.description).toBe("Initial build");
    expect(data.commanderCardId).toBe("atraxa");
    expect(data.cards.create).toEqual([
      { cardId: "atraxa", quantity: 1, isCommander: true },
      { cardId: "sol-ring", quantity: 1, isCommander: false },
    ]);
  });

  it("numbers the next version after the latest", async () => {
    deckFindUniqueMock.mockResolvedValue(stored([row("atraxa", 1, true), row("birds")]));
    versionFindFirstMock.mockResolvedValue(
      stored([row("atraxa", 1, true), row("sol-ring")], "atraxa", { number: 4 }),
    );
    versionCreateMock.mockResolvedValue({ id: "v5" });

    await saveDeckVersion("deck_1", "Swapped Sol Ring for Birds");

    expect(versionCreateMock.mock.calls[0][0].data.number).toBe(5);
  });
});

describe("saveDeckVersion grading", () => {
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
    .concat("SUMMARY :: Fine.")
    .join("\n");

  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    versionFindFirstMock.mockReset();
    versionCreateMock.mockReset();
    completeMock.mockReset();
  });

  it("stores a grade on the version when the deck has a goal", async () => {
    deckFindUniqueMock.mockResolvedValue(
      stored([row("atraxa", 1, true), row("sol-ring")], "atraxa", { goal: "Combo off" }),
    );
    versionFindFirstMock.mockResolvedValue(null);
    versionCreateMock.mockResolvedValue({ id: "v1" });
    completeMock.mockResolvedValue(scores);

    await saveDeckVersion("deck_1", "Initial build");

    const data = versionCreateMock.mock.calls[0][0].data;
    expect(data.gradeScore).toBe(80);
    expect(data.gradeGoal).toBe("Combo off");
    expect(data.gradeBreakdown).toHaveLength(7);
    expect(completeMock.mock.calls[0][0]).toContain("Goal: Combo off");
  });

  it("anchors the grade to the latest graded version only when the goal matches", async () => {
    const breakdown = [{ category: "Interaction", score: 55, note: "" }];
    const earlier = (gradeGoal: string) =>
      stored([row("atraxa", 1, true), row("sol-ring")], "atraxa", {
        number: 1,
        gradeScore: 60,
        gradeGoal,
        gradeBreakdown: breakdown,
        gradeSummary: "",
      });
    deckFindUniqueMock.mockResolvedValue(
      stored([row("atraxa", 1, true), row("birds")], "atraxa", { goal: "Combo off" }),
    );
    versionCreateMock.mockResolvedValue({ id: "v2" });
    completeMock.mockResolvedValue(scores);

    versionFindFirstMock.mockResolvedValue(earlier("Combo off"));
    await saveDeckVersion("deck_1", "Swap");
    expect(completeMock.mock.calls[0][0]).toContain("- Interaction: 55");
    expect(completeMock.mock.calls[0][0]).toContain("Added: BIRDS");

    versionFindFirstMock.mockResolvedValue(earlier("Stax"));
    await saveDeckVersion("deck_1", "Swap");
    expect(completeMock.mock.calls[1][0]).not.toContain("graded before");
  });

  it("still saves the version, ungraded, when grading fails", async () => {
    deckFindUniqueMock.mockResolvedValue(
      stored([row("atraxa", 1, true), row("sol-ring")], "atraxa", { goal: "Combo off" }),
    );
    versionFindFirstMock.mockResolvedValue(null);
    versionCreateMock.mockResolvedValue({ id: "v1" });
    completeMock.mockResolvedValue("not a grade");

    await saveDeckVersion("deck_1", "Initial build");

    const data = versionCreateMock.mock.calls[0][0].data;
    expect(data.gradeScore).toBeUndefined();
  });

  it("reuses the deck's own grade when it was made for these exact cards and goal", async () => {
    const cards = [row("atraxa", 1, true), row("sol-ring")];
    const breakdown = [{ category: "Interaction", score: 55, note: "" }];
    deckFindUniqueMock.mockResolvedValue(
      stored(cards, "atraxa", {
        goal: "Combo off",
        gradeScore: 77,
        gradeGoal: "Combo off",
        gradeBreakdown: breakdown,
        gradeSummary: "Reused.",
        gradeSignature: deckSignature("atraxa", cards),
      }),
    );
    versionFindFirstMock.mockResolvedValue(null);
    versionCreateMock.mockResolvedValue({ id: "v1" });

    await saveDeckVersion("deck_1", "Initial build");

    expect(completeMock).not.toHaveBeenCalled();
    const data = versionCreateMock.mock.calls[0][0].data;
    expect(data.gradeScore).toBe(77);
    expect(data.gradeSummary).toBe("Reused.");
  });

  it("regrades when the deck's stored grade is stale", async () => {
    const cards = [row("atraxa", 1, true), row("sol-ring")];
    deckFindUniqueMock.mockResolvedValue(
      stored(cards, "atraxa", {
        goal: "Combo off",
        gradeScore: 77,
        gradeGoal: "Combo off",
        gradeBreakdown: [],
        gradeSignature: "stale",
      }),
    );
    versionFindFirstMock.mockResolvedValue(null);
    versionCreateMock.mockResolvedValue({ id: "v1" });
    completeMock.mockResolvedValue(scores);

    await saveDeckVersion("deck_1", "Initial build");

    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("skips grading when the deck has no goal", async () => {
    deckFindUniqueMock.mockResolvedValue(stored([row("atraxa", 1, true), row("sol-ring")]));
    versionFindFirstMock.mockResolvedValue(null);
    versionCreateMock.mockResolvedValue({ id: "v1" });

    await saveDeckVersion("deck_1", "Initial build");

    expect(completeMock).not.toHaveBeenCalled();
  });
});

describe("gradeCurrentDeck", () => {
  const scores = [
    "Goal execution",
    "Consistency",
    "Mana development",
    "Card advantage",
    "Interaction",
    "Resilience",
    "Mana base",
  ]
    .map((category) => `${category} :: 70 :: ok`)
    .join("\n");

  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    versionFindFirstMock.mockReset();
    completeMock.mockReset();
  });

  it("requires a goal and cards", async () => {
    deckFindUniqueMock.mockResolvedValueOnce(stored([row("atraxa", 1, true)]));
    await expect(gradeCurrentDeck("deck_1")).rejects.toThrow("Set a goal");

    deckFindUniqueMock.mockResolvedValueOnce(stored([], "atraxa", { goal: "Combo off" }));
    await expect(gradeCurrentDeck("deck_1")).rejects.toThrow("Build the deck");
  });

  it("grades the live cards, anchored to the latest graded version, and returns a signature", async () => {
    const cards = [row("atraxa", 1, true), row("birds")];
    deckFindUniqueMock.mockResolvedValue(stored(cards, "atraxa", { goal: "Combo off" }));
    versionFindFirstMock.mockResolvedValue(
      stored([row("atraxa", 1, true), row("sol-ring")], "atraxa", {
        number: 2,
        gradeScore: 60,
        gradeGoal: "Combo off",
        gradeBreakdown: [{ category: "Interaction", score: 55, note: "" }],
        gradeSummary: "",
      }),
    );
    completeMock.mockResolvedValue(scores);

    const grade = await gradeCurrentDeck("deck_1");

    expect(grade.score).toBe(70);
    expect(grade.signature).toBe(deckSignature("atraxa", cards));
    const prompt = completeMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Added: BIRDS");
    expect(prompt).toContain("Removed: SOL-RING");
  });
});

describe("listDeckVersions", () => {
  beforeEach(() => versionFindManyMock.mockReset());

  it("returns versions newest first, each diffed against the previous one", async () => {
    versionFindManyMock.mockResolvedValue([
      {
        id: "v1",
        number: 1,
        description: "first",
        createdAt: new Date(0),
        ...stored([row("atraxa", 1, true), row("sol-ring")]),
      },
      {
        id: "v2",
        number: 2,
        description: "second",
        createdAt: new Date(1),
        ...stored([row("atraxa", 1, true), row("birds")]),
      },
    ]);

    const result = await listDeckVersions("deck_1");

    expect(result.map((version) => version.number)).toEqual([2, 1]);
    expect(result[0].changes.added).toEqual([{ name: "BIRDS", quantity: 1 }]);
    expect(result[0].changes.removed).toEqual([{ name: "SOL-RING", quantity: 1 }]);
    expect(result[1].changes.added).toEqual([{ name: "SOL-RING", quantity: 1 }]);
    expect(result[0].cardCount).toBe(2);
  });
});

describe("restoreDeckVersion", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    versionFindUniqueMock.mockReset();
    versionFindFirstMock.mockReset();
    versionCreateMock.mockReset();
    transactionMock.mockReset();
  });

  it("rejects a version that belongs to another deck", async () => {
    versionFindUniqueMock.mockResolvedValue({ id: "v1", deckId: "other", number: 1, ...stored([]) });

    await expect(restoreDeckVersion("deck_1", "v1")).rejects.toThrow("Version not found");
  });

  it("rejects restoring when the deck already matches", async () => {
    const cards = [row("atraxa", 1, true), row("sol-ring")];
    versionFindUniqueMock.mockResolvedValue({ id: "v1", deckId: "deck_1", number: 1, ...stored(cards) });
    deckFindUniqueMock.mockResolvedValue(stored(cards));

    await expect(restoreDeckVersion("deck_1", "v1")).rejects.toThrow("already matches");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("replaces the deck's cards and records a new 'Restored' version", async () => {
    versionFindUniqueMock.mockResolvedValue({
      id: "v1",
      deckId: "deck_1",
      number: 1,
      ...stored([row("atraxa", 1, true), row("sol-ring")]),
    });
    deckFindUniqueMock.mockResolvedValue(stored([row("atraxa", 1, true), row("birds")]));
    versionFindFirstMock.mockResolvedValue({ number: 3 });
    transactionMock.mockResolvedValue([undefined, undefined, undefined, { id: "v4" }]);

    await restoreDeckVersion("deck_1", "v1");

    expect(transactionMock.mock.calls[0][0]).toHaveLength(4);
    const created = versionCreateMock.mock.calls[0][0].data;
    expect(created.number).toBe(4);
    expect(created.description).toBe("Restored version 1");
  });
});

describe("draftVersionDescription", () => {
  beforeEach(() => {
    deckFindUniqueMock.mockReset();
    versionFindFirstMock.mockReset();
    completeMock.mockReset();
  });

  it("returns a fixed description without calling the LLM for the first version", async () => {
    deckFindUniqueMock.mockResolvedValue(stored([row("atraxa", 1, true)]));
    versionFindFirstMock.mockResolvedValue(null);

    expect(await draftVersionDescription("deck_1")).toBe("Initial version");
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("rejects when nothing changed since the latest version", async () => {
    const cards = [row("atraxa", 1, true)];
    deckFindUniqueMock.mockResolvedValue(stored(cards));
    versionFindFirstMock.mockResolvedValue(stored(cards, "atraxa", { number: 1 }));

    await expect(draftVersionDescription("deck_1")).rejects.toThrow("No changes");
  });

  it("prompts the LLM with the diff and returns its trimmed answer", async () => {
    deckFindUniqueMock.mockResolvedValue(stored([row("atraxa", 1, true), row("birds")]));
    versionFindFirstMock.mockResolvedValue(
      stored([row("atraxa", 1, true), row("sol-ring")], "atraxa", { number: 1 }),
    );
    completeMock.mockResolvedValue("  Swapped the rock for a dork.\n");

    const result = await draftVersionDescription("deck_1");

    expect(result).toBe("Swapped the rock for a dork.");
    const prompt = completeMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Added: BIRDS");
    expect(prompt).toContain("Removed: SOL-RING");
  });
});
