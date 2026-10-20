import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import { DEFAULT_GRADE_GOAL, gradeDeck, type DeckGrade, type GradeCategory, type GradeInput } from "@/lib/deck-grade";
import { parseCardDecisions, type CardDecisions } from "@/lib/deck-decisions";
import { deckSignature } from "@/lib/deck-signature";
import type { Prisma } from "@/generated/prisma/client";

export class DeckVersionError extends Error {}

/** One card line in a deck or a saved version. */
export interface SnapshotCard {
  cardId: string;
  name: string;
  quantity: number;
  isCommander: boolean;
}

export interface DeckSnapshot {
  commanderName: string | null;
  /** The commander's type line and rules text, so the model reads what the card does instead of recalling it. */
  commanderText?: string | null;
  cards: SnapshotCard[];
}

export interface DeckVersionChanges {
  added: { name: string; quantity: number }[];
  removed: { name: string; quantity: number }[];
  changed: { name: string; from: number; to: number }[];
  commander: { from: string | null; to: string | null } | null;
}

export interface VersionGrade {
  score: number;
  goal: string;
  breakdown: GradeCategory[];
  summary: string;
}

export interface DeckVersionSummary {
  id: string;
  number: number;
  description: string;
  createdAt: Date;
  cardCount: number;
  /** Changes since the previous version; for version 1 everything is "added". */
  changes: DeckVersionChanges;
  /** Null when the version was never graded (no goal set, or grading failed). */
  grade: VersionGrade | null;
}

/**
 * Compares two snapshots by card (not by row). A card whose quantity moved
 * (e.g. basic lands) is `changed`; one that gained or lost the commander flag
 * shows up under `commander` rather than as an add/remove.
 */
export function diffSnapshots(previous: DeckSnapshot | null, next: DeckSnapshot): DeckVersionChanges {
  const before = new Map((previous?.cards ?? []).map((card) => [card.cardId, card]));
  const after = new Map(next.cards.map((card) => [card.cardId, card]));

  const added: DeckVersionChanges["added"] = [];
  const removed: DeckVersionChanges["removed"] = [];
  const changed: DeckVersionChanges["changed"] = [];

  for (const [cardId, card] of after) {
    const old = before.get(cardId);
    if (!old) {
      if (!card.isCommander) added.push({ name: card.name, quantity: card.quantity });
    } else if (old.quantity !== card.quantity) {
      changed.push({ name: card.name, from: old.quantity, to: card.quantity });
    }
  }
  for (const [cardId, card] of before) {
    if (!after.has(cardId) && !card.isCommander) {
      removed.push({ name: card.name, quantity: card.quantity });
    }
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  added.sort(byName);
  removed.sort(byName);
  changed.sort(byName);

  const previousCommander = previous?.commanderName ?? null;
  const commander =
    previousCommander !== next.commanderName ? { from: previousCommander, to: next.commanderName } : null;

  return { added, removed, changed, commander };
}

export function hasChanges(changes: DeckVersionChanges): boolean {
  return (
    changes.added.length > 0 ||
    changes.removed.length > 0 ||
    changes.changed.length > 0 ||
    changes.commander !== null
  );
}

type DeckWithCards = {
  commanderCard: { name: string; type?: string; oracleText?: string | null } | null;
  cards: { cardId: string; quantity: number; isCommander: boolean; card: { name: string } }[];
};

export function snapshotOf(source: DeckWithCards): DeckSnapshot {
  return {
    commanderName: source.commanderCard?.name ?? null,
    commanderText: source.commanderCard
      ? [source.commanderCard.type, source.commanderCard.oracleText].filter(Boolean).join("\n") || null
      : null,
    cards: source.cards.map((deckCard) => ({
      cardId: deckCard.cardId,
      name: deckCard.card.name,
      quantity: deckCard.quantity,
      isCommander: deckCard.isCommander,
    })),
  };
}

async function loadDeck(deckId: string) {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    throw new DeckVersionError("Deck not found");
  }

  return deck;
}

async function loadLatestVersion(deckId: string) {
  return prisma.deckVersion.findFirst({
    where: { deckId },
    orderBy: { number: "desc" },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });
}

type GradedVersionFields = {
  gradeScore: number | null;
  gradeGoal: string | null;
  gradeBreakdown: Prisma.JsonValue | null;
  gradeSummary: string | null;
};

export function gradeOf(version: GradedVersionFields): VersionGrade | null {
  if (version.gradeScore === null || version.gradeGoal === null || !Array.isArray(version.gradeBreakdown)) {
    return null;
  }
  return {
    score: version.gradeScore,
    goal: version.gradeGoal,
    breakdown: version.gradeBreakdown as unknown as GradeCategory[],
    summary: version.gradeSummary ?? "",
  };
}

export function gradeColumns(grade: DeckGrade, goal: string) {
  return {
    gradeScore: grade.score,
    gradeGoal: goal,
    gradeBreakdown: grade.breakdown as unknown as Prisma.InputJsonValue,
    gradeSummary: grade.summary,
  };
}

function formatCard(card: { name: string; quantity: number }): string {
  return card.quantity > 1 ? `${card.name} x${card.quantity}` : card.name;
}

/**
 * Grades a snapshot against `goal`. When the closest earlier graded version
 * was graded against the same goal, its scores and the card changes since
 * then go into the prompt so the new grade moves only where the changes
 * justify it; a different goal makes old scores meaningless, so it's ignored.
 */
export function buildGradeInput(
  snapshot: DeckSnapshot,
  goal: string | null,
  earlier: { snapshot: DeckSnapshot; grade: VersionGrade | null } | null,
  settledEdits?: CardDecisions | null,
): GradeInput {
  const comparable = goal && earlier?.grade && earlier.grade.goal === goal ? earlier : null;
  const changes = comparable ? diffSnapshots(comparable.snapshot, snapshot) : null;

  return {
    goal,
    commanderName: snapshot.commanderName ?? "none",
    commanderText: snapshot.commanderText ?? null,
    cards: snapshot.cards.filter((card) => !card.isCommander),
    previous:
      comparable?.grade && changes
        ? {
            score: comparable.grade.score,
            breakdown: comparable.grade.breakdown,
            added: changes.added.map(formatCard),
            removed: changes.removed.map(formatCard),
          }
        : null,
    settledEdits,
  };
}

async function gradeSnapshot(
  snapshot: DeckSnapshot,
  goal: string | null,
  earlier: { snapshot: DeckSnapshot; grade: VersionGrade | null } | null,
  settledEdits?: CardDecisions | null,
): Promise<DeckGrade> {
  return gradeDeck(buildGradeInput(snapshot, goal, earlier, settledEdits));
}

/** The closest version before `number` that has a grade, as a comparison baseline. */
export async function loadEarlierGraded(deckId: string, beforeNumber?: number) {
  const version = await prisma.deckVersion.findFirst({
    where: {
      deckId,
      gradeScore: { not: null },
      ...(beforeNumber !== undefined ? { number: { lt: beforeNumber } } : {}),
    },
    orderBy: { number: "desc" },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });
  return version ? { snapshot: snapshotOf(version), grade: gradeOf(version) } : null;
}

function formatChangesForPrompt(changes: DeckVersionChanges): string {
  const lines: string[] = [];
  if (changes.commander) {
    lines.push(`Commander: ${changes.commander.from ?? "none"} -> ${changes.commander.to ?? "none"}`);
  }
  for (const card of changes.added) lines.push(`Added: ${card.name}${card.quantity > 1 ? ` x${card.quantity}` : ""}`);
  for (const card of changes.removed) lines.push(`Removed: ${card.name}${card.quantity > 1 ? ` x${card.quantity}` : ""}`);
  for (const card of changes.changed) lines.push(`Quantity: ${card.name} ${card.from} -> ${card.to}`);
  return lines.join("\n");
}

/**
 * Drafts a short changelog for the deck's unsaved edits (vs its latest
 * version) for the user to edit before saving. The first version has nothing
 * to compare against, so it gets a fixed description with no LLM call.
 */
export async function draftVersionDescription(deckId: string): Promise<string> {
  const deck = await loadDeck(deckId);
  const latest = await loadLatestVersion(deckId);

  if (!latest) {
    return "Initial version";
  }

  const changes = diffSnapshots(snapshotOf(latest), snapshotOf(deck));
  if (!hasChanges(changes)) {
    throw new DeckVersionError("No changes since the last version");
  }

  const prompt = [
    "You are writing a short changelog entry for a new version of a Magic: The Gathering Commander/EDH deck.",
    `Commander: ${deck.commanderCard?.name ?? "none"}`,
    "",
    "What changed since the previous version:",
    formatChangesForPrompt(changes),
    "",
    "Write one or two plain sentences saying what changed and why it likely matters to how the deck plays.",
    "Do not list every card if there are many; group them by theme. No headings or bullet points.",
  ].join("\n");

  return (await getLlmProvider().complete(prompt)).trim();
}

/** The deck's own stored grade, if it was made for these exact cards and this goal. */
function freshDeckGrade(
  deck: GradedVersionFields & {
    gradeSignature?: string | null;
    commanderCardId: string | null;
    cards: { cardId: string; quantity: number; isCommander: boolean }[];
  },
  goal: string,
): VersionGrade | null {
  const grade = gradeOf(deck);
  if (!grade || grade.goal !== goal || deck.gradeSignature !== deckSignature(deck.commanderCardId, deck.cards)) {
    return null;
  }
  return grade;
}

/**
 * Saves the deck's current cards and commander as the next version. Rejects
 * an empty description, a deck with no cards, and a deck identical to its
 * latest version (nothing to record).
 */
export async function saveDeckVersion(deckId: string, description: string) {
  const trimmed = description.trim();
  if (!trimmed) {
    throw new DeckVersionError("A description of what changed is required");
  }

  const deck = await loadDeck(deckId);
  if (deck.cards.length === 0) {
    throw new DeckVersionError("Build the deck before saving a version");
  }

  const latest = await loadLatestVersion(deckId);
  if (latest && !hasChanges(diffSnapshots(snapshotOf(latest), snapshotOf(deck)))) {
    throw new DeckVersionError("No changes since the last version");
  }

  // Grading is a bonus on top of saving: if the model is down or answers
  // unreadably, the version is still saved (ungraded) and can be graded later.
  let gradeData: ReturnType<typeof gradeColumns> | null = null;
  const goal = deck.goal?.trim();
  if (goal) {
    const fresh = freshDeckGrade(deck, goal);
    if (fresh) {
      // The critique already graded exactly these cards against this goal.
      gradeData = {
        gradeScore: fresh.score,
        gradeGoal: goal,
        gradeBreakdown: fresh.breakdown as unknown as Prisma.InputJsonValue,
        gradeSummary: fresh.summary,
      };
    } else {
      try {
        gradeData = gradeColumns(await gradeSnapshot(snapshotOf(deck), goal, await loadEarlierGraded(deckId)), goal);
      } catch {
        gradeData = null;
      }
    }
  }

  return prisma.deckVersion.create({
    data: {
      deckId,
      number: (latest?.number ?? 0) + 1,
      description: trimmed,
      commanderCardId: deck.commanderCardId,
      ...gradeData,
      cards: {
        create: deck.cards.map((deckCard) => ({
          cardId: deckCard.cardId,
          quantity: deckCard.quantity,
          isCommander: deckCard.isCommander,
        })),
      },
    },
  });
}

/**
 * Grades the deck as it stands now (saved or not) against its goal, anchored
 * to the latest graded version so the result is comparable with history. The
 * caller stores it on the deck; saving a version then reuses it while the
 * cards and goal are unchanged.
 */
export async function gradeCurrentDeck(
  deckId: string,
): Promise<DeckGrade & { goal: string; signature: string }> {
  const deck = await loadDeck(deckId);
  const goal = deck.goal?.trim() || null;
  if (deck.cards.length === 0) {
    throw new DeckVersionError("Build the deck before grading it");
  }

  let grade: DeckGrade;
  try {
    grade = await gradeSnapshot(
      snapshotOf(deck),
      goal,
      await loadEarlierGraded(deckId),
      parseCardDecisions(deck.cardDecisions),
    );
  } catch (error) {
    throw new DeckVersionError(error instanceof Error ? error.message : "Couldn't grade this deck");
  }

  return {
    ...grade,
    goal: goal ?? grade.winCondition ?? DEFAULT_GRADE_GOAL,
    signature: deckSignature(deck.commanderCardId, deck.cards),
  };
}

/**
 * (Re)grades a saved version against the deck's current goal and stores the
 * result on it. Unlike saving, failures surface to the caller.
 */
export async function gradeDeckVersion(deckId: string, versionId: string): Promise<VersionGrade> {
  const version = await prisma.deckVersion.findUnique({
    where: { id: versionId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!version || version.deckId !== deckId) {
    throw new DeckVersionError("Version not found");
  }

  const deck = await loadDeck(deckId);
  const goal = deck.goal?.trim();
  if (!goal) {
    throw new DeckVersionError("Set a goal for this deck before grading it");
  }

  let grade: DeckGrade;
  try {
    grade = await gradeSnapshot(snapshotOf(version), goal, await loadEarlierGraded(deckId, version.number));
  } catch (error) {
    throw new DeckVersionError(error instanceof Error ? error.message : "Couldn't grade this version");
  }

  await prisma.deckVersion.update({ where: { id: versionId }, data: gradeColumns(grade, goal) });
  return { score: grade.score, goal, breakdown: grade.breakdown, summary: grade.summary };
}

/** Versions newest first, each with its diff against the version before it. */
export async function listDeckVersions(deckId: string): Promise<DeckVersionSummary[]> {
  const versions = await prisma.deckVersion.findMany({
    where: { deckId },
    orderBy: { number: "asc" },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  const summaries = versions.map((version, index) => ({
    id: version.id,
    number: version.number,
    description: version.description,
    createdAt: version.createdAt,
    cardCount: version.cards.reduce((sum, card) => sum + card.quantity, 0),
    changes: diffSnapshots(index > 0 ? snapshotOf(versions[index - 1]) : null, snapshotOf(version)),
    grade: gradeOf(version),
  }));

  return summaries.reverse();
}

/**
 * Makes the deck match a saved version again (cards and commander), then
 * records that as a new version so history is never rewritten.
 */
export async function restoreDeckVersion(deckId: string, versionId: string) {
  const version = await prisma.deckVersion.findUnique({
    where: { id: versionId },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!version || version.deckId !== deckId) {
    throw new DeckVersionError("Version not found");
  }

  const deck = await loadDeck(deckId);
  if (!hasChanges(diffSnapshots(snapshotOf(version), snapshotOf(deck)))) {
    throw new DeckVersionError("The deck already matches this version");
  }

  const latest = await loadLatestVersion(deckId);

  const [, , , restored] = await prisma.$transaction([
    prisma.deckCard.deleteMany({ where: { deckId } }),
    prisma.deckCard.createMany({
      data: version.cards.map((card) => ({
        deckId,
        cardId: card.cardId,
        quantity: card.quantity,
        isCommander: card.isCommander,
      })),
    }),
    prisma.deck.update({ where: { id: deckId }, data: { commanderCardId: version.commanderCardId } }),
    prisma.deckVersion.create({
      data: {
        deckId,
        number: (latest?.number ?? 0) + 1,
        description: `Restored version ${version.number}`,
        commanderCardId: version.commanderCardId,
        // Identical cards, so the restored version's grade still applies.
        gradeScore: version.gradeScore,
        gradeGoal: version.gradeGoal,
        gradeSummary: version.gradeSummary,
        ...(version.gradeBreakdown !== null
          ? { gradeBreakdown: version.gradeBreakdown as Prisma.InputJsonValue }
          : {}),
        cards: {
          create: version.cards.map((card) => ({
            cardId: card.cardId,
            quantity: card.quantity,
            isCommander: card.isCommander,
          })),
        },
      },
    }),
  ]);

  return restored;
}
