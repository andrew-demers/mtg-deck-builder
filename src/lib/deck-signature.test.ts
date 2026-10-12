import { describe, expect, it } from "vitest";
import { deckSignature } from "@/lib/deck-signature";

const a = { cardId: "a", quantity: 1, isCommander: false };
const b = { cardId: "b", quantity: 2, isCommander: false };

describe("deckSignature", () => {
  it("ignores card order", () => {
    expect(deckSignature("k", [a, b])).toBe(deckSignature("k", [b, a]));
  });

  it("changes when a card, quantity, or commander changes", () => {
    const base = deckSignature("k", [a, b]);

    expect(deckSignature("k", [a])).not.toBe(base);
    expect(deckSignature("k", [a, { ...b, quantity: 3 }])).not.toBe(base);
    expect(deckSignature("other", [a, b])).not.toBe(base);
  });
});
