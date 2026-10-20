import { describe, expect, it } from "vitest";
import {
  decisionsAfterAdd,
  decisionsAfterCut,
  parseCardDecisions,
  settledEditLines,
  type CardDecisions,
} from "@/lib/deck-decisions";

const beast = { id: "beast", name: "Beast Within" };
const swords = { id: "swords", name: "Swords to Plowshares" };

describe("card decisions", () => {
  it("treats missing or junk data as no decisions", () => {
    expect(parseCardDecisions(null)).toEqual({ cuts: [], adds: [] });
    expect(parseCardDecisions({ cuts: [{ id: 1 }], adds: "nope" })).toEqual({ cuts: [], adds: [] });
  });

  it("records a cut and drops that card from the add list", () => {
    const current: CardDecisions = { cuts: [], adds: [beast] };

    expect(decisionsAfterCut(current, beast)).toEqual({ cuts: [beast], adds: [] });
  });

  it("records an add and drops that card from the cut list", () => {
    const current: CardDecisions = { cuts: [beast], adds: [] };

    expect(decisionsAfterAdd(current, beast)).toEqual({ cuts: [], adds: [beast] });
  });

  it("keeps the newest decision first and drops the oldest past the cap", () => {
    const current: CardDecisions = {
      cuts: Array.from({ length: 99 }, (_, index) => ({ id: `c${index}`, name: `Card ${index}` })),
      adds: [],
    };

    const next = decisionsAfterCut(current, swords);

    expect(next.cuts[0]).toEqual(swords);
    expect(next.cuts).toHaveLength(99);
    expect(next.cuts.some((card) => card.id === "c98")).toBe(false);
  });

  it("names the settled edits for the prompt, and says nothing when there are none", () => {
    expect(settledEditLines({ cuts: [], adds: [] })).toEqual([]);
    expect(settledEditLines({ cuts: [beast], adds: [swords] }).join("\n")).toContain(
      "Do not recommend adding back: Beast Within.",
    );
  });
});
