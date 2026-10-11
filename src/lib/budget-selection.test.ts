import { describe, expect, it } from "vitest";
import { selectWithinBudget } from "@/lib/budget-selection";

describe("selectWithinBudget", () => {
  it("keeps everything when it all fits", () => {
    const picked = selectWithinBudget(
      [
        { id: "a", costCents: 500 },
        { id: "b", costCents: 700 },
      ],
      2000,
      10,
    );
    expect(picked).toEqual(["a", "b"]);
  });

  it("prefers a better combination over greedily taking the top pick", () => {
    // Greedy takes "a" ($15) and has $5 left for nothing; the knapsack takes b + c.
    const picked = selectWithinBudget(
      [
        { id: "a", costCents: 1500 },
        { id: "b", costCents: 1000 },
        { id: "c", costCents: 1000 },
        { id: "d", costCents: 1000 },
      ],
      2000,
      10,
    );
    expect(picked).toEqual(["b", "c"]);
  });

  it("always includes free (owned) cards", () => {
    const picked = selectWithinBudget(
      [
        { id: "owned", costCents: 0 },
        { id: "pricey", costCents: 5000 },
      ],
      1000,
      10,
    );
    expect(picked).toEqual(["owned"]);
  });

  it("returns nothing for a zero budget with only paid cards", () => {
    expect(selectWithinBudget([{ id: "a", costCents: 100 }], 0, 10)).toEqual([]);
  });

  it("trims to maxCount, keeping the best ranked", () => {
    const picked = selectWithinBudget(
      [
        { id: "a", costCents: 100 },
        { id: "b", costCents: 100 },
        { id: "c", costCents: 100 },
      ],
      1000,
      2,
    );
    expect(picked).toEqual(["a", "b"]);
  });
});
