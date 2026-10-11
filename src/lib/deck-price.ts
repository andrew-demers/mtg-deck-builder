interface PricedEntry {
  quantity: number;
  card: { priceUsd: number | null };
}

export interface DeckPrice {
  totalUsd: number;
  /** Cards (by entry, not quantity) with no known price, so the total is a lower bound. */
  unpricedCount: number;
}

export function computeDeckPrice(entries: PricedEntry[]): DeckPrice {
  let totalUsd = 0;
  let unpricedCount = 0;

  for (const entry of entries) {
    if (entry.card.priceUsd === null) {
      unpricedCount += 1;
      continue;
    }
    totalUsd += entry.card.priceUsd * entry.quantity;
  }

  return { totalUsd: Math.round(totalUsd * 100) / 100, unpricedCount };
}

export function formatUsd(value: number | null): string {
  return value === null ? "-" : `$${value.toFixed(2)}`;
}
