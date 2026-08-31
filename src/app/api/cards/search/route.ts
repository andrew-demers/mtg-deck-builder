import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json([]);
  }

  const cards = await prisma.card.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 50,
  });

  const results = [...cards]
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, 20)
    .map((card) => ({
      id: card.id,
      name: card.name,
      type: card.type,
      manaCost: card.manaCost,
    }));

  return NextResponse.json(results);
}
