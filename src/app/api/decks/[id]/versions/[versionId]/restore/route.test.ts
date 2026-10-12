import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { deck: { findUnique: vi.fn() } } }));
vi.mock("@/lib/deck-version", () => ({
  restoreDeckVersion: vi.fn(),
  DeckVersionError: class DeckVersionError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { restoreDeckVersion, DeckVersionError } from "@/lib/deck-version";
import { POST } from "@/app/api/decks/[id]/versions/[versionId]/restore/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const restoreMock = restoreDeckVersion as unknown as ReturnType<typeof vi.fn>;

const request = new Request("http://localhost/api/decks/deck_1/versions/v1/restore", { method: "POST" });
const params = { params: Promise.resolve({ id: "deck_1", versionId: "v1" }) };

describe("POST /api/decks/[id]/versions/[versionId]/restore", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    restoreMock.mockReset();
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);

    expect((await POST(request, params)).status).toBe(401);
  });

  it("returns 403 for a deck owned by someone else", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });

    expect((await POST(request, params)).status).toBe(403);
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the version isn't found", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    restoreMock.mockRejectedValue(new DeckVersionError("Version not found"));

    expect((await POST(request, params)).status).toBe(404);
  });

  it("returns 400 when the deck already matches the version", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    restoreMock.mockRejectedValue(new DeckVersionError("The deck already matches this version"));

    expect((await POST(request, params)).status).toBe(400);
  });

  it("restores and returns the updated deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock
      .mockResolvedValueOnce({ id: "deck_1", userId: "user_1" })
      .mockResolvedValueOnce({ id: "deck_1", userId: "user_1", cards: [] });
    restoreMock.mockResolvedValue({ id: "v2" });

    const response = await POST(request, params);

    expect(response.status).toBe(200);
    expect(restoreMock).toHaveBeenCalledWith("deck_1", "v1");
    expect((await response.json()).id).toBe("deck_1");
  });
});
