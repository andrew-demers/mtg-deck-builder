import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseManaBoxCsv, type ManaBoxRow } from "@/lib/manabox-csv";

/**
 * Finds the matching `Card` for a ManaBox row (case-insensitive exact name
 * match) and either increments an existing `CollectionEntry` (same
 * user+card+foil) or creates a new one. This is a read-then-write rather
 * than a single upsert because the `quantity` on conflict needs to be
 * *added to* the existing value, not overwritten - fine for import volumes,
 * not a hot path.
 */
async function applyMatchedRow(userId: string, cardId: string, row: ManaBoxRow): Promise<void> {
  const existing = await prisma.collectionEntry.findUnique({
    where: { userId_cardId_foil: { userId, cardId, foil: row.foil } },
  });

  if (existing) {
    await prisma.collectionEntry.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + row.quantity },
    });
    return;
  }

  await prisma.collectionEntry.create({
    data: {
      userId,
      cardId,
      quantity: row.quantity,
      foil: row.foil,
      setCode: row.setCode,
      sourceScryfallId: row.scryfallId,
    },
  });
}

async function recordUnmatchedRow(userId: string, row: ManaBoxRow): Promise<void> {
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

  const csvText = await file.text();

  let rows: ManaBoxRow[];

  try {
    rows = parseManaBoxCsv(csvText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid CSV";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let matched = 0;
  let unmatched = 0;

  for (const row of rows) {
    const card = await prisma.card.findFirst({
      where: { name: { equals: row.name, mode: "insensitive" } },
    });

    if (card) {
      await applyMatchedRow(userId, card.id, row);
      matched += 1;
    } else {
      await recordUnmatchedRow(userId, row);
      unmatched += 1;
    }
  }

  return NextResponse.json({ matched, unmatched });
}
