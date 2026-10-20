import type { Prisma } from "@/generated/prisma/client";

/** One card the player added to or cut from a deck on purpose. */
export interface CardDecision {
  id: string;
  name: string;
}

/**
 * The player's own adds and cuts. Suggestion and critique prompts treat these
 * as settled so the next run does not recommend undoing them.
 */
export interface CardDecisions {
  cuts: CardDecision[];
  adds: CardDecision[];
}

export const EMPTY_CARD_DECISIONS: CardDecisions = { cuts: [], adds: [] };

/** Enough to cover a full rebuild of the 99 non-commander cards, then the oldest fall off. */
const MAX_DECISIONS = 99;

export function parseCardDecisions(value: unknown): CardDecisions {
  if (!value || typeof value !== "object") {
    return EMPTY_CARD_DECISIONS;
  }

  const raw = value as { cuts?: unknown; adds?: unknown };
  return { cuts: parseList(raw.cuts), adds: parseList(raw.adds) };
}

/**
 * Records a cut and forgets any earlier "keep this card" decision for it.
 * Newest first, so a long editing session drops the oldest names.
 */
export function decisionsAfterCut(current: CardDecisions, card: CardDecision): CardDecisions {
  return {
    cuts: pushDecision(current.cuts, card),
    adds: current.adds.filter((entry) => entry.id !== card.id),
  };
}

/** Records an add and forgets any earlier "leave this card out" decision for it. */
export function decisionsAfterAdd(current: CardDecisions, card: CardDecision): CardDecisions {
  return {
    adds: pushDecision(current.adds, card),
    cuts: current.cuts.filter((entry) => entry.id !== card.id),
  };
}

/** Prisma stores this blob as JSON. The cast keeps the typed lists assignable. */
export function cardDecisionsJson(decisions: CardDecisions): Prisma.InputJsonValue {
  return { cuts: decisions.cuts, adds: decisions.adds } as unknown as Prisma.InputJsonValue;
}

/** Prompt lines telling the model not to reverse the player's edits. Empty when there are none. */
export function settledEditLines(decisions: CardDecisions): string[] {
  if (decisions.cuts.length === 0 && decisions.adds.length === 0) {
    return [];
  }

  const lines = ["The player already made these edits. Treat them as settled and do not recommend undoing them."];
  if (decisions.cuts.length > 0) {
    lines.push(`Do not recommend adding back: ${names(decisions.cuts)}.`);
  }
  if (decisions.adds.length > 0) {
    lines.push(`Do not recommend cutting: ${names(decisions.adds)}.`);
  }
  lines.push("If that role is still open, name a different card.");
  return lines;
}

function names(cards: CardDecision[]): string {
  return cards.map((card) => card.name).join(", ");
}

function pushDecision(list: CardDecision[], card: CardDecision): CardDecision[] {
  return [card, ...list.filter((entry) => entry.id !== card.id)].slice(0, MAX_DECISIONS);
}

function parseList(value: unknown): CardDecision[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is CardDecision =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as CardDecision).id === "string" &&
      typeof (entry as CardDecision).name === "string",
  );
}
