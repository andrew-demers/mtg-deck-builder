import { describe, expect, it } from "vitest";
import { nextGradeTarget, projectGradeScore } from "@/lib/grade-letter";

describe("nextGradeTarget", () => {
  it("aims every grade at the next whole letter up", () => {
    expect([30, 65, 70, 74, 79, 80, 85, 89].map((score) => nextGradeTarget(score))).toEqual([
      { letter: "D", minScore: 60 },
      { letter: "C", minScore: 73 },
      { letter: "B", minScore: 83 },
      { letter: "B", minScore: 83 },
      { letter: "B", minScore: 83 },
      { letter: "A", minScore: 93 },
      { letter: "A", minScore: 93 },
      { letter: "A", minScore: 93 },
    ]);
  });

  it("aims an A at an A+ and stops once the deck is an A+", () => {
    expect(nextGradeTarget(91)).toEqual({ letter: "A+", minScore: 97 });
    expect(nextGradeTarget(95)).toEqual({ letter: "A+", minScore: 97 });
    expect(nextGradeTarget(97)).toBeNull();
  });
});

describe("projectGradeScore", () => {
  const breakdown = [
    { category: "Interaction", score: 60 },
    { category: "Card advantage", score: 70 },
  ];

  it("adds each impact to its category and averages", () => {
    expect(
      projectGradeScore(breakdown, [
        { category: "Interaction", points: 6 },
        { category: "interaction", points: 4 },
        { category: "Card advantage", points: 4 },
      ]),
    ).toBe(72);
  });

  it("caps a category at 100 and ignores unknown categories", () => {
    expect(
      projectGradeScore(breakdown, [
        { category: "Interaction", points: 60 },
        { category: "Vibes", points: 30 },
      ]),
    ).toBe(85);
  });
});
