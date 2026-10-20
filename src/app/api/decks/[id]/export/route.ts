import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatManaBoxCsv } from "@/lib/manabox-csv";
import { buildDeckExportRows } from "@/lib/deck-export";
import { formatDeckText } from "@/lib/deck-text-export";

function slugifyDeckName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "deck";
}

/**
 * GET /api/decks/[id]/export - session-scoped. Downloads the deck as a
 * ManaBox-format CSV (Name, Set code, Scryfall ID, Quantity, Foil). Set
 * code/Scryfall ID/foil are best-effort, filled in from the caller's owned
 * CollectionEntry for each card when one exists - DeckCard itself only
 * tracks name and quantity. 404 if the deck doesn't exist, 403 if it belongs
 * to a different user.
 *
 * `?format=arena` or `?format=mtgo` returns a plain-text decklist for that
 * client instead (commander split out, names only); anything else is the CSV.
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
  const format = new URL(request.url).searchParams.get("format");

  const deck = await prisma.deck.findUnique({ where: { id } });

  if (!deck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (deck.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deckCards = await prisma.deckCard.findMany({
    where: { deckId: id },
    include: { card: true },
  });

  const slug = slugifyDeckName(deck.name);

  if (format === "arena" || format === "mtgo") {
    return new NextResponse(formatDeckText(deckCards, deck.commanderCardId, format), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-${format}.txt"`,
      },
    });
  }

  const collectionEntries = await prisma.collectionEntry.findMany({
    where: { userId, cardId: { in: deckCards.map((deckCard) => deckCard.cardId) } },
  });

  const rows = buildDeckExportRows(deckCards, collectionEntries);
  const csv = formatManaBoxCsv(rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.csv"`,
    },
  });
}
