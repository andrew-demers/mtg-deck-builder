import { prisma } from "@/lib/prisma";
import { searchCards, type ScryfallCardData } from "@/lib/scryfall";
import { validateColorIdentity } from "@/lib/commander-legality";
import type { Card } from "@/generated/prisma/client";

const CARDS_PER_QUERY = 30;
const MAX_SYNERGY_PHRASES = 3;

/** Scryfall Tagger roles every Commander deck wants some of. */
const ROLE_TAGS = ["ramp", "removal", "draw", "sweeper"];

/**
 * Builds the Scryfall searches that find buyable cards for a deck: every
 * query is limited to Commander-legal, non-basic cards inside the commander's
 * color identity that cost at most `budgetUsd` each (no single card can
 * exceed the whole budget), plus one per deck role, one per synergy phrase,
 * and one unrestricted "most popular" query.
 */
export function buildCandidateQueries(
  colorIdentity: string[],
  budgetUsd: number,
  synergyPhrases: string[],
): string[] {
  const base = `f:commander id<=${colorIdentity.join("").toLowerCase() || "c"} usd<=${budgetUsd} -t:basic`;
  return [
    base,
    ...ROLE_TAGS.map((tag) => `${base} otag:${tag}`),
    ...synergyPhrases.map((phrase) => `${base} o:"${phrase}"`),
  ];
}

/**
 * Pulls a few short oracle-text phrases (e.g. "treasure", "dragon you
 * control") from the LLM that suit the commander. Output is sanitised down to
 * plain words, since it ends up inside a Scryfall query.
 */
export function parseSynergyPhrases(completion: string): string[] {
  return completion
    .split("\n")
    .map((line) =>
      line
        .replace(/^[\s\d.\-*)]+/, "")
        .replace(/[^a-zA-Z0-9' -]/g, "")
        .trim()
        .toLowerCase(),
    )
    .filter((phrase) => phrase.length >= 3 && phrase.length <= 30)
    .slice(0, MAX_SYNERGY_PHRASES);
}

function buildSynergyPrompt(commanders: Card[]): string {
  const text = commanders.map((c) => `${c.name}: ${c.oracleText ?? ""}`).join("\n");
  return [
    "You are helping search for cards that synergize with a Magic: The Gathering Commander.",
    text,
    "",
    `List up to ${MAX_SYNERGY_PHRASES} short phrases (1-3 words each, e.g. "treasure", "dragon", "+1/+1 counter") that would appear in the rules text of cards that work well with this commander.`,
    "One phrase per line and nothing else.",
  ].join("\n");
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Finds cards to buy for a deck by searching Scryfall (which also returns
 * each card's current price), then maps the results onto local catalog
 * `Card` rows, since only those can be added to a deck. Scryfall prices are
 * written back to the catalog and reflected on the returned cards. Cards in
 * `excludeIds` (already in the deck, or owned) and results missing from the
 * local catalog or outside the color identity are dropped. Throws if
 * Scryfall is unreachable, so the caller doesn't silently ignore the budget.
 */
export async function findBudgetCandidates({
  commanders,
  colorIdentity,
  budgetUsd,
  excludeIds,
  complete,
}: {
  commanders: Card[];
  colorIdentity: string[];
  budgetUsd: number;
  excludeIds: string[];
  complete: (prompt: string) => Promise<string>;
}): Promise<Card[]> {
  // A failed synergy lookup just means a less targeted search.
  const phrases = await complete(buildSynergyPrompt(commanders)).then(parseSynergyPhrases, () => []);

  const byName = new Map<string, ScryfallCardData>();
  for (const query of buildCandidateQueries(colorIdentity, budgetUsd, phrases)) {
    for (const found of await searchCards(query, CARDS_PER_QUERY)) {
      if (found.priceUsd !== null && found.priceUsd <= budgetUsd) {
        byName.set(normalize(found.name), found);
      }
    }
  }

  if (byName.size === 0) {
    return [];
  }

  const names = [...byName.values()].flatMap((found) => [found.name, found.name.split(" // ")[0]]);
  const local = await prisma.card.findMany({
    where: { name: { in: [...new Set(names)] }, id: { notIn: excludeIds } },
  });

  const results: Card[] = [];
  for (const card of local) {
    const found = byName.get(normalize(card.name)) ?? byName.get(normalize(card.name.split(" // ")[0]));
    if (!found || !validateColorIdentity(colorIdentity, [card])) {
      continue;
    }
    results.push({ ...card, priceUsd: found.priceUsd, priceUsdFoil: found.priceUsdFoil });
  }

  const now = new Date();
  await Promise.all(
    results.map((card) =>
      prisma.card.update({
        where: { id: card.id },
        data: { priceUsd: card.priceUsd, priceUsdFoil: card.priceUsdFoil, pricesUpdatedAt: now },
      }),
    ),
  );

  return results;
}
