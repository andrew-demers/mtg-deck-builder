import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/commander-suggestion", () => ({
  suggestCommander: vi.fn(),
}));

import { auth } from "@/auth";
import { suggestCommander } from "@/lib/commander-suggestion";
import { POST } from "@/app/api/decks/suggest-commander/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const suggestCommanderMock = suggestCommander as unknown as ReturnType<typeof vi.fn>;

const commanderCard = {
  id: "card_atraxa",
  name: "Atraxa, Praetors' Voice",
  manaCost: "{G}{W}{U}{B}",
  manaValue: 4,
  colors: ["G", "W", "U", "B"],
  colorIdentity: ["G", "W", "U", "B"],
  type: "Legendary Creature — Phyrexian Angel Horror",
  types: ["Creature"],
  supertypes: ["Legendary"],
  subtypes: ["Phyrexian", "Angel", "Horror"],
  oracleText: null,
  legalities: {},
  scryfallOracleId: null,
  isCommanderEligible: true,
};

describe("POST /api/decks/suggest-commander", () => {
  beforeEach(() => {
    authMock.mockReset();
    suggestCommanderMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(suggestCommanderMock).not.toHaveBeenCalled();
  });

  it("returns the matched card on success", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    suggestCommanderMock.mockResolvedValue({ success: true, card: commanderCard });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(commanderCard);
    expect(suggestCommanderMock).toHaveBeenCalledWith("user_1");
  });

  it("returns 400 with a clear error when the user owns no commander-eligible cards", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    suggestCommanderMock.mockResolvedValue({
      success: false,
      error: "You have no commander-eligible cards in your collection.",
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "You have no commander-eligible cards in your collection.",
    });
  });

  it("returns 400 when the LLM's suggestion does not match any owned card", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } });
    suggestCommanderMock.mockResolvedValue({
      success: false,
      error: "The suggested commander does not match any card you own.",
    });

    const response = await POST();

    expect(response.status).toBe(400);
  });
});
