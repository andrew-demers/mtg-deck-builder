import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/deck-wizard", () => ({
  suggestCommandersForPreferences: vi.fn(),
  DeckWizardError: class DeckWizardError extends Error {},
}));

import { auth } from "@/auth";
import { suggestCommandersForPreferences, DeckWizardError } from "@/lib/deck-wizard";
import { POST } from "@/app/api/decks/wizard/commanders/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const suggestCommandersMock = suggestCommandersForPreferences as unknown as ReturnType<typeof vi.fn>;

function buildRequest(body?: unknown): Request {
  return new Request("http://localhost/api/decks/wizard/commanders", {
    method: "POST",
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

const preferences = { winCondition: "Combat damage", pace: "Fast and aggressive" };

const suggestion = {
  card: { id: "cmd_1", name: "Krenko, Mob Boss" },
  reason: "Builds a wide board that swings for lethal quickly.",
};

describe("POST /api/decks/wizard/commanders", () => {
  beforeEach(() => {
    authMock.mockReset();
    suggestCommandersMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(buildRequest(preferences));

    expect(response.status).toBe(401);
    expect(suggestCommandersMock).not.toHaveBeenCalled();
  });

  it("returns 400 when winCondition is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    const response = await POST(buildRequest({ pace: "Fast and aggressive" }));

    expect(response.status).toBe(400);
    expect(suggestCommandersMock).not.toHaveBeenCalled();
  });

  it("returns 400 when pace is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });

    const response = await POST(buildRequest({ winCondition: "Combat damage" }));

    expect(response.status).toBe(400);
    expect(suggestCommandersMock).not.toHaveBeenCalled();
  });

  it("returns the suggested commanders on success", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    suggestCommandersMock.mockResolvedValue([suggestion]);

    const response = await POST(buildRequest(preferences));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([suggestion]);
    expect(suggestCommandersMock).toHaveBeenCalledWith("user_1", {
      winCondition: "Combat damage",
      pace: "Fast and aggressive",
      notes: undefined,
    });
  });

  it("passes optional notes through", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    suggestCommandersMock.mockResolvedValue([suggestion]);

    await POST(buildRequest({ ...preferences, notes: "No infinite combos please" }));

    expect(suggestCommandersMock).toHaveBeenCalledWith("user_1", {
      winCondition: "Combat damage",
      pace: "Fast and aggressive",
      notes: "No infinite combos please",
    });
  });

  it("returns 400 when suggestCommandersForPreferences throws a DeckWizardError", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    suggestCommandersMock.mockRejectedValue(
      new DeckWizardError("You have no commander-eligible cards in your collection."),
    );

    const response = await POST(buildRequest(preferences));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "You have no commander-eligible cards in your collection." });
  });
});
