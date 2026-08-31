import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.unmatchedImportRow.findMany({
    where: { userId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      rawName: row.rawName,
      rawSet: row.rawSet,
      quantity: row.quantity,
      foil: row.foil,
      createdAt: row.createdAt,
    })),
  );
}
