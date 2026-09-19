import { describe, expect, it } from "vitest";
import {
  validateSingleton,
  validateColorIdentity,
  validateDeckSize,
  validateDeck,
  unionColorIdentity,
} from "@/lib/commander-legality";

describe("validateSingleton", () => {
  it("rejects a duplicate nonland card", () => {
    expect(
      validateSingleton([{ cardId: "sol_ring", quantity: 2, isBasicLand: false }]),
    ).toBe(false);
  });

  it("accepts unlimited copies of a basic land", () => {
    expect(
      validateSingleton([{ cardId: "forest", quantity: 20, isBasicLand: true }]),
    ).toBe(true);
  });

  it("accepts exactly one copy of a nonland card", () => {
    expect(
      validateSingleton([{ cardId: "sol_ring", quantity: 1, isBasicLand: false }]),
    ).toBe(true);
  });
});

describe("validateColorIdentity", () => {
  it("rejects a card whose color identity isn't a subset of the commander's", () => {
    expect(
      validateColorIdentity(["W", "U"], [{ colorIdentity: ["W", "U", "B"] }]),
    ).toBe(false);
  });

  it("accepts a card whose color identity is a subset of the commander's", () => {
    expect(
      validateColorIdentity(["W", "U", "B"], [{ colorIdentity: ["W", "U"] }]),
    ).toBe(true);
  });

  it("accepts a colorless card against any commander", () => {
    expect(validateColorIdentity(["W"], [{ colorIdentity: [] }])).toBe(true);
  });
});

describe("validateDeckSize", () => {
  it("accepts exactly 100 cards", () => {
    expect(validateDeckSize([{ quantity: 1 }, { quantity: 99 }])).toBe(true);
  });

  it("rejects 99 cards as short", () => {
    expect(validateDeckSize([{ quantity: 1 }, { quantity: 98 }])).toBe(false);
  });
});

describe("unionColorIdentity", () => {
  it("returns a single commander's own identity unchanged", () => {
    expect(unionColorIdentity([{ colorIdentity: ["W", "U"] }])).toEqual(["W", "U"]);
  });

  it("dedupes overlapping colors across two commanders", () => {
    expect(
      unionColorIdentity([{ colorIdentity: ["W", "U"] }, { colorIdentity: ["U", "B"] }]),
    ).toEqual(["W", "U", "B"]);
  });

  it("returns an empty array for zero commanders", () => {
    expect(unionColorIdentity([])).toEqual([]);
  });
});

describe("validateDeck", () => {
  const commanderColorIdentity = ["W", "U"];

  it("is valid for a legal 100-card deck", () => {
    const cards = [
      { cardId: "commander", quantity: 1, colorIdentity: ["W", "U"], type: "Legendary Creature" },
      { cardId: "sol_ring", quantity: 1, colorIdentity: [], type: "Artifact" },
      { cardId: "plains", quantity: 98, colorIdentity: ["W"], type: "Basic Land — Plains" },
    ];

    const result = validateDeck({ commanderColorIdentity, cards });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("flags a duplicate nonland card", () => {
    const cards = [
      { cardId: "commander", quantity: 1, colorIdentity: ["W", "U"], type: "Legendary Creature" },
      { cardId: "sol_ring", quantity: 2, colorIdentity: [], type: "Artifact" },
      { cardId: "plains", quantity: 97, colorIdentity: ["W"], type: "Basic Land — Plains" },
    ];

    const result = validateDeck({ commanderColorIdentity, cards });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Deck contains more than one copy of a nonland card.");
  });

  it("flags a card outside the commander's color identity", () => {
    const cards = [
      { cardId: "commander", quantity: 1, colorIdentity: ["W", "U"], type: "Legendary Creature" },
      { cardId: "off_color", quantity: 1, colorIdentity: ["B"], type: "Creature" },
      { cardId: "plains", quantity: 98, colorIdentity: ["W"], type: "Basic Land — Plains" },
    ];

    const result = validateDeck({ commanderColorIdentity, cards });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Deck contains a card outside the commander's color identity.",
    );
  });

  it("flags a deck short of 100 cards", () => {
    const cards = [
      { cardId: "commander", quantity: 1, colorIdentity: ["W", "U"], type: "Legendary Creature" },
      { cardId: "plains", quantity: 98, colorIdentity: ["W"], type: "Basic Land — Plains" },
    ];

    const result = validateDeck({ commanderColorIdentity, cards });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Deck must contain exactly 100 cards, found 99.");
  });
});
