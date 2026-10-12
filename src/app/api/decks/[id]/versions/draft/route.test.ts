import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { deck: { findUnique: vi.fn() } } }));
vi.mock("@/lib/deck-version", () => ({
  draftVersionDescription: vi.fn(),
  DeckVersionError: class DeckVersionError extends Error {},
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { draftVersionDescription, DeckVersionError } from "@/lib/deck-version";
import { POST } from "@/app/api/decks/[id]/versions/draft/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const deckFindUniqueMock = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const draftMock = draftVersionDescription as unknown as ReturnType<typeof vi.fn>;

const request = new Request("http://localhost/api/decks/deck_1/versions/draft", { method: "POST" });
const params = { params: Promise.resolve({ id: "deck_1" }) };

describe("POST /api/decks/[id]/versions/draft", () => {
  beforeEach(() => {
    authMock.mockReset();
    deckFindUniqueMock.mockReset();
    draftMock.mockReset();
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);

    expect((await POST(request, params)).status).toBe(401);
  });

  it("returns 404 and 403 for a missing or foreign deck", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    deckFindUniqueMock.mockResolvedValue(null);
    expect((await POST(request, params)).status).toBe(404);

    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "someone_else" });
    expect((await POST(request, params)).status).toBe(403);
    expect(draftMock).not.toHaveBeenCalled();
  });

  it("returns the drafted description", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    draftMock.mockResolvedValue("Swapped X for Y.");

    const response = await POST(request, params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ description: "Swapped X for Y." });
  });

  it("maps a DeckVersionError to 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    deckFindUniqueMock.mockResolvedValue({ id: "deck_1", userId: "user_1" });
    draftMock.mockRejectedValue(new DeckVersionError("No changes since the last version"));

    expect((await POST(request, params)).status).toBe(400);
  });
});
