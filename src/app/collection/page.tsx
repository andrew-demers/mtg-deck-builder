"use client";

import { useEffect, useState } from "react";

interface CardData {
  id: string;
  name: string;
  manaCost: string | null;
  manaValue: number;
  type: string;
  isCommanderEligible: boolean;
}

interface CollectionEntryData {
  id: string;
  quantity: number;
  foil: boolean;
  card: CardData;
}

type SortKey = "name" | "manaValue";

const COLOR_OPTIONS = ["W", "U", "B", "R", "G"] as const;

function buildQuery(filters: {
  minManaValue: string;
  maxManaValue: string;
  colors: Set<string>;
  type: string;
  commanderEligibleOnly: boolean;
  sort: SortKey;
}): string {
  const params = new URLSearchParams();

  if (filters.minManaValue !== "") {
    params.set("minManaValue", filters.minManaValue);
  }
  if (filters.maxManaValue !== "") {
    params.set("maxManaValue", filters.maxManaValue);
  }
  if (filters.colors.size > 0) {
    params.set("colors", Array.from(filters.colors).join(","));
  }
  if (filters.type.trim() !== "") {
    params.set("type", filters.type.trim());
  }
  if (filters.commanderEligibleOnly) {
    params.set("commanderEligible", "true");
  }
  params.set("sort", filters.sort);

  return params.toString();
}

export default function CollectionPage() {
  const [minManaValue, setMinManaValue] = useState("");
  const [maxManaValue, setMaxManaValue] = useState("");
  const [colors, setColors] = useState<Set<string>>(new Set());
  const [type, setType] = useState("");
  const [commanderEligibleOnly, setCommanderEligibleOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");

  const [entries, setEntries] = useState<CollectionEntryData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCollection() {
      setIsLoading(true);
      setError(null);

      try {
        const query = buildQuery({ minManaValue, maxManaValue, colors, type, commanderEligibleOnly, sort });
        const response = await fetch(`/api/collection?${query}`, { signal: controller.signal });

        if (!response.ok) {
          setError("Something went wrong loading your collection.");
          return;
        }

        const data = (await response.json()) as CollectionEntryData[];
        setEntries(data);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }
        setError("Something went wrong loading your collection.");
      } finally {
        setIsLoading(false);
      }
    }

    loadCollection();

    return () => controller.abort();
  }, [minManaValue, maxManaValue, colors, type, commanderEligibleOnly, sort]);

  function toggleColor(color: string) {
    setColors((current) => {
      const next = new Set(current);
      if (next.has(color)) {
        next.delete(color);
      } else {
        next.add(color);
      }
      return next;
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Collection</h1>

      <div className="flex flex-col gap-4 rounded border p-4">
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Min mana value</span>
            <input
              type="number"
              min={0}
              value={minManaValue}
              onChange={(event) => setMinManaValue(event.target.value)}
              className="w-28 rounded border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Max mana value</span>
            <input
              type="number"
              min={0}
              value={maxManaValue}
              onChange={(event) => setMaxManaValue(event.target.value)}
              className="w-28 rounded border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Type contains</span>
            <input
              type="text"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="rounded border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Sort by</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="rounded border px-3 py-2"
            >
              <option value="name">Name</option>
              <option value="manaValue">Mana value</option>
            </select>
          </label>
        </div>

        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="mb-1 text-sm font-medium">Colors</legend>
          {COLOR_OPTIONS.map((color) => (
            <label key={color} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={colors.has(color)}
                onChange={() => toggleColor(color)}
              />
              {color}
            </label>
          ))}
        </fieldset>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={commanderEligibleOnly}
            onChange={(event) => setCommanderEligibleOnly(event.target.checked)}
          />
          Commander eligible only
        </label>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">No cards match the current filters.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Mana cost</th>
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="py-2 pr-4 font-medium">Quantity</th>
              <th className="py-2 pr-4 font-medium">Foil</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b">
                <td className="py-2 pr-4">{entry.card.name}</td>
                <td className="py-2 pr-4">{entry.card.manaCost ?? "-"}</td>
                <td className="py-2 pr-4">{entry.card.type}</td>
                <td className="py-2 pr-4">{entry.quantity}</td>
                <td className="py-2 pr-4">{entry.foil ? "Foil" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
