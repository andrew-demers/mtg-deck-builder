import { parseCardDecisions } from "@/lib/deck-decisions";
import { gradeDeck, DeckGradeError, type DeckGrade, type GradeCategory, type GradeInput } from "@/lib/deck-grade";
import { deckSignature } from "@/lib/deck-signature";
import { LlmProviderError } from "@/lib/llm/provider";

export class GradeRaisingError extends Error {}

/** A deck plus the grade columns stored on it, when a fresh grade can be reused. */
export interface DeckForGrade {
  goal?: string | null;
  gradeScore?: number | null;
  gradeGoal?: string | null;
  gradeBreakdown?: unknown;
  gradeSummary?: string | null;
  gradeSignature?: string | null;
  commanderCardId?: string | null;
  cardDecisions?: unknown;
  commanderCard: { name: string; type?: string | null; oracleText?: string | null } | null;
  cards: { cardId: string; quantity: number; isCommander: boolean; card: { name: string } }[];
}

export interface DeckChange {
  added?: { name: string }[];
  removed?: { name: string }[];
}

export interface ResolvedGrade {
  grade: DeckGrade;
  input: GradeInput;
}

const GRADE_WORKERS = 5;

/**
 * The deck's grade for the cards it has now. A stored grade is reused when it
 * was made for this goal and this exact card list; otherwise the deck is graded.
 */
export async function loadCurrentGrade(deck: DeckForGrade): Promise<ResolvedGrade> {
  const input = baseGradeInput(deck);
  const stored = freshStoredGrade(deck);
  if (stored) {
    return { grade: stored, input };
  }

  try {
    return { grade: await gradeDeck(input), input };
  } catch (error) {
    if (error instanceof DeckGradeError) {
      throw new GradeRaisingError(error.message);
    }
    throw error;
  }
}

/** Prompt lines that tie suggestions to the deck's current grade. */
export function gradeRaisingPromptLines(grade: DeckGrade): string[] {
  return [
    `The deck's current overall grade is ${grade.score} out of 100.`,
    "Category scores:",
    ...grade.breakdown.map((entry) =>
      entry.note ? `- ${entry.category}: ${entry.score}. ${entry.note}` : `- ${entry.category}: ${entry.score}.`,
    ),
    "Only suggest a change that raises this overall grade when that change is applied on its own.",
    "Leave out a change that would hold the overall grade the same or lower, including one that helps one category only by hurting another.",
    "Prefer the lowest-scoring categories. In the reason, name the category whose score goes up.",
  ];
}

export function gradeRiseReason(reason: string, from: number, to: number): string {
  return `${reason} Raises the grade from ${from} to ${to}.`;
}

/** Grade input for `base` after one add, cut, or swap, anchored to the current grade. */
export function gradeInputAfterChange(base: GradeInput, current: DeckGrade, change: DeckChange): GradeInput {
  const removeNames = new Set((change.removed ?? []).map((card) => card.name));
  const cards = base.cards.filter((card) => !removeNames.has(card.name)).map((card) => ({ ...card }));

  for (const add of change.added ?? []) {
    const existing = cards.find((card) => card.name === add.name);
    if (existing) {
      existing.quantity += 1;
    } else {
      cards.push({ name: add.name, quantity: 1 });
    }
  }

  return {
    ...base,
    cards,
    withCritique: false,
    previous: {
      score: current.score,
      breakdown: current.breakdown,
      added: (change.added ?? []).map((card) => card.name),
      removed: (change.removed ?? []).map((card) => card.name),
    },
  };
}

/**
 * Keeps items whose change re-grades strictly above `current`. Items are
 * graded a few at a time. An unreadable grade is dropped, since it does not
 * show that the change raises the grade. Order matches `items`.
 */
export async function keepIfHigherGrade<T>(
  current: DeckGrade,
  items: T[],
  inputFor: (item: T) => GradeInput,
): Promise<{ item: T; nextScore: number }[]> {
  if (items.length === 0) {
    return [];
  }

  const kept: Array<{ item: T; nextScore: number } | null> = new Array(items.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      try {
        const next = await gradeDeck(inputFor(item));
        if (next.score > current.score) {
          kept[index] = { item, nextScore: next.score };
        }
      } catch (error) {
        if (error instanceof LlmProviderError) {
          throw error;
        }
        // No confirmed higher grade, so the suggestion is not shown.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(GRADE_WORKERS, items.length) }, () => worker()));
  return kept.filter((entry): entry is { item: T; nextScore: number } => entry !== null);
}

export function baseGradeInput(deck: DeckForGrade): GradeInput {
  const commanderText = deck.commanderCard
    ? [deck.commanderCard.type, deck.commanderCard.oracleText].filter(Boolean).join("\n") || null
    : null;

  return {
    goal: deck.goal?.trim() || null,
    commanderName: deck.commanderCard?.name ?? "none",
    commanderText,
    cards: deck.cards
      .filter((deckCard) => !deckCard.isCommander)
      .map((deckCard) => ({ name: deckCard.card.name, quantity: deckCard.quantity })),
    settledEdits: parseCardDecisions(deck.cardDecisions),
  };
}

function freshStoredGrade(deck: DeckForGrade): DeckGrade | null {
  if (
    deck.gradeScore == null ||
    deck.gradeGoal == null ||
    deck.gradeSignature == null ||
    !isBreakdown(deck.gradeBreakdown)
  ) {
    return null;
  }

  const goal = deck.goal?.trim() || null;
  if (goal && deck.gradeGoal !== goal) {
    return null;
  }

  const signature = deckSignature(deck.commanderCardId ?? null, deck.cards);
  if (deck.gradeSignature !== signature) {
    return null;
  }

  return {
    score: deck.gradeScore,
    breakdown: deck.gradeBreakdown.map((entry) => ({
      category: entry.category,
      score: entry.score,
      note: typeof entry.note === "string" ? entry.note : "",
    })),
    summary: deck.gradeSummary ?? "",
  };
}

function isBreakdown(value: unknown): value is GradeCategory[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as GradeCategory).category === "string" &&
        typeof (entry as GradeCategory).score === "number",
    )
  );
}
