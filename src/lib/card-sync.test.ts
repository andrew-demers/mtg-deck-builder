import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ParsedCard } from "@/lib/mtgjson";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    card: {
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { syncCards } from "@/lib/card-sync";

const upsertMock = prisma.card.upsert as unknown as ReturnType<typeof vi.fn>;

function makeCard(overrides: Partial<ParsedCard>): ParsedCard {
  return {
    name: "Test Card",
    manaCost: "{1}{G}",
    manaValue: 2,
    colors: ["G"],
    colorIdentity: ["G"],
    type: "Creature — Bear",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Bear"],
    oracleText: null,
    legalities: {},
    scryfallOracleId: null,
    ...overrides,
  };
}

describe("syncCards", () => {
  beforeEach(() => {
    upsertMock.mockReset();
    upsertMock.mockResolvedValue(undefined);
  });

  it("upserts each card by name", async () => {
    const cards = [makeCard({ name: "Grizzly Bears" }), makeCard({ name: "Atraxa, Praetors' Voice" })];

    await syncCards(cards);

    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: "Grizzly Bears" } }),
    );
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: "Atraxa, Praetors' Voice" } }),
    );
  });

  it("computes isCommanderEligible per card for both create and update payloads", async () => {
    const legendaryCreature = makeCard({
      name: "Atraxa, Praetors' Voice",
      type: "Legendary Creature — Phyrexian Angel Horror",
    });
    const vanillaCreature = makeCard({
      name: "Grizzly Bears",
      type: "Creature — Bear",
      oracleText: null,
    });
    const commanderGrantingSpell = makeCard({
      name: "Clear, the Mind",
      type: "Sorcery",
      oracleText: "Spell commander (This card can be your commander.)",
    });

    await syncCards([legendaryCreature, vanillaCreature, commanderGrantingSpell]);

    const calls = upsertMock.mock.calls as Array<
      [{ create: { isCommanderEligible: boolean }; update: { isCommanderEligible: boolean } }]
    >;

    const byName = new Map(
      calls.map(([args], index) => [
        [legendaryCreature, vanillaCreature, commanderGrantingSpell][index].name,
        args,
      ]),
    );

    expect(byName.get("Atraxa, Praetors' Voice")?.create.isCommanderEligible).toBe(true);
    expect(byName.get("Atraxa, Praetors' Voice")?.update.isCommanderEligible).toBe(true);
    expect(byName.get("Grizzly Bears")?.create.isCommanderEligible).toBe(false);
    expect(byName.get("Clear, the Mind")?.create.isCommanderEligible).toBe(true);
  });
});
