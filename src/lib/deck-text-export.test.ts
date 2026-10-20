import { describe, expect, it } from "vitest";
import { formatDeckText } from "@/lib/deck-text-export";

const cards = [
  { cardId: "atraxa", quantity: 1, card: { name: "Atraxa, Praetors' Voice" } },
  { cardId: "sol_ring", quantity: 1, card: { name: "Sol Ring" } },
  { cardId: "forest", quantity: 5, card: { name: "Forest" } },
];

describe("formatDeckText", () => {
  it("writes Arena Commander and Deck sections", () => {
    expect(formatDeckText(cards, "atraxa", "arena")).toBe(
      "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n5 Forest\n",
    );
  });

  it("writes the MTGO mainboard followed by the commander as a sideboard line", () => {
    expect(formatDeckText(cards, "atraxa", "mtgo")).toBe(
      "1 Sol Ring\n5 Forest\n\nSB: 1 Atraxa, Praetors' Voice\n",
    );
  });

  it("omits the commander section when the deck has no commander", () => {
    expect(formatDeckText(cards.slice(1), null, "arena")).toBe("Deck\n1 Sol Ring\n5 Forest\n");
    expect(formatDeckText(cards.slice(1), null, "mtgo")).toBe("1 Sol Ring\n5 Forest\n");
  });
});
