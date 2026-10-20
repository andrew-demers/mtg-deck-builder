import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    card: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/collection-entry", () => ({
  upsertCollectionEntry: vi.fn(),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertCollectionEntry } from "@/lib/collection-entry";
import { POST } from "@/app/api/collection/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const findFirstMock = prisma.card.findFirst as unknown as ReturnType<typeof vi.fn>;
const upsertMock = upsertCollectionEntry as unknown as ReturnType<typeof vi.fn>;

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/collection", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/collection", () => {
  beforeEach(() => {
    authMock.mockReset();
    findFirstMock.mockReset();
    upsertMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ name: "Sol Ring" }));

    expect(response.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing name or a bad quantity", async () => {
    expect((await POST(buildRequest({ name: "  " }))).status).toBe(400);
    expect((await POST(buildRequest({ name: "Sol Ring", quantity: 0 }))).status).toBe(400);
    expect((await POST(buildRequest({ name: "Sol Ring", quantity: 1.5 }))).status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the catalog has no matching card", async () => {
    findFirstMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ name: "Not A Card" }));

    expect(response.status).toBe(404);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("adds the matched card on top of what is already owned", async () => {
    findFirstMock.mockResolvedValue({ id: "card_1", name: "Sol Ring" });

    const response = await POST(buildRequest({ name: "sol ring", quantity: 2, foil: true }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ cardId: "card_1", name: "Sol Ring" });
    expect(upsertMock).toHaveBeenCalledWith("user_1", "card_1", {
      quantity: 2,
      foil: true,
      onConflict: "add",
    });
  });

  it("falls back to matching a multi-faced card by its front face", async () => {
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "card_2", name: "Delver of Secrets // Insectile Aberration" });

    const response = await POST(buildRequest({ name: "Delver of Secrets" }));

    expect(response.status).toBe(201);
    expect(upsertMock).toHaveBeenCalledWith("user_1", "card_2", {
      quantity: 1,
      foil: false,
      onConflict: "add",
    });
  });
});
