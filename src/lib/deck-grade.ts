import { getLlmProvider } from "@/lib/llm";
import { settledEditLines, type CardDecisions } from "@/lib/deck-decisions";
export { letterGrade } from "@/lib/grade-letter";

export class DeckGradeError extends Error {}

/** Graded against when the deck has no goal of its own. */
export const DEFAULT_GRADE_GOAL = "Be a consistent, well-built deck that makes the most of its commander";

/** Fixed rubric so grades of different versions are comparable category by category. */
export const GRADE_CATEGORIES = [
  "Goal execution",
  "Consistency",
  "Mana development",
  "Card advantage",
  "Interaction",
  "Resilience",
  "Mana base",
] as const;

export interface GradeCategory {
  category: string;
  score: number;
  note: string;
}

export interface DeckGrade {
  score: number;
  breakdown: GradeCategory[];
  summary: string;
  /** The win condition the model inferred, when it was asked to rather than given a goal. */
  winCondition?: string;
}

/** A previously saved grade, shown to the grader so a re-grade stays stable. */
export interface PreviousGrade {
  score: number;
  breakdown: GradeCategory[];
  added: string[];
  removed: string[];
}

export interface GradeInput {
  /** What the deck should achieve. When null, the model works out the win condition itself and grades against it. */
  goal: string | null;
  commanderName: string;
  /** The commander's type line and rules text. */
  commanderText?: string | null;
  /** Non-commander cards, one entry per card name with its quantity. */
  cards: { name: string; quantity: number }[];
  previous?: PreviousGrade | null;
  /** Cards the player added or cut on purpose. The critique must not reverse them. */
  settledEdits?: CardDecisions | null;
  /** Also ask for a free-text critique after the scores, in the same response. */
  withCritique?: boolean;
}

export const CRITIQUE_MARKER = "=== CRITIQUE ===";

/**
 * Asks the LLM to grade how well a deck is built to achieve its stated goal.
 *
 * The LLM only supplies per-category scores and notes; the overall score is
 * computed here as their mean so it can't disagree with the breakdown, and
 * every category in the rubric must come back with a valid 0-100 integer or
 * the whole grade is rejected rather than saved half-filled (a missing
 * category would make later comparisons misleading).
 */
export async function gradeDeck(input: GradeInput): Promise<DeckGrade> {
  const completion = await getLlmProvider().complete(buildGradePrompt(input));
  return parseGrade(completion);
}

export function buildGradePrompt(input: GradeInput): string {
  const { goal, commanderName, commanderText, cards, previous, settledEdits, withCritique } = input;
  const settledLines = settledEditLines(settledEdits ?? { cuts: [], adds: [] });
  const cardLines = cards
    .map((card) => `- ${card.name}${card.quantity > 1 ? ` x${card.quantity}` : ""}`)
    .join("\n");

  return [
    "You are grading a Magic: The Gathering Commander/EDH deck on how well it is built to achieve its owner's goal.",
    `Commander: ${commanderName}`,
    ...(commanderText
      ? [
          "Commander card text (authoritative - rely on this, not on your memory of the card, and do not attribute abilities to it that are not written here):",
          commanderText,
        ]
      : []),
    ...(goal ? [`Goal: ${goal}`] : []),
    "",
    "The rest of the deck:",
    cardLines,
    "",
    `Score each category below from 0 to 100 as an integer, judged only against ${goal ? "the goal above" : "the win condition you identified"}, using this scale:`,
    "- 90-100: excellent; hard to meaningfully improve.",
    "- 75-89: strong, with a few clear gaps.",
    "- 60-74: playable but inconsistent or underpowered for the goal.",
    "- 40-59: significant problems.",
    "- 0-39: fundamentally broken or missing.",
    "Be critical: most casual decks land between 55 and 80. Reserve 90+ for decks with no meaningful weakness.",
    "Judge the cards actually listed, not cards that would be nice to have. Count real sources of each effect (e.g. number of ramp pieces, draw engines, removal spells, and win-condition payoffs) before scoring.",
    "",
    "Categories:",
    "- Goal execution: how many cards directly advance the goal, how redundant they are, and how fast the deck can realistically achieve it.",
    "- Consistency: how reliably the deck finds its key cards and functions across games (tutors, redundancy, card selection, curve).",
    "- Mana development: ramp, fixing, and the ability to cast spells on curve.",
    "- Card advantage: draw, recursion, and card flow.",
    "- Interaction: removal, counterspells, protection from opposing threats, and board wipes where appropriate.",
    "- Resilience: ability to recover from removal, wipes, and disruption of the goal.",
    "- Mana base: land count, color balance, and untapped/tapped lands relative to the deck's needs.",
    ...(previous
      ? [
          "",
          "This deck was graded before. Previous scores:",
          ...previous.breakdown.map((entry) => `- ${entry.category}: ${entry.score}`),
          "Changes since that grade:",
          ...previous.added.map((name) => `Added: ${name}`),
          ...previous.removed.map((name) => `Removed: ${name}`),
          "Keep each score the same as before unless these specific changes make that category better or worse. Move a score only as far as the changes justify, and do not re-score categories the changes do not touch.",
          "These changes were intentional. Do not recommend adding back a removed card or cutting an added card.",
        ]
      : []),
    ...(settledLines.length > 0 ? ["", ...settledLines] : []),
    "",
    ...(goal
      ? []
      : [
          "The owner has not stated a goal. First work out the deck's intended win condition from the commander and the cards (e.g. 'Win by combat damage with go-wide tokens'), and grade against that.",
        ]),
    "Respond with exactly one line per category, in the order above, in exactly this format and nothing else:",
    "Category :: score :: One sentence naming the specific cards or gaps behind the score.",
    ...(goal ? [] : ["Before the category lines, put a line: WIN CONDITION :: One sentence describing how this deck intends to win."]),
    "Then a final line in this format:",
    "SUMMARY :: Two sentences on the deck's biggest strength and the single change that would most improve its odds of reaching the goal.",
    ...(withCritique
      ? [
          `Then a line containing exactly ${CRITIQUE_MARKER} followed by a free-text critique of the deck in markdown. Start it with a section headed "## Win condition" covering how the deck actually wins (the specific cards, combos, or game plan), how many cards support it and how redundant they are, how quickly it can realistically get there, and what could stop it. Then cover the deck's strengths, its weaknesses, and concrete suggestions for improvement. Make it consistent with the scores above and relevant to the ${input.goal ? "goal" : "win condition"}.${settledLines.length > 0 ? " Do not reverse the settled edits listed above." : ""} Put nothing after the critique.`,
        ]
      : []),
  ].join("\n");
}

export function parseGrade(completion: string): DeckGrade {
  const lines = completion
    .split("\n")
    .map((line) => line.replace(/^[\s\-*]+/, "").trim())
    .filter((line) => line.length > 0);

  const byCategory = new Map<string, GradeCategory>();
  let summary = "";
  let winCondition = "";

  for (const line of lines) {
    const [label, second, ...rest] = line.split("::").map((part) => part.trim());
    if (!label || second === undefined) continue;

    if (label.toLowerCase() === "summary") {
      summary = [second, ...rest].join(" :: ");
      continue;
    }

    if (label.toLowerCase() === "win condition") {
      winCondition = [second, ...rest].join(" :: ");
      continue;
    }

    const category = GRADE_CATEGORIES.find((name) => name.toLowerCase() === label.toLowerCase());
    const score = Number(second);
    if (!category || !Number.isInteger(score) || score < 0 || score > 100) continue;

    byCategory.set(category, { category, score, note: rest.join(" :: ") });
  }

  const breakdown = GRADE_CATEGORIES.map((name) => byCategory.get(name));
  if (breakdown.some((entry) => entry === undefined)) {
    throw new DeckGradeError("Couldn't read a complete grade from the model's response");
  }

  const complete = breakdown as GradeCategory[];
  const score = Math.round(complete.reduce((sum, entry) => sum + entry.score, 0) / complete.length);

  return { score, breakdown: complete, summary, ...(winCondition ? { winCondition } : {}) };
}

/**
 * Splits a combined response into its grade and critique. Never throws: the
 * critique is free text worth keeping even when the scores can't be read, so
 * an unreadable grade comes back as null and, if the model skipped the marker
 * entirely, the whole response is treated as the critique.
 */
export function parseGradeAndCritique(completion: string): { grade: DeckGrade | null; critique: string } {
  const markerIndex = completion.indexOf(CRITIQUE_MARKER);
  const gradeText = markerIndex >= 0 ? completion.slice(0, markerIndex) : completion;

  let grade: DeckGrade | null = null;
  try {
    grade = parseGrade(gradeText);
  } catch {
    grade = null;
  }

  const critique =
    markerIndex >= 0
      ? completion.slice(markerIndex + CRITIQUE_MARKER.length).trim()
      : grade
        ? ""
        : completion.trim();
  return { grade, critique };
}

/** One LLM call that returns both the grade and the written critique. */
export async function gradeAndCritiqueDeck(
  input: GradeInput,
): Promise<{ grade: DeckGrade | null; critique: string }> {
  const completion = await getLlmProvider().complete(buildGradePrompt({ ...input, withCritique: true }));
  return parseGradeAndCritique(completion);
}
