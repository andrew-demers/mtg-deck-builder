import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertCollectionEntry } from "@/lib/collection-entry";

interface ResolveBody {
  cardId?: string;
  ignore?: boolean;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const row = await prisma.unmatchedImportRow.findUnique({ where: { id } });

  if (!row || row.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as ResolveBody | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.ignore) {
    await prisma.unmatchedImportRow.update({
      where: { id },
      data: { status: "ignored" },
    });

    return NextResponse.json({ status: "ignored" });
  }

  if (!body.cardId) {
    return NextResponse.json({ error: "cardId or ignore is required" }, { status: 400 });
  }

  await upsertCollectionEntry(userId, body.cardId, {
    quantity: row.quantity,
    foil: row.foil,
    setCode: row.rawSet,
  });

  await prisma.unmatchedImportRow.update({
    where: { id },
    data: { status: "resolved" },
  });

  return NextResponse.json({ status: "resolved" });
}
