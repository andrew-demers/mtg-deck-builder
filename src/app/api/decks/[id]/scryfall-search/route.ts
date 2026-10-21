import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { searchCards } from "@/lib/scryfall";
import { isBasicLand, unionColorIdentity, validateColorIdentity } from "@/lib/commander-legality";
import type { Card } from "@/generated/prisma/client";

const MIN_QUERY_LENGTH = 2;
const SCRYFALL_LIMIT = 60;
const RESULT_LIMIT = 20;

/** Strips quotes so a typed name can't break out of a Scryfall `name:` query. */
export function cleanedCardQuery(raw: string): string | null {
  const cleaned = raw.replace(/["\\]/g, "").trim();
  return cleaned.length < MIN_QUERY_LENGTH ? null : cleaned;
}

/**
 * Scryfall's `name:` operator is a substring match. Quoting the text keeps
 * spaces and punctuation as part of the name instead of search syntax.
 */
export function scryfallNameQuery(raw: string): string | null {
  const cleaned = cleanedCardQuery(raw);
  return cleaned ? `name:"${cleaned}"` : null;
}

function toCardData(card: Card) {
  return {
    id: card.id,
    name: card.name,
    manaCost: card.manaCost,
    manaValue: card.manaValue,
    type: card.type,
    types: card.types,
    colors: card.colors,
    colorIdentity: card.colorIdentity,
    oracleText: card.oracleText,
    priceUsd: card.priceUsd,
  };
}

/**
 * Scryfall orders by popularity. When it can't be reached (or has no hits),
 * the synced catalog is searched by name instead so the deck can still be edited.
 */
async function cardsInSearchOrder(cleaned: string, nameQuery: string): Promise<Card[]> {
  try {
    const found = await searchCards(nameQuery, SCRYFALL_LIMIT);
    if (found.length > 0) {
      const localCards = await prisma.card.findMany({
        where: { name: { in: found.map((card) => card.name) } },
      });
      const byName = new Map(localCards.map((card) => [card.name.toLowerCase(), card]));
      const ordered = found.flatMap((hit) => {
        const card = byName.get(hit.name.toLowerCase());
        return card ? [card] : [];
      });
      if (ordered.length > 0) {
        return ordered;
      }
    }
  } catch {
    // Fall through to the catalog.
  }

  const localCards = await prisma.card.findMany({
    where: { name: { contains: cleaned, mode: "insensitive" } },
    take: 50,
  });
  return [...localCards].sort(
    (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name),
  );
}

/**
 * GET /api/decks/[id]/scryfall-search?q=... - session-scoped. Searches every
 * card by name: Scryfall first (EDHREC order), then the local catalog if
 * Scryfall can't be reached. Hits are catalog rows so they can be added by
 * id. Cards outside the commander's color identity or already in the deck are
 * dropped. Basic lands stay even when the deck already has a copy. 404 if the
 * deck doesn't exist, 403 if it belongs to a different user. A short or blank
 * query is an empty list.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const deck = await prisma.deck.findUnique({
    where: { id },
    include: { commanderCard: true, cards: { include: { card: true } } },
  });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawQuery = new URL(request.url).searchParams.get("q") ?? "";
  const cleaned = cleanedCardQuery(rawQuery);
  const nameQuery = scryfallNameQuery(rawQuery);
  if (!cleaned || !nameQuery) {
    return NextResponse.json([]);
  }

  const ordered = await cardsInSearchOrder(cleaned, nameQuery);

  const commanderDeckCards = deck.cards.filter((deckCard) => deckCard.isCommander);
  const commanders =
    commanderDeckCards.length > 0
      ? commanderDeckCards.map((deckCard) => deckCard.card)
      : deck.commanderCard
        ? [deck.commanderCard]
        : [];
  const colorIdentity = unionColorIdentity(commanders);
  const deckCardIds = new Set(deck.cards.map((deckCard) => deckCard.cardId));

  const matches = [];
  for (const card of ordered) {
    if (!validateColorIdentity(colorIdentity, [card])) {
      continue;
    }
    if (deckCardIds.has(card.id) && !isBasicLand(card)) {
      continue;
    }
    matches.push(toCardData(card));
    if (matches.length >= RESULT_LIMIT) {
      break;
    }
  }

  return NextResponse.json(matches);
}
