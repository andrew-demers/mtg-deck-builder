import { PIP_COLORS, WUBRG_ORDER } from "@/components/mana-cost";

interface StatsCard {
  manaValue: number;
  colors: string[];
  types: string[];
}

interface StatsEntry {
  quantity: number;
  card: StatsCard;
}

interface Breakdown {
  label: string;
  count: number;
  color?: string;
}

const MANA_CURVE_BUCKET_CAP = 6;

function buildManaBreakdown(entries: StatsEntry[]): Breakdown[] {
  const counts = new Map<string, number>();
  let colorless = 0;

  for (const entry of entries) {
    if (entry.card.colors.length === 0) {
      colorless += entry.quantity;
      continue;
    }
    for (const color of entry.card.colors) {
      counts.set(color, (counts.get(color) ?? 0) + entry.quantity);
    }
  }

  const breakdown: Breakdown[] = WUBRG_ORDER.filter((color) => counts.has(color)).map((color) => ({
    label: color,
    count: counts.get(color) ?? 0,
    color: PIP_COLORS[color],
  }));

  if (colorless > 0) {
    breakdown.push({ label: "Colorless", count: colorless, color: "var(--muted)" });
  }

  return breakdown;
}

function buildTypeBreakdown(entries: StatsEntry[]): Breakdown[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const type of entry.card.types) {
      counts.set(type, (counts.get(type) ?? 0) + entry.quantity);
    }
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function buildManaCurve(entries: StatsEntry[]): Breakdown[] {
  const counts = new Map<number, number>();

  for (const entry of entries) {
    const bucket = Math.min(Math.floor(entry.card.manaValue), MANA_CURVE_BUCKET_CAP);
    counts.set(bucket, (counts.get(bucket) ?? 0) + entry.quantity);
  }

  const buckets: Breakdown[] = [];
  for (let value = 0; value <= MANA_CURVE_BUCKET_CAP; value += 1) {
    const count = counts.get(value);
    if (count) {
      buckets.push({ label: value === MANA_CURVE_BUCKET_CAP ? `${value}+` : String(value), count });
    }
  }

  return buckets;
}

function BreakdownBars({
  title,
  breakdown,
  badgeLabels = false,
}: {
  title: string;
  breakdown: Breakdown[];
  badgeLabels?: boolean;
}) {
  const max = Math.max(1, ...breakdown.map((row) => row.count));

  if (breakdown.length === 0) {
    return (
      <div className="flex-1">
        <p className="mb-2 text-sm font-medium text-muted">{title}</p>
        <p className="text-sm text-muted">No data.</p>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <p className="mb-2 text-sm font-medium text-muted">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {breakdown.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-sm">
            {badgeLabels ? (
              <span className="tag-badge w-20 shrink-0 truncate text-center">{row.label}</span>
            ) : (
              <span className="w-16 shrink-0 truncate">{row.label}</span>
            )}
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-background">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(row.count / max) * 100}%`,
                  backgroundColor: row.color ?? "var(--primary)",
                }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-muted">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mana-color, card-type, and mana-curve breakdowns for any list of {quantity, card} entries - used for both the collection (respecting active filters) and a single deck's cards. */
export default function CardStats({
  entries,
  label = "cards in view",
}: {
  entries: StatsEntry[];
  label?: string;
}) {
  const totalCards = entries.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <div className="card flex flex-col gap-4">
      <p className="text-sm font-medium">
        {totalCards} {label}
      </p>
      <div className="flex flex-col gap-6 sm:flex-row">
        <BreakdownBars title="Mana colors" breakdown={buildManaBreakdown(entries)} />
        <BreakdownBars title="Types" breakdown={buildTypeBreakdown(entries)} badgeLabels />
        <BreakdownBars title="Mana curve" breakdown={buildManaCurve(entries)} />
      </div>
    </div>
  );
}
