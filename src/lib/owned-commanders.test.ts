import { describe, expect, it } from "vitest";
import {
  filterCommandersByName,
  uniqueOwnedCommanders,
  type OwnedCommanderCard,
} from "@/lib/owned-commanders";

function card(id: string, name: string): OwnedCommanderCard {
  return { id, name, manaCost: null, type: "Legendary Creature", colorIdentity: [], oracleText: null };
}

describe("uniqueOwnedCommanders", () => {
  it("lists a card once even when owned in several finishes, sorted by name", () => {
    const result = uniqueOwnedCommanders([
      { card: card("c2", "Zimone, Quandrix Prodigy") },
      { card: card("c1", "Atraxa, Praetors' Voice") },
      { card: card("c2", "Zimone, Quandrix Prodigy") },
    ]);

    expect(result.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("returns an empty list for no entries", () => {
    expect(uniqueOwnedCommanders([])).toEqual([]);
  });
});

describe("filterCommandersByName", () => {
  const commanders = [card("c1", "Atraxa, Praetors' Voice"), card("c2", "Korvold, Fae-Cursed King")];

  it("matches case-insensitively on any part of the name", () => {
    expect(filterCommandersByName(commanders, "  KORV ").map((c) => c.id)).toEqual(["c2"]);
  });

  it("returns everything for a blank query", () => {
    expect(filterCommandersByName(commanders, "   ")).toHaveLength(2);
  });
});
