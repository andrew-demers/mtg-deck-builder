import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/health/route";

const queryMock = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/health", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns 200 when the database responds", async () => {
    queryMock.mockResolvedValue([{ "?column?": 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    queryMock.mockRejectedValue(new Error("connection refused"));
    expect((await GET()).status).toBe(503);
  });
});
