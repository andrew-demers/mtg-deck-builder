import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { deck: { findUnique: vi.fn() } } }));
vi.mock("@/lib/deck-version", () => ({
  listDeckVersions: vi.fn(),
  saveDeckVersion: vi.fn(),
  DeckVersionError: class DeckVersionError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listDeckVersions, saveDeckVersion, DeckVersionError } from "@/lib/deck-version";
import { GET, POST } from "@/app/api/decks/[id]/versions/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const listMock = listDeckVersions as unknown as ReturnType<typeof vi.fn>;
const saveMock = saveDeckVersion as unknown as ReturnType<typeof vi.fn>;

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/decks/deck_1/versions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "deck_1" }) };

describe("/api/decks/[id]/versions", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    listMock.mockReset();
    saveMock.mockReset();
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);

    expect((await GET(postRequest({}), params)).status).toBe(401);
    expect((await POST(postRequest({}), params)).status).toBe(401);
  });

  it("returns 404 for a missing deck and 403 for someone else's", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    deckFindUniqueMock.mockResolvedValue(null);
    expect((await GET(postRequest({}), params)).status).toBe(404);

    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });
    expect((await GET(postRequest({}), params)).status).toBe(403);
    expect((await POST(postRequest({ description: "x" }), params)).status).toBe(403);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("GET returns the version list", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    listMock.mockResolvedValue([{ id: "v1", number: 1 }]);

    const response = await GET(postRequest({}), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "v1", number: 1 }]);
  });

  it("POST returns 400 when the description is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });

    const response = await POST(postRequest({ description: "  " }), params);

    expect(response.status).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("POST saves a version and returns 201", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    saveMock.mockResolvedValue({ id: "v1", number: 1 });

    const response = await POST(postRequest({ description: "Initial" }), params);

    expect(response.status).toBe(201);
    expect(saveMock).toHaveBeenCalledWith("deck_1", "Initial");
  });

  it("POST maps a DeckVersionError to 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    saveMock.mockRejectedValue(new DeckVersionError("No changes since the last version"));

    const response = await POST(postRequest({ description: "x" }), params);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("No changes since the last version");
  });
});
