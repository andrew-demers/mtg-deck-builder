import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseManaBoxCsv } from "@/lib/manabox-csv";

function readFixture(fileName: string): string {
  return readFileSync(path.join(__dirname, "__fixtures__", fileName), "utf-8");
}

describe("parseManaBoxCsv", () => {
  it("parses a well-formed export with foil and non-foil rows", () => {
    const rows = parseManaBoxCsv(readFixture("manabox-sample.csv"));

    expect(rows).toHaveLength(3);

    expect(rows[0]).toEqual({
      name: "Atraxa, Praetors' Voice",
      setCode: "PDOM",
      scryfallId: "scry-atraxa",
      quantity: 1,
      foil: true,
    });

    expect(rows[1]).toEqual({
      name: "Grizzly Bears",
      setCode: "LEA",
      scryfallId: "scry-grizzly",
      quantity: 4,
      foil: false,
    });

    expect(rows[2]).toEqual({
      name: "Clear, the Mind",
      setCode: "MH2",
      scryfallId: "scry-clear",
      quantity: 2,
      foil: false,
    });
  });

  it("parses a row missing Set Code as null, still matchable by name", () => {
    const rows = parseManaBoxCsv(readFixture("manabox-sample-missing-set.csv"));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      name: "Grizzly Bears",
      setCode: null,
      scryfallId: null,
      quantity: 3,
      foil: false,
    });
  });

  it("defaults a malformed (non-numeric) quantity to 1 instead of throwing", () => {
    const rows = parseManaBoxCsv(readFixture("manabox-sample-bad-quantity.csv"));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      name: "Clear, the Mind",
      setCode: "MH2",
      scryfallId: "scry-clear",
      quantity: 1,
      foil: false,
    });
  });

  it("defaults quantity to 1 when the column is blank", () => {
    const rows = parseManaBoxCsv(
      "Name,Set Code,Quantity,Foil\nSol Ring,,,normal\n",
    );

    expect(rows[0]?.quantity).toBe(1);
  });

  it("throws a clear error when a row has no name", () => {
    expect(() =>
      parseManaBoxCsv("Name,Set Code,Quantity,Foil\n,LEA,1,normal\n"),
    ).toThrow(/no card name/i);
  });

  it("throws upfront when the file has no recognizable Name column", () => {
    expect(() =>
      parseManaBoxCsv("Set Code,Quantity,Foil\nLEA,1,normal\n"),
    ).toThrow(/Name/i);
  });

  it("is case-insensitive and tolerant of surrounding whitespace in headers", () => {
    const rows = parseManaBoxCsv(
      " name , set code , quantity , foil \nSol Ring,C21,2,foil\n",
    );

    expect(rows).toEqual([
      {
        name: "Sol Ring",
        setCode: "C21",
        scryfallId: null,
        quantity: 2,
        foil: true,
      },
    ]);
  });
});
