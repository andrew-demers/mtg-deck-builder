import { describe, expect, it } from "vitest";
import { computeDeckPrice, formatUsd } from "@/lib/deck-price";

describe("computeDeckPrice", () => {
  it("sums price times quantity and counts unpriced cards", () => {
    const result = computeDeckPrice([
      { quantity: 1, card: { priceUsd: 1.5 } },
      { quantity: 10, card: { priceUsd: 0.1 } },
      { quantity: 1, card: { priceUsd: null } },
    ]);
    expect(result).toEqual({ totalUsd: 2.5, unpricedCount: 1 });
  });

  it("avoids floating point drift", () => {
    const result = computeDeckPrice([{ quantity: 3, card: { priceUsd: 0.1 } }]);
    expect(result.totalUsd).toBe(0.3);
  });
});

describe("formatUsd", () => {
  it("formats prices and dashes unknowns", () => {
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(null)).toBe("-");
  });
});
