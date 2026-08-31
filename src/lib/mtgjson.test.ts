import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAtomicCards } from "@/lib/mtgjson";

const fixtureText = readFileSync(
  path.join(__dirname, "__fixtures__", "atomic-cards-sample.json"),
  "utf-8",
);

describe("parseAtomicCards", () => {
  it("parses all cards in the fixture", () => {
    const cards = parseAtomicCards(fixtureText);
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.name).sort()).toEqual(
      [
        "Atraxa, Praetors' Voice",
        "Clear, the Mind",
        "Fire // Ice",
        "Grizzly Bears",
      ].sort(),
    );
  });

  it("parses a legendary creature with full fields", () => {
    const cards = parseAtomicCards(fixtureText);
    const atraxa = cards.find((card) => card.name === "Atraxa, Praetors' Voice");
    expect(atraxa).toBeDefined();
    expect(atraxa?.type).toBe("Legendary Creature — Phyrexian Angel Horror");
    expect(atraxa?.colorIdentity).toEqual(["B", "G", "U", "W"]);
    expect(atraxa?.scryfallOracleId).toBe(
      "7e6b9b59-cd68-4e3c-827b-38833c92d6eb",
    );
  });

  it("defaults oracleText to null when the fixture has no text field", () => {
    const cards = parseAtomicCards(fixtureText);
    const grizzlyBears = cards.find((card) => card.name === "Grizzly Bears");
    expect(grizzlyBears?.oracleText).toBeNull();
  });

  it("defaults legalities to {} when the fixture has an empty legalities object", () => {
    const cards = parseAtomicCards(fixtureText);
    const clearTheMind = cards.find((card) => card.name === "Clear, the Mind");
    expect(clearTheMind?.legalities).toEqual({});
  });

  it("uses only face index 0 for a split card", () => {
    const cards = parseAtomicCards(fixtureText);
    const fireIce = cards.find((card) => card.name === "Fire // Ice");
    expect(fireIce).toBeDefined();
    // Face-0 ("Fire") value, not the combined card's - see the scoping note
    // in mtgjson.ts.
    expect(fireIce?.manaCost).toBe("{1}{R}");
    // colorIdentity is already the combined value MTGJSON computes per face.
    expect(fireIce?.colorIdentity).toEqual(["R", "U"]);
  });
});
