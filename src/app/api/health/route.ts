import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health - unauthenticated. Pings the database so the Docker
 * HEALTHCHECK reflects the app actually being able to serve requests, not
 * just the process being alive. 503 if the database is unreachable.
 */
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
