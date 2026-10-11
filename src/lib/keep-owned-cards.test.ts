import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
    collectionEntry: { findMany: vi.fn() },
    deckCard: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { keepOnlyOwnedCards, KeepOwnedError } from "@/lib/keep-owned-cards";

const deckFindUnique = prisma.deck.findUnique as unknown as ReturnType<typeof vi.fn>;
const entryFindMany = prisma.collectionEntry.findMany as unknown as ReturnType<typeof vi.fn>;
const deckCardFindMany = prisma.deckCard.findMany as unknown as ReturnType<typeof vi.fn>;
const deleteMany = prisma.deckCard.deleteMany as unknown as ReturnType<typeof vi.fn>;

function deckCard(id: string, name: string, extra: Record<string, unknown> = {}, cardExtra = {}) {
  return {
    id: `dc_${id}`,
    cardId: id,
    quantity: 1,
    isCommander: false,
    card: { id, name, type: "Creature", supertypes: [], ...cardExtra },
    ...extra,
  };
}

describe("keepOnlyOwnedCards", () => {
  beforeEach(() => {
    deckFindUnique.mockReset();
    entryFindMany.mockReset();
    deckCardFindMany.mockReset();
    deleteMany.mockReset();
  });

  it("throws when the deck does not exist", async () => {
    deckFindUnique.mockResolvedValue(null);
    await expect(keepOnlyOwnedCards("x")).rejects.toThrow(KeepOwnedError);
  });

  it("removes unowned and in-another-deck cards, keeping commanders and basics", async () => {
    deckFindUnique.mockResolvedValue({
      id: "d1",
      userId: "u1",
      cards: [
        deckCard("keep", "Keeper"),
        deckCard("unowned", "Unowned"),
        deckCard("elsewhere", "Elsewhere"),
        deckCard("cmdr", "Commander Unowned", { isCommander: true }),
        deckCard("forest", "Forest", {}, { type: "Basic Land — Forest", supertypes: ["Basic"] }),
      ],
    });
    entryFindMany.mockResolvedValue([{ cardId: "keep" }, { cardId: "elsewhere" }]);
    deckCardFindMany.mockResolvedValue([{ cardId: "elsewhere" }]);

    const removed = await keepOnlyOwnedCards("d1");

    expect(removed).toEqual([
      { cardId: "unowned", name: "Unowned", reason: "not-owned" },
      { cardId: "elsewhere", name: "Elsewhere", reason: "in-another-deck" },
    ]);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["dc_unowned", "dc_elsewhere"] } } });
  });

  it("does not delete when nothing needs removing", async () => {
    deckFindUnique.mockResolvedValue({ id: "d1", userId: "u1", cards: [deckCard("keep", "Keeper")] });
    entryFindMany.mockResolvedValue([{ cardId: "keep" }]);
    deckCardFindMany.mockResolvedValue([]);

    expect(await keepOnlyOwnedCards("d1")).toEqual([]);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
