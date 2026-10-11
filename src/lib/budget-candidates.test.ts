import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { card: { findMany: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/scryfall", () => ({ searchCards: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { searchCards } from "@/lib/scryfall";
import {
  buildCandidateQueries,
  findBudgetCandidates,
  parseSynergyPhrases,
} from "@/lib/budget-candidates";

const findMany = prisma.card.findMany as unknown as ReturnType<typeof vi.fn>;
const update = prisma.card.update as unknown as ReturnType<typeof vi.fn>;
const search = searchCards as unknown as ReturnType<typeof vi.fn>;

function scry(name: string, priceUsd: number | null) {
  return { name, priceUsd, priceUsdFoil: null };
}
function local(id: string, name: string, colorIdentity: string[] = ["R"]) {
  return { id, name, colorIdentity, priceUsd: null, priceUsdFoil: null };
}
const commander = { id: "cmd", name: "Smaug", oracleText: "Treasure stuff", colorIdentity: ["R"] };

describe("buildCandidateQueries", () => {
  it("limits every query to commander-legal, in-identity, in-budget non-basics", () => {
    const queries = buildCandidateQueries(["R", "G"], 20, ["treasure"]);

    expect(queries[0]).toBe("f:commander id<=rg usd<=20 -t:basic");
    expect(queries).toContain('f:commander id<=rg usd<=20 -t:basic otag:ramp');
    expect(queries).toContain('f:commander id<=rg usd<=20 -t:basic o:"treasure"');
    expect(queries.every((q) => q.startsWith("f:commander id<=rg usd<=20"))).toBe(true);
  });

  it("uses colorless identity for a colorless commander", () => {
    expect(buildCandidateQueries([], 5, [])[0]).toContain("id<=c ");
  });
});

describe("parseSynergyPhrases", () => {
  it("sanitises phrases so they are safe inside a query", () => {
    expect(parseSynergyPhrases('1. Treasure\n- "dragon" OR o:evil\n* +1/+1 counter\nx')).toEqual([
      "treasure",
      "dragon or oevil",
      "11 counter",
    ]);
  });
});

describe("findBudgetCandidates", () => {
  beforeEach(() => {
    [findMany, update, search].forEach((m) => m.mockReset());
  });

  const run = (complete = vi.fn().mockResolvedValue("treasure")) =>
    findBudgetCandidates({
      commanders: [commander as never],
      colorIdentity: ["R"],
      budgetUsd: 20,
      excludeIds: ["cmd"],
      complete,
    });

  it("maps Scryfall results onto local cards with their live prices and saves the prices", async () => {
    search.mockResolvedValue([scry("Sol Ring", 1.5), scry("Pricey", 50), scry("No Price", null)]);
    findMany.mockResolvedValue([local("sol", "Sol Ring")]);

    const result = await run();

    expect(result).toEqual([expect.objectContaining({ id: "sol", priceUsd: 1.5 })]);
    expect(findMany).toHaveBeenCalledWith({
      where: { name: { in: ["Sol Ring"] }, id: { notIn: ["cmd"] } },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sol" }, data: expect.objectContaining({ priceUsd: 1.5 }) }),
    );
  });

  it("drops results outside the color identity or missing from the local catalog", async () => {
    search.mockResolvedValue([scry("Blue Card", 1), scry("Unknown", 1)]);
    findMany.mockResolvedValue([local("blue", "Blue Card", ["U"])]);

    expect(await run()).toEqual([]);
  });

  it("still searches when the synergy lookup fails", async () => {
    search.mockResolvedValue([]);

    await run(vi.fn().mockRejectedValue(new Error("llm down")));

    expect(search).toHaveBeenCalled();
  });

  it("propagates a Scryfall failure", async () => {
    search.mockRejectedValue(new Error("403"));

    await expect(run()).rejects.toThrow("403");
  });
});
