import { describe, expect, it } from "vitest";
import { buildBuyList, buildMassEntryUrl, formatBuyListText } from "@/lib/tcgplayer";

const solRing = { cardId: "sol_ring", quantity: 1, card: { name: "Sol Ring", type: "Artifact" } };
const forest = { cardId: "forest", quantity: 10, card: { name: "Forest", type: "Basic Land - Forest" } };
const cultivate = { cardId: "cultivate", quantity: 1, card: { name: "Cultivate", type: "Sorcery" } };

describe("buildBuyList", () => {
  it("keeps only unowned nonbasic cards", () => {
    const lines = buildBuyList([solRing, forest, cultivate], new Set(["sol_ring"]));

    expect(lines).toEqual([{ name: "Cultivate", quantity: 1 }]);
  });
});

describe("formatBuyListText", () => {
  it("writes one 'qty name' line per card", () => {
    expect(
      formatBuyListText([
        { name: "Sol Ring", quantity: 1 },
        { name: "Cultivate", quantity: 2 },
      ]),
    ).toBe("1 Sol Ring\n2 Cultivate");
  });
});

describe("buildMassEntryUrl", () => {
  it("joins encoded lines with || on the Mass Entry page", () => {
    const url = buildMassEntryUrl([
      { name: "Sol Ring", quantity: 1 },
      { name: "Fire // Ice", quantity: 1 },
    ]);

    expect(url).toBe(
      `https://www.tcgplayer.com/massentry?productline=Magic&c=${encodeURIComponent("1 Sol Ring||1 Fire // Ice")}`,
    );
  });

  it("returns null for an empty list", () => {
    expect(buildMassEntryUrl([])).toBeNull();
  });

  it("returns null when the URL would be too long", () => {
    const lines = Array.from({ length: 400 }, (_, i) => ({ name: `Some Long Card Name ${i}`, quantity: 1 }));

    expect(buildMassEntryUrl(lines)).toBeNull();
  });
});
