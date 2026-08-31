import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, type Card, type CollectionEntry } from "@/generated/prisma/client";

type CollectionEntryWithCard = CollectionEntry & { card: Card };

type SortKey = "name" | "manaValue";

function parseFiniteNumber(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSort(value: string | null): SortKey {
  return value === "manaValue" ? "manaValue" : "name";
}

/**
 * `colorIdentity` subset filter: keeps entries whose card's colorIdentity is
 * entirely contained within the requested color set (colorless cards always
 * pass). Prisma has no native "array is subset of" filter, so this runs in
 * JS against the (per-user, not per-catalog) result set already narrowed by
 * the other filters pushed into the `where` clause below.
 */
function matchesColorSubset(colorIdentity: string[], allowedColors: Set<string>): boolean {
  return colorIdentity.every((color) => allowedColors.has(color));
}

function buildCardWhere(searchParams: URLSearchParams): Prisma.CardWhereInput {
  const cardWhere: Prisma.CardWhereInput = {};

  const minManaValue = parseFiniteNumber(searchParams.get("minManaValue"));
  const maxManaValue = parseFiniteNumber(searchParams.get("maxManaValue"));

  if (minManaValue !== undefined || maxManaValue !== undefined) {
    cardWhere.manaValue = {
      ...(minManaValue !== undefined ? { gte: minManaValue } : {}),
      ...(maxManaValue !== undefined ? { lte: maxManaValue } : {}),
    };
  }

  const type = searchParams.get("type");
  if (type) {
    cardWhere.type = { contains: type, mode: "insensitive" };
  }

  if (searchParams.get("commanderEligible") === "true") {
    cardWhere.isCommanderEligible = true;
  }

  return cardWhere;
}

/**
 * GET /api/collection - session-scoped. Returns the user's CollectionEntry
 * rows with their Card joined in as `card`, i.e. each element of the
 * response array is `{ id, quantity, foil, setCode, sourceScryfallId, card:
 * { name, manaCost, manaValue, colors, colorIdentity, type, ... } }`.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const cardWhere = buildCardWhere(searchParams);
  const sort = parseSort(searchParams.get("sort"));

  const where: Prisma.CollectionEntryWhereInput = {
    userId,
    ...(Object.keys(cardWhere).length > 0 ? { card: cardWhere } : {}),
  };

  let entries = (await prisma.collectionEntry.findMany({
    where,
    include: { card: true },
  })) as CollectionEntryWithCard[];

  const colorsParam = searchParams.get("colors");
  if (colorsParam) {
    const allowedColors = new Set(
      colorsParam
        .split(",")
        .map((color) => color.trim().toUpperCase())
        .filter((color) => color.length > 0),
    );

    entries = entries.filter((entry) => matchesColorSubset(entry.card.colorIdentity, allowedColors));
  }

  entries = [...entries].sort((a, b) =>
    sort === "manaValue"
      ? a.card.manaValue - b.card.manaValue
      : a.card.name.localeCompare(b.card.name),
  );

  return NextResponse.json(entries);
}
