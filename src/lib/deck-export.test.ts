import { describe, expect, it } from "vitest";
import { buildDeckExportRows } from "@/lib/deck-export";

describe("buildDeckExportRows", () => {
  it("fills set code/Scryfall ID/foil from a matching owned CollectionEntry", () => {
    const rows = buildDeckExportRows(
      [{ cardId: "sol_ring", quantity: 1, card: { name: "Sol Ring" } }],
      [
        {
          cardId: "sol_ring",
          quantity: 1,
          foil: true,
          setCode: "C21",
          sourceScryfallId: "scry-sol-ring",
        },
      ],
    );

    expect(rows).toEqual([
      { name: "Sol Ring", setCode: "C21", scryfallId: "scry-sol-ring", quantity: 1, foil: true },
    ]);
  });

  it("leaves set code/Scryfall ID null and foil false when nothing is owned", () => {
    const rows = buildDeckExportRows([{ cardId: "sol_ring", quantity: 1, card: { name: "Sol Ring" } }], []);

    expect(rows).toEqual([
      { name: "Sol Ring", setCode: null, scryfallId: null, quantity: 1, foil: false },
    ]);
  });

  it("uses the deck's own quantity, not the owned entry's quantity", () => {
    const rows = buildDeckExportRows(
      [{ cardId: "sol_ring", quantity: 1, card: { name: "Sol Ring" } }],
      [{ cardId: "sol_ring", quantity: 3, foil: false, setCode: "C21", sourceScryfallId: "scry-sol-ring" }],
    );

    expect(rows[0]?.quantity).toBe(1);
  });

  it("picks the owned entry with the larger quantity when both foil and non-foil are owned", () => {
    const rows = buildDeckExportRows(
      [{ cardId: "sol_ring", quantity: 1, card: { name: "Sol Ring" } }],
      [
        { cardId: "sol_ring", quantity: 1, foil: true, setCode: "C21", sourceScryfallId: "scry-foil" },
        { cardId: "sol_ring", quantity: 4, foil: false, setCode: "LEA", sourceScryfallId: "scry-nonfoil" },
      ],
    );

    expect(rows[0]).toEqual({
      name: "Sol Ring",
      setCode: "LEA",
      scryfallId: "scry-nonfoil",
      quantity: 1,
      foil: false,
    });
  });

  it("breaks a quantity tie toward the non-foil entry", () => {
    const rows = buildDeckExportRows(
      [{ cardId: "sol_ring", quantity: 1, card: { name: "Sol Ring" } }],
      [
        { cardId: "sol_ring", quantity: 2, foil: true, setCode: "C21", sourceScryfallId: "scry-foil" },
        { cardId: "sol_ring", quantity: 2, foil: false, setCode: "LEA", sourceScryfallId: "scry-nonfoil" },
      ],
    );

    expect(rows[0]?.foil).toBe(false);
  });
});
