import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseManaBoxCsv, type ManaBoxRow } from "@/lib/manabox-csv";
import { upsertCollectionEntry } from "@/lib/collection-entry";

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
      await upsertCollectionEntry(userId, card.id, {
        quantity: row.quantity,
        foil: row.foil,
        setCode: row.setCode,
        sourceScryfallId: row.scryfallId,
      });
      matched += 1;
    } else {
      await recordUnmatchedRow(userId, row);
      unmatched += 1;
    }
  }

  return NextResponse.json({ matched, unmatched });
}
