/** Kept apart from deck-grade so client components can use it without pulling in the LLM client. */
export function letterGrade(score: number): string {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 60) return "D";
  return "F";
}

/** The lowest score that earns each whole letter, best first. */
const LETTER_THRESHOLDS: { letter: string; minScore: number }[] = [
  { letter: "A+", minScore: 97 },
  { letter: "A", minScore: 93 },
  { letter: "B", minScore: 83 },
  { letter: "C", minScore: 73 },
  { letter: "D", minScore: 60 },
];

/**
 * The next whole letter up from a score and the score that earns it, e.g. any
 * C goes for a B (83). An A goes for an A+. Null once the deck is already an A+.
 */
export function nextGradeTarget(score: number): { letter: string; minScore: number } | null {
  const family = letterGrade(score)[0];
  const better = LETTER_THRESHOLDS.filter(
    ({ letter, minScore }) => minScore > score && (letter[0] !== family || letter === "A+"),
  );
  return better.length > 0 ? better[better.length - 1] : null;
}

/** How much a suggested card is expected to raise one grade category. */
export interface GradeImpact {
  category: string;
  points: number;
}

/**
 * The overall score the deck would have if every impact landed, worked out the
 * same way the grade is (the mean of the category scores, each capped at 100).
 */
export function projectGradeScore(
  breakdown: { category: string; score: number }[],
  impacts: GradeImpact[],
): number {
  if (breakdown.length === 0) {
    return 0;
  }
  const total = breakdown.reduce((sum, entry) => {
    const gain = impacts
      .filter((impact) => impact.category.toLowerCase() === entry.category.toLowerCase())
      .reduce((points, impact) => points + impact.points, 0);
    return sum + Math.min(100, entry.score + gain);
  }, 0);
  return Math.round(total / breakdown.length);
}
