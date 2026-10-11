export interface BudgetCandidate {
  id: string;
  /** Cost to acquire in cents; 0 for cards the player already owns. */
  costCents: number;
}

/**
 * Picks the best subset of `candidates` whose total cost fits in
 * `budgetCents`. `candidates` must be ordered best first (the LLM's ranking);
 * each is valued by its rank (best is worth the most), so the result
 * maximises total rank value rather than just taking the top picks until the
 * money runs out - e.g. two good $8 cards beat one great $20 card that
 * leaves nothing for the rest. This is a 0/1 knapsack over cents, then at
 * most `maxCount` of the chosen cards are kept, best ranked first. Returns
 * ids in rank order.
 */
export function selectWithinBudget(
  candidates: BudgetCandidate[],
  budgetCents: number,
  maxCount: number,
): string[] {
  const total = candidates.reduce((sum, candidate) => sum + candidate.costCents, 0);
  // No point sizing the table past what every candidate together would cost.
  const capacity = Math.max(0, Math.min(Math.floor(budgetCents), total));
  const n = candidates.length;

  // best[i][c] = max value using the first i candidates with at most c cents.
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(capacity + 1).fill(0));
  for (let i = 1; i <= n; i += 1) {
    const { costCents } = candidates[i - 1];
    const value = n - (i - 1);
    for (let c = 0; c <= capacity; c += 1) {
      best[i][c] = best[i - 1][c];
      if (costCents <= c) {
        best[i][c] = Math.max(best[i][c], best[i - 1][c - costCents] + value);
      }
    }
  }

  const chosen: string[] = [];
  let remaining = capacity;
  for (let i = n; i >= 1; i -= 1) {
    if (best[i][remaining] !== best[i - 1][remaining]) {
      chosen.push(candidates[i - 1].id);
      remaining -= candidates[i - 1].costCents;
    }
  }

  return chosen.reverse().slice(0, maxCount);
}
