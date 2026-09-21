import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    unmatchedImportRow: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    collectionEntry: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/collection/unmatched/[id]/resolve/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findUniqueRowMock = prisma.unmatchedImportRow.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const updateRowMock = prisma.unmatchedImportRow.update as unknown as ReturnType<typeof vi.fn>;
const findUniqueEntryMock = prisma.collectionEntry.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const createEntryMock = prisma.collectionEntry.create as unknown as ReturnType<typeof vi.fn>;
const updateEntryMock = prisma.collectionEntry.update as unknown as ReturnType<typeof vi.fn>;

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/collection/unmatched/row_1/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/collection/unmatched/[id]/resolve", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUniqueRowMock.mockReset();
    updateRowMock.mockReset();
    findUniqueEntryMock.mockReset();
    createEntryMock.mockReset();
    updateEntryMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ ignore: true }), buildParams("row_1"));

    expect(response.status).toBe(401);
    expect(findUniqueRowMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the row does not belong to the session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueRowMock.mockResolvedValue({
      id: "row_1",
      userId: "someone_else",
      rawName: "Totally Fake Card",
      rawSet: "XYZ",
      quantity: 1,
      foil: false,
      status: "pending",
    });

    const response = await POST(buildRequest({ ignore: true }), buildParams("row_1"));

    expect(response.status).toBe(404);
    expect(updateRowMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the row does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueRowMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ ignore: true }), buildParams("missing"));

    expect(response.status).toBe(404);
  });

  it("marks the row ignored and does not touch CollectionEntry", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueRowMock.mockResolvedValue({
      id: "row_1",
      userId: "user_1",
      rawName: "Totally Fake Card",
      rawSet: "XYZ",
      quantity: 1,
      foil: false,
      status: "pending",
    });

    const response = await POST(buildRequest({ ignore: true }), buildParams("row_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "ignored" });
    expect(updateRowMock).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: { status: "ignored" },
    });
    expect(findUniqueEntryMock).not.toHaveBeenCalled();
    expect(createEntryMock).not.toHaveBeenCalled();
    expect(updateEntryMock).not.toHaveBeenCalled();
  });

  it("resolves the row to a card, creating a CollectionEntry and marking it resolved", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueRowMock.mockResolvedValue({
      id: "row_1",
      userId: "user_1",
      rawName: "Totally Fake Card",
      rawSet: "XYZ",
      quantity: 2,
      foil: true,
      status: "pending",
    });
    findUniqueEntryMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ cardId: "card_sol_ring" }), buildParams("row_1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "resolved" });
    expect(createEntryMock).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        cardId: "card_sol_ring",
        quantity: 2,
        foil: true,
        setCode: "XYZ",
        sourceScryfallId: undefined,
      },
    });
    expect(updateRowMock).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: { status: "resolved" },
    });
  });

  it("increments an existing CollectionEntry instead of duplicating on resolve", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueRowMock.mockResolvedValue({
      id: "row_1",
      userId: "user_1",
      rawName: "Totally Fake Card",
      rawSet: "XYZ",
      quantity: 2,
      foil: false,
      status: "pending",
    });
    findUniqueEntryMock.mockResolvedValue({
      id: "entry_1",
      userId: "user_1",
      cardId: "card_sol_ring",
      quantity: 3,
      foil: false,
    });

    const response = await POST(buildRequest({ cardId: "card_sol_ring" }), buildParams("row_1"));

    expect(response.status).toBe(200);
    expect(createEntryMock).not.toHaveBeenCalled();
    expect(updateEntryMock).toHaveBeenCalledWith({
      where: { id: "entry_1" },
      data: { quantity: 5, setCode: "XYZ", sourceScryfallId: undefined },
    });
  });

  it("returns 400 when neither cardId nor ignore is provided", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findUniqueRowMock.mockResolvedValue({
      id: "row_1",
      userId: "user_1",
      rawName: "Totally Fake Card",
      rawSet: "XYZ",
      quantity: 1,
      foil: false,
      status: "pending",
    });

    const response = await POST(buildRequest({}), buildParams("row_1"));

    expect(response.status).toBe(400);
    expect(updateRowMock).not.toHaveBeenCalled();
  });
});
