import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isCommanderEligible } from "@/lib/commander-eligibility";

interface AtomicCardFace {
  type: string;
  text?: string;
}

interface AtomicCardsFixture {
  data: Record<string, AtomicCardFace[]>;
}

const fixture: AtomicCardsFixture = JSON.parse(
  readFileSync(
    path.join(__dirname, "__fixtures__", "atomic-cards-sample.json"),
    "utf-8",
  ),
);

function face(name: string): AtomicCardFace {
  return fixture.data[name][0];
}

describe("isCommanderEligible", () => {
  it("is true for a legendary creature", () => {
    const atraxa = face("Atraxa, Praetors' Voice");
    expect(
      isCommanderEligible({ type: atraxa.type, oracleText: atraxa.text }),
    ).toBe(true);
  });

  it("is true for a non-legendary card with explicit commander-granting text", () => {
    const clearTheMind = face("Clear, the Mind");
    expect(
      isCommanderEligible({
        type: clearTheMind.type,
        oracleText: clearTheMind.text,
      }),
    ).toBe(true);
  });

  it("is false for a vanilla non-legendary creature with no oracle text", () => {
    const grizzlyBears = face("Grizzly Bears");
    expect(grizzlyBears.text).toBeUndefined();
    expect(
      isCommanderEligible({
        type: grizzlyBears.type,
        oracleText: grizzlyBears.text,
      }),
    ).toBe(false);
  });

  it("does not throw when oracleText is missing entirely", () => {
    expect(isCommanderEligible({ type: "Creature — Bear" })).toBe(false);
  });
});
