import { prisma } from "@/lib/prisma";
import { getLlmProvider } from "@/lib/llm";
import type { Card } from "@/generated/prisma/client";

export class DeckWizardError extends Error {}

export interface CommanderSuggestion {
  card: Card;
  reason: string;
}

export interface PlaystylePreferences {
  winCondition: string;
  pace: string;
  notes?: string;
}

/**
 * Asks the LLM to recommend owned, commander-eligible cards as Commanders
 * that fit the win condition/pace the player says they want to play, as the
 * first step of the "build a deck from my collection" wizard - the player
 * states their preferences directly rather than the wizard inferring an
 * archetype from their collection first.
 *
 * The LLM's suggestions are never trusted directly: each returned name is
 * matched case-insensitively against the user's owned commander-eligible
 * cards, and anything hallucinated (not owned, or not commander-eligible)
 * is dropped silently. The accompanying reason is free text and is trusted
 * as-is.
 */
export async function suggestCommandersForPreferences(
  userId: string,
  preferences: PlaystylePreferences,
): Promise<CommanderSuggestion[]> {
  const entries = await prisma.collectionEntry.findMany({
    where: { userId, card: { isCommanderEligible: true } },
    include: { card: true },
  });

  if (entries.length === 0) {
    throw new DeckWizardError("You have no commander-eligible cards in your collection.");
  }

  const eligibleCards = dedupeById(entries.map((entry) => entry.card));
  const cardsByName = new Map(eligibleCards.map((card) => [normalize(card.name), card]));

  const completion = await getLlmProvider().complete(buildCommanderPrompt(preferences, eligibleCards));
  const parsed = parseCommanderSuggestions(completion);

  const matched = new Map<string, CommanderSuggestion>();
  for (const { name, reason } of parsed) {
    const card = cardsByName.get(normalize(name));
    if (!card) {
      continue; // hallucinated or not owned/commander-eligible
    }
    matched.set(card.id, { card, reason });
  }

  return Array.from(matched.values());
}

function dedupeById(cards: Card[]): Card[] {
  const byId = new Map<string, Card>();
  for (const card of cards) {
    byId.set(card.id, card);
  }
  return Array.from(byId.values());
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function buildCommanderPrompt(preferences: PlaystylePreferences, eligibleCards: Card[]): string {
  const names = eligibleCards.map((card) => `- ${card.name}`).join("\n");

  return [
    "You are helping a Magic: The Gathering player choose a Commander for a Commander/EDH deck.",
    `Preferred win condition: ${preferences.winCondition}`,
    `Preferred pace/gameplay style: ${preferences.pace}`,
    preferences.notes ? `Other preferences: ${preferences.notes}` : null,
    "",
    "Here are the commander-eligible cards they currently own:",
    names,
    "",
    "Suggest up to 8 cards from this list that would make good Commanders for the stated win condition and pace, ranked best first.",
    "Respond with one suggestion per line in exactly this format and nothing else:",
    "Card Name :: One-sentence reason this card fits the stated preferences.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function parseCommanderSuggestions(completion: string): { name: string; reason: string }[] {
  return completion
    .split("\n")
    .map((line) => line.replace(/^[\s\d.\-)]+/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name, reason] = line.split("::").map((part) => part?.trim());
      return name && reason ? { name, reason } : null;
    })
    .filter((entry): entry is { name: string; reason: string } => entry !== null);
}
