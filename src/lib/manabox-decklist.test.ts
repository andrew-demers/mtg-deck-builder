import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseManaBoxDecklist } from "@/lib/manabox-decklist";

function readFixture(fileName: string): string {
  return readFileSync(path.join(__dirname, "__fixtures__", fileName), "utf-8");
}

describe("parseManaBoxDecklist", () => {
  it("parses a single commander and the mainboard", () => {
    const result = parseManaBoxDecklist(
      [
        "// COMMANDER",
        "1 Korvold, Fae-Cursed King (EOC) 120",
        "",
        "1 Arcane Signet (EOC) 53",
        "1 Command Tower (EOC) 59",
      ].join("\n"),
    );

    expect(result.commanderNames).toEqual(["Korvold, Fae-Cursed King"]);
    expect(result.cards).toEqual([
      { name: "Arcane Signet", quantity: 1 },
      { name: "Command Tower", quantity: 1 },
    ]);
  });

  it("parses two commanders from a real ManaBox export fixture", () => {
    const result = parseManaBoxDecklist(readFixture("manabox-decklist-sample.txt"));

    expect(result.commanderNames).toEqual([
      "Korvold, Fae-Cursed King",
      "Szarel, Genesis Shepherd",
    ]);
    expect(result.cards.length).toBe(27);
  });

  it("sums a foil and non-foil printing of the same card into one quantity", () => {
    const result = parseManaBoxDecklist(readFixture("manabox-decklist-sample.txt"));

    expect(result.cards).toContainEqual({ name: "Forest", quantity: 5 });
  });

  it("throws a clear error when the // COMMANDER header is missing", () => {
    expect(() =>
      parseManaBoxDecklist(["1 Arcane Signet (EOC) 53"].join("\n")),
    ).toThrow(/COMMANDER/i);
  });

  it("throws a clear error on a line that doesn't match the expected shape", () => {
    expect(() =>
      parseManaBoxDecklist(
        ["// COMMANDER", "1 Korvold, Fae-Cursed King (EOC) 120", "", "Arcane Signet"].join("\n"),
      ),
    ).toThrow(/does not match the expected format/i);
  });
});
