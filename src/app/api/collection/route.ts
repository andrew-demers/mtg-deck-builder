import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertCollectionEntry } from "@/lib/collection-entry";
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

interface AddCardBody {
  name?: unknown;
  quantity?: unknown;
  foil?: unknown;
}

/**
 * POST /api/collection - session-scoped. Adds `quantity` (default 1) copies
 * of the named card to the user's collection, on top of whatever is already
 * owned. The name is matched against the synced card catalog (case-insensitive;
 * a multi-faced card also matches by its front face), so it can come straight
 * from Scryfall autocomplete. 404 if the catalog has no such card.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as AddCardBody | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const quantity = body?.quantity === undefined ? 1 : body.quantity;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
  }

  const card =
    (await prisma.card.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) ??
    (await prisma.card.findFirst({ where: { name: { startsWith: `${name} // `, mode: "insensitive" } } }));

  if (!card) {
    return NextResponse.json({ error: `No card named "${name}" in the card catalog` }, { status: 404 });
  }

  await upsertCollectionEntry(userId, card.id, {
    quantity,
    foil: body?.foil === true,
    onConflict: "add",
  });

  return NextResponse.json({ cardId: card.id, name: card.name }, { status: 201 });
}
