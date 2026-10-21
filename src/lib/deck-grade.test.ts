import { describe, expect, it } from "vitest";
import {
  buildGradePrompt,
  CRITIQUE_MARKER,
  DeckGradeError,
  GRADE_CATEGORIES,
  letterGrade,
  parseGrade,
  parseGradeAndCritique,
} from "@/lib/deck-grade";

function completion(scores: number[], summary = "SUMMARY :: Strong ramp. Add removal.") {
  return [
    ...GRADE_CATEGORIES.map((category, index) => `${category} :: ${scores[index]} :: Note for ${category}.`),
    summary,
  ].join("\n");
}

describe("parseGrade", () => {
  it("reads every category and computes the overall score as their mean", () => {
    const grade = parseGrade(completion([80, 70, 60, 90, 50, 70, 80]));

    expect(grade.breakdown).toHaveLength(GRADE_CATEGORIES.length);
    expect(grade.breakdown[0]).toEqual({
      category: "Goal execution",
      score: 80,
      note: "Note for Goal execution.",
    });
    expect(grade.score).toBe(71);
    expect(grade.summary).toBe("Strong ramp. Add removal.");
  });

  it("tolerates bullets and case differences in category names", () => {
    const text = completion([70, 70, 70, 70, 70, 70, 70]).replace("Interaction", "- interaction");

    expect(parseGrade(text).score).toBe(70);
  });

  it("rejects a response missing a category", () => {
    const text = completion([70, 70, 70, 70, 70, 70, 70]).replace(/Resilience.*\n/, "");

    expect(() => parseGrade(text)).toThrow(DeckGradeError);
  });

  it("rejects out-of-range or non-integer scores", () => {
    expect(() => parseGrade(completion([101, 70, 70, 70, 70, 70, 70]))).toThrow(DeckGradeError);
    expect(() => parseGrade(completion([70.5, 70, 70, 70, 70, 70, 70]))).toThrow(DeckGradeError);
  });
});

describe("buildGradePrompt", () => {
  const base = {
    goal: "Win with combos by turn 8",
    commanderName: "Atraxa",
    cards: [{ name: "Sol Ring", quantity: 1 }],
  };

  it("includes the goal, commander, and cards", () => {
    const prompt = buildGradePrompt(base);

    expect(prompt).toContain("Goal: Win with combos by turn 8");
    expect(prompt).toContain("Commander: Atraxa");
    expect(prompt).toContain("- Sol Ring");
    expect(prompt).not.toContain("graded before");
  });

  it("anchors a re-grade to the previous scores and the card changes", () => {
    const prompt = buildGradePrompt({
      ...base,
      previous: {
        score: 70,
        breakdown: [{ category: "Interaction", score: 55, note: "" }],
        added: ["Swords to Plowshares"],
        removed: ["Rhystic Study"],
      },
    });

    expect(prompt).toContain("graded before");
    expect(prompt).toContain("- Interaction: 55");
    expect(prompt).toContain("Added: Swords to Plowshares");
    expect(prompt).toContain("Removed: Rhystic Study");
    expect(prompt).toContain("Do not recommend adding back a removed card");
  });

  it("tells the critique not to reverse cards the player already added or cut", () => {
    const prompt = buildGradePrompt({
      ...base,
      withCritique: true,
      settledEdits: {
        cuts: [{ id: "beast", name: "Beast Within" }],
        adds: [{ id: "swords", name: "Swords to Plowshares" }],
      },
    });

    expect(prompt).toContain("Do not recommend adding back: Beast Within.");
    expect(prompt).toContain("Do not recommend cutting: Swords to Plowshares.");
    expect(prompt).toContain("Do not reverse the settled edits listed above.");
  });
});

describe("buildGradePrompt commander text", () => {
  it("includes the commander's rules text when provided", () => {
    const prompt = buildGradePrompt({
      goal: null,
      commanderName: "Szarel, Genesis Shepherd",
      commanderText: "Flying\nYou may play lands from your graveyard.",
      cards: [],
    });
    expect(prompt).toContain("You may play lands from your graveyard.");
  });

  it("omits the commander text block when absent", () => {
    expect(buildGradePrompt({ goal: null, commanderName: "c", cards: [] })).not.toContain("Commander card text");
  });
});

describe("letterGrade", () => {
  it("maps scores to letters", () => {
    expect([100, 93, 88, 80, 72, 61, 10].map(letterGrade)).toEqual(["A+", "A", "B+", "B-", "C-", "D", "F"]);
  });
});

describe("parseGradeAndCritique", () => {
  it("splits the scores from the critique after the marker", () => {
    const { grade, critique } = parseGradeAndCritique(
      `${completion([70, 70, 70, 70, 70, 70, 70])}\n${CRITIQUE_MARKER}\n## Strengths\nRamp.\n`,
    );

    expect(grade?.score).toBe(70);
    expect(critique).toBe("## Strengths\nRamp.");
  });

  it("keeps the critique when the scores can't be read", () => {
    const { grade, critique } = parseGradeAndCritique(`garbage\n${CRITIQUE_MARKER}\nStill useful.`);

    expect(grade).toBeNull();
    expect(critique).toBe("Still useful.");
  });

  it("treats a response with no marker and no scores as the critique", () => {
    const { grade, critique } = parseGradeAndCritique("Just prose about the deck.");

    expect(grade).toBeNull();
    expect(critique).toBe("Just prose about the deck.");
  });

  it("asks for the critique only when requested", () => {
    const base = { goal: "g", commanderName: "c", cards: [] };

    expect(buildGradePrompt({ ...base, withCritique: true })).toContain(CRITIQUE_MARKER);
    expect(buildGradePrompt(base)).not.toContain(CRITIQUE_MARKER);
  });

  it("asks the critique to open with a win condition section", () => {
    const prompt = buildGradePrompt({ goal: "g", commanderName: "c", cards: [], withCritique: true });

    expect(prompt).toContain('"## Win condition"');
    expect(prompt).toContain("raise the overall grade above the scores you just gave");
  });
});
