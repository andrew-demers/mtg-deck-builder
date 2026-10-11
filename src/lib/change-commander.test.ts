import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findUnique: vi.fn(), update: vi.fn() },
    card: { findUnique: vi.fn() },
    deckCard: { deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { changeCommander, ChangeCommanderError } from "@/lib/change-commander";

const deckFindUnique = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const deckUpdate = prisma.deck.update as unknown as ReturnType<typeof vi.fn>;
const cardFindUnique = prisma.card.findUnique as unknown as ReturnType<typeof vi.fn>;
const deleteMany = prisma.deckCard.deleteMany as unknown as ReturnType<typeof vi.fn>;
const create = prisma.deckCard.create as unknown as ReturnType<typeof vi.fn>;
const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function card(id: string, colorIdentity: string[], extra: Record<string, unknown> = {}) {
  return { id, name: id, colorIdentity, type: "Creature", isCommanderEligible: true, ...extra };
}
function row(id: string, colorIdentity: string[], isCommander = false) {
  return { id: `dc_${id}`, cardId: id, quantity: 1, isCommander, card: card(id, colorIdentity) };
}

describe("changeCommander", () => {
  beforeEach(() => {
    [deckFindUnique, deckUpdate, cardFindUnique, deleteMany, create, transaction].forEach((m) => m.mockReset());
  });

  function mockDeck(cards: ReturnType<typeof row>[], commanderCardId: string | null = "old") {
    deckFindUnique.mockResolvedValue({ id: "d1", commanderCardId, cards });
  }

  it("rejects an ineligible new commander", async () => {
    mockDeck([row("old", ["G"], true)]);
    cardFindUnique.mockResolvedValue(card("new", ["G"], { isCommanderEligible: false }));
    await expect(changeCommander("d1", "old", "new")).rejects.toThrow(ChangeCommanderError);
  });

  it("rejects replacing a card that isn't a commander of the deck", async () => {
    mockDeck([row("old", ["G"], true)]);
    cardFindUnique.mockResolvedValue(card("new", ["G"]));
    await expect(changeCommander("d1", "other", "new")).rejects.toThrow(ChangeCommanderError);
  });

  it("returns conflicts without changing anything when the new colors exclude deck cards", async () => {
    mockDeck([row("old", ["G", "U"], true), row("blue", ["U"]), row("green", ["G"])]);
    cardFindUnique.mockResolvedValue(card("new", ["G"]));

    const result = await changeCommander("d1", "old", "new");

    expect(result).toEqual({ status: "conflicts", conflicts: ["blue"] });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("swaps the commander, removes off-identity cards when asked, and makes the new one active", async () => {
    mockDeck([row("old", ["G", "U"], true), row("blue", ["U"]), row("green", ["G"])]);
    cardFindUnique.mockResolvedValue(card("new", ["G"]));

    const result = await changeCommander("d1", "old", "new", true);

    expect(result).toEqual({ status: "changed", removed: ["blue"] });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["dc_old", "dc_blue"] } } });
    expect(create).toHaveBeenCalledWith({
      data: { deckId: "d1", cardId: "new", quantity: 1, isCommander: true },
    });
    expect(deckUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: { commanderCardId: "new" } });
    expect(transaction).toHaveBeenCalled();
  });

  it("promotes a card already in the deck instead of duplicating it", async () => {
    mockDeck([row("old", ["G"], true), row("new", ["G"])]);
    cardFindUnique.mockResolvedValue(card("new", ["G"]));

    await changeCommander("d1", "old", "new");

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["dc_old", "dc_new"] } } });
  });

  it("keeps a partner's identity when replacing the other commander", async () => {
    mockDeck([row("old", ["G"], true), row("partner", ["U"], true), row("blue", ["U"])]);
    cardFindUnique.mockResolvedValue(card("new", ["R"]));

    const result = await changeCommander("d1", "old", "new");

    expect(result).toEqual({ status: "changed", removed: [] });
  });

  it("only updates the commander id for a deck that was never built", async () => {
    mockDeck([], "old");
    cardFindUnique.mockResolvedValue(card("new", ["G"]));

    expect(await changeCommander("d1", "old", "new")).toEqual({ status: "changed", removed: [] });
    expect(deckUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: { commanderCardId: "new" } });
    expect(transaction).not.toHaveBeenCalled();
  });
});
