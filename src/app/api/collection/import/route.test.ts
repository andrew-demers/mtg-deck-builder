// @vitest-environment node
//
// Overrides the project-wide jsdom environment for this file only: jsdom's
// `File`/`FormData` are not the same objects Next.js's Request/undici expect,
// which trips an internal webidl assertion when the route handler calls
// `request.formData()`. Node's native File/FormData (global since Node 20)
// are compatible.
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    card: {
      findFirst: vi.fn(),
    },
    collectionEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    unmatchedImportRow: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/collection/import/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findFirstMock = prisma.card.findFirst as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = prisma.collectionEntry.findUnique as unknown as ReturnType<typeof vi.fn>;
const createEntryMock = prisma.collectionEntry.create as unknown as ReturnType<typeof vi.fn>;
const updateEntryMock = prisma.collectionEntry.update as unknown as ReturnType<typeof vi.fn>;
const findManyEntriesMock = prisma.collectionEntry.findMany as unknown as ReturnType<typeof vi.fn>;
const deleteManyEntriesMock = prisma.collectionEntry.deleteMany as unknown as ReturnType<
  typeof vi.fn
>;
const findUnmatchedMock = prisma.unmatchedImportRow.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const updateUnmatchedMock = prisma.unmatchedImportRow.update as unknown as ReturnType<
  typeof vi.fn
>;
const createUnmatchedMock = prisma.unmatchedImportRow.create as unknown as ReturnType<
  typeof vi.fn
>;

const CSV_TEXT = [
  "Name,Set Code,Quantity,Foil,Scryfall ID",
  "Sol Ring,C21,2,normal,scry-sol-ring",
  "Totally Fake Card,XYZ,1,foil,scry-fake",
].join("\n");

function buildRequest(csvText: string, replace = false): Request {
  const formData = new FormData();
  formData.set("file", new File([csvText], "collection.csv", { type: "text/csv" }));
  if (replace) {
    formData.set("replace", "true");
  }

  return new Request("http://localhost/api/collection/import", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/collection/import", () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirstMock.mockReset();
    findUniqueMock.mockReset();
    createEntryMock.mockReset();
    updateEntryMock.mockReset();
    createUnmatchedMock.mockReset();
    findManyEntriesMock.mockReset();
    deleteManyEntriesMock.mockReset();
    findUnmatchedMock.mockReset();
    updateUnmatchedMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildRequest(CSV_TEXT));

    expect(response.status).toBe(401);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("creates a CollectionEntry for a matched row and an UnmatchedImportRow for an unmatched row", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findFirstMock.mockImplementation(async ({ where }: { where: { name: { equals: string } } }) => {
      if (where.name.equals === "Sol Ring") {
        return { id: "card_sol_ring", name: "Sol Ring" };
      }
      return null;
    });
    findUniqueMock.mockResolvedValue(null);

    const response = await POST(buildRequest(CSV_TEXT));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ matched: 1, unmatched: 1, skippedTokens: 0, removed: 0 });

    expect(createEntryMock).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        cardId: "card_sol_ring",
        quantity: 2,
        foil: false,
        setCode: "C21",
        sourceScryfallId: "scry-sol-ring",
      },
    });
    expect(updateEntryMock).not.toHaveBeenCalled();

    expect(createUnmatchedMock).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        rawName: "Totally Fake Card",
        rawSet: "XYZ",
        quantity: 1,
        foil: true,
        status: "pending",
      },
    });
  });

  it("sets quantity to match the import instead of adding when a matching CollectionEntry already exists", async () => {
    // ManaBox (and similar tools) export a full collection snapshot each
    // time, so re-importing the same export must not double the counts -
    // the imported quantity replaces the stored one rather than adding to it.
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    findFirstMock.mockResolvedValue({ id: "card_sol_ring", name: "Sol Ring" });
    findUniqueMock.mockResolvedValue({
      id: "entry_1",
      userId: "user_1",
      cardId: "card_sol_ring",
      quantity: 5,
      foil: false,
    });

    const response = await POST(
      buildRequest("Name,Set Code,Quantity,Foil\nSol Ring,C21,2,normal\n"),
    );
    const data = await response.json();

    expect(data).toEqual({ matched: 1, unmatched: 0, skippedTokens: 0, removed: 0 });
    expect(createEntryMock).not.toHaveBeenCalled();
    expect(updateEntryMock).toHaveBeenCalledWith({
      where: { id: "entry_1" },
      data: { quantity: 2, setCode: "C21", sourceScryfallId: null },
    });
  });

  it("returns 400 with a clear error when the CSV has no Name column", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    const response = await POST(buildRequest("Set Code,Quantity,Foil\nLEA,1,normal\n"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/Name/i);
    expect(findFirstMock).not.toHaveBeenCalled();
  });
  describe("bulk exports", () => {
    const BULK_CSV = [
      "Binder Name,Name,Set code,Set name,Foil,Quantity,Scryfall ID",
      "Legit Cards,Forest,USG,Urza's Saga,normal,1,scry-forest-a",
      "Cool Lands,Forest,TDM,Tarkir: Dragonstorm,normal,8,scry-forest-b",
      "Legit Cards,Drone,TEOE,Edge of Eternities Tokens,normal,1,scry-drone",
    ].join("\n");

    it("sums duplicate rows across binders and skips token rows", async () => {
      authMock.mockResolvedValue({ user: { id: "user_1" } });
      findFirstMock.mockResolvedValue({ id: "card_forest", name: "Forest" });
      findUniqueMock.mockResolvedValue(null);

      const response = await POST(buildRequest(BULK_CSV));
      const data = await response.json();

      expect(data).toEqual({ matched: 1, unmatched: 0, skippedTokens: 1, removed: 0 });
      expect(createEntryMock).toHaveBeenCalledTimes(1);
      expect(createEntryMock).toHaveBeenCalledWith({
        data: expect.objectContaining({ cardId: "card_forest", quantity: 9, foil: false }),
      });
    });

    it("updates an existing pending unmatched row instead of creating a duplicate on re-import", async () => {
      authMock.mockResolvedValue({ user: { id: "user_1" } });
      findFirstMock.mockResolvedValue(null);
      findUnmatchedMock.mockResolvedValue({ id: "unmatched_1" });

      await POST(buildRequest("Name,Quantity,Foil\nTotally Fake Card,3,normal\n"));

      expect(createUnmatchedMock).not.toHaveBeenCalled();
      expect(updateUnmatchedMock).toHaveBeenCalledWith({
        where: { id: "unmatched_1" },
        data: { quantity: 3, rawSet: null },
      });
    });

    it("removes owned cards missing from the file when replace is set", async () => {
      authMock.mockResolvedValue({ user: { id: "user_1" } });
      findFirstMock.mockResolvedValue({ id: "card_forest", name: "Forest" });
      findUniqueMock.mockResolvedValue(null);
      findManyEntriesMock.mockResolvedValue([
        { id: "entry_forest", cardId: "card_forest", foil: false },
        { id: "entry_old", cardId: "card_sold", foil: false },
        { id: "entry_forest_foil", cardId: "card_forest", foil: true },
      ]);

      const response = await POST(buildRequest(BULK_CSV, true));
      const data = await response.json();

      expect(data.removed).toBe(2);
      expect(deleteManyEntriesMock).toHaveBeenCalledWith({
        where: { id: { in: ["entry_old", "entry_forest_foil"] } },
      });
    });

    it("does not remove anything when replace is set but no row matched a card", async () => {
      authMock.mockResolvedValue({ user: { id: "user_1" } });
      findFirstMock.mockResolvedValue(null);

      const response = await POST(
        buildRequest("Name,Quantity,Foil\nTotally Fake Card,3,normal\n", true),
      );
      const data = await response.json();

      expect(data.removed).toBe(0);
      expect(findManyEntriesMock).not.toHaveBeenCalled();
      expect(deleteManyEntriesMock).not.toHaveBeenCalled();
    });

    it("does not remove anything when replace is not set", async () => {
      authMock.mockResolvedValue({ user: { id: "user_1" } });
      findFirstMock.mockResolvedValue({ id: "card_forest", name: "Forest" });
      findUniqueMock.mockResolvedValue(null);

      await POST(buildRequest(BULK_CSV));

      expect(deleteManyEntriesMock).not.toHaveBeenCalled();
    });
  });
});
