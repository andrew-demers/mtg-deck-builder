import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/deck-grade", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deck-grade")>("@/lib/deck-grade");
  return { ...actual, gradeDeck: vi.fn() };
});

import { DeckGradeError, GRADE_CATEGORIES, gradeDeck, type DeckGrade, type GradeInput } from "@/lib/deck-grade";
import { deckSignature } from "@/lib/deck-signature";
import {
  GradeRaisingError,
  gradeInputAfterChange,
  gradeRaisingPromptLines,
  keepIfHigherGrade,
  loadCurrentGrade,
  type DeckForGrade,
} from "@/lib/grade-raising";

const gradeDeckMock = gradeDeck as unknown as ReturnType<typeof vi.fn>;

const cards = [
  { cardId: "cmd", quantity: 1, isCommander: true, card: { name: "Atraxa" } },
  { cardId: "sol", quantity: 1, isCommander: false, card: { name: "Sol Ring" } },
];

function breakdown(score: number) {
  return GRADE_CATEGORIES.map((category) => ({ category, score, note: "n" }));
}

function deck(overrides: Partial<DeckForGrade> = {}): DeckForGrade {
  return {
    goal: "Win",
    commanderCardId: "cmd",
    commanderCard: { name: "Atraxa", type: "Creature", oracleText: "Flying" },
    cards,
    ...overrides,
  };
}

describe("loadCurrentGrade", () => {
  beforeEach(() => {
    gradeDeckMock.mockReset();
  });

  it("reuses a stored grade for the same cards and goal", async () => {
    const stored = deck({
      gradeScore: 70,
      gradeGoal: "Win",
      gradeBreakdown: breakdown(70),
      gradeSummary: "Ok.",
      gradeSignature: deckSignature("cmd", cards),
    });

    const result = await loadCurrentGrade(stored);

    expect(result.grade.score).toBe(70);
    expect(result.input.cards).toEqual([{ name: "Sol Ring", quantity: 1 }]);
    expect(gradeDeckMock).not.toHaveBeenCalled();
  });

  it("grades again when the stored grade is for different cards", async () => {
    gradeDeckMock.mockResolvedValue({ score: 55, breakdown: breakdown(55), summary: "New." });

    const result = await loadCurrentGrade(
      deck({
        gradeScore: 70,
        gradeGoal: "Win",
        gradeBreakdown: breakdown(70),
        gradeSummary: "Ok.",
        gradeSignature: "stale",
      }),
    );

    expect(result.grade.score).toBe(55);
    expect(gradeDeckMock).toHaveBeenCalledOnce();
  });

  it("turns an unreadable grade into a grade-raising error", async () => {
    gradeDeckMock.mockRejectedValue(new DeckGradeError("Couldn't read a complete grade from the model's response"));

    await expect(loadCurrentGrade(deck())).rejects.toBeInstanceOf(GradeRaisingError);
  });
});

describe("gradeInputAfterChange", () => {
  const base: GradeInput = {
    goal: "Win",
    commanderName: "Atraxa",
    cards: [
      { name: "Sol Ring", quantity: 1 },
      { name: "Forest", quantity: 2 },
    ],
  };
  const current: DeckGrade = { score: 70, breakdown: breakdown(70), summary: "Ok." };

  it("adds and removes cards and anchors the new grade to the current one", () => {
    const next = gradeInputAfterChange(base, current, {
      added: [{ name: "Swords to Plowshares" }],
      removed: [{ name: "Sol Ring" }],
    });

    expect(next.cards).toEqual([
      { name: "Forest", quantity: 2 },
      { name: "Swords to Plowshares", quantity: 1 },
    ]);
    expect(next.previous).toEqual({
      score: 70,
      breakdown: current.breakdown,
      added: ["Swords to Plowshares"],
      removed: ["Sol Ring"],
    });
    expect(base.cards).toHaveLength(2);
  });
});

describe("keepIfHigherGrade", () => {
  it("keeps only changes whose grade is higher, in the original order", async () => {
    const current: DeckGrade = { score: 70, breakdown: breakdown(70), summary: "" };
    gradeDeckMock.mockImplementation(async (input: GradeInput) => {
      const score = input.cards.some((card) => card.name === "Good") ? 80 : 70;
      return { score, breakdown: breakdown(score), summary: "" };
    });

    const kept = await keepIfHigherGrade(current, ["Weak", "Good", "Flat"], (name) => ({
      goal: null,
      commanderName: "Atraxa",
      cards: [{ name, quantity: 1 }],
    }));

    expect(kept).toEqual([{ item: "Good", nextScore: 80 }]);
  });
});

describe("gradeRaisingPromptLines", () => {
  it("states the current grade and that a suggestion has to raise it", () => {
    const lines = gradeRaisingPromptLines({ score: 62, breakdown: breakdown(62), summary: "" });

    expect(lines.join("\n")).toContain("current overall grade is 62 out of 100");
    expect(lines.join("\n")).toContain("raises this overall grade");
  });
});
