import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    unmatchedImportRow: {
      findMany: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/collection/unmatched/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findManyMock = prisma.unmatchedImportRow.findMany as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/collection/unmatched", () => {
  beforeEach(() => {
    authMock.mockReset();
    findManyMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("returns pending rows scoped to the session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    findManyMock.mockResolvedValue([
      {
        id: "row_1",
        userId: "user_1",
        rawName: "Totally Fake Card",
        rawSet: "XYZ",
        quantity: 1,
        foil: false,
        status: "pending",
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user_1", status: "pending" },
      orderBy: { createdAt: "asc" },
    });
    expect(data).toEqual([
      {
        id: "row_1",
        rawName: "Totally Fake Card",
        rawSet: "XYZ",
        quantity: 1,
        foil: false,
        createdAt: createdAt.toISOString(),
      },
    ]);
  });
});
