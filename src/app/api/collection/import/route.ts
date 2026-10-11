import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  aggregateManaBoxRows,
  isTokenRow,
  parseManaBoxCsv,
  type ManaBoxRow,
} from "@/lib/manabox-csv";
import { upsertCollectionEntry } from "@/lib/collection-entry";

/**
 * Records a row that matched no card. Re-importing the same file must not
 * pile up duplicates, so an existing pending row for the same name and finish
 * is updated in place instead.
 */
async function recordUnmatchedRow(userId: string, row: ManaBoxRow): Promise<void> {
  const existing = await prisma.unmatchedImportRow.findFirst({
    where: { userId, rawName: row.name, foil: row.foil, status: "pending" },
  });

  if (existing) {
    await prisma.unmatchedImportRow.update({
      where: { id: existing.id },
      data: { quantity: row.quantity, rawSet: row.setCode },
    });
    return;
  }

  await prisma.unmatchedImportRow.create({
    data: {
      userId,
      rawName: row.name,
      rawSet: row.setCode,
      quantity: row.quantity,
      foil: row.foil,
      status: "pending",
    },
  });
}

/**
 * POST /api/collection/import - session-scoped. Imports a ManaBox CSV export
 * (a single binder or a bulk export of everything). Token rows are skipped,
 * and rows for the same card and finish across printings/binders are summed.
 * With form field `replace=true`, owned cards missing from the file are
 * removed so the collection mirrors the export exactly (decks are untouched).
 * Returns `{ matched, unmatched, skippedTokens, removed }`.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "A CSV file is required" }, { status: 400 });
  }

  const replace = formData.get("replace") === "true";
  const csvText = await file.text();

  let rows: ManaBoxRow[];

  try {
    rows = parseManaBoxCsv(csvText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid CSV";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const importable = rows.filter((row) => !isTokenRow(row));
  const skippedTokens = rows.length - importable.length;

  let matched = 0;
  let unmatched = 0;
  const keptEntryKeys = new Set<string>();

  for (const row of aggregateManaBoxRows(importable)) {
    const card = await prisma.card.findFirst({
      where: { name: { equals: row.name, mode: "insensitive" } },
    });

    if (card) {
      await upsertCollectionEntry(userId, card.id, {
        quantity: row.quantity,
        foil: row.foil,
        setCode: row.setCode,
        sourceScryfallId: row.scryfallId,
      });
      keptEntryKeys.add(`${card.id}|${row.foil}`);
      matched += 1;
    } else {
      await recordUnmatchedRow(userId, row);
      unmatched += 1;
    }
  }

  let removed = 0;

  // Guard: never wipe the collection because a file matched nothing at all.
  if (replace && matched > 0) {
    const owned = await prisma.collectionEntry.findMany({
      where: { userId },
      select: { id: true, cardId: true, foil: true },
    });
    const staleIds = owned
      .filter((entry) => !keptEntryKeys.has(`${entry.cardId}|${entry.foil}`))
      .map((entry) => entry.id);

    if (staleIds.length > 0) {
      await prisma.collectionEntry.deleteMany({ where: { id: { in: staleIds } } });
    }
    removed = staleIds.length;
  }

  return NextResponse.json({ matched, unmatched, skippedTokens, removed });
}
