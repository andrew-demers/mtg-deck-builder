"use client";

import { useEffect, useState, type FormEvent } from "react";
import ManaCost from "@/components/mana-cost";
import CardStats from "@/components/card-stats";
import CardName from "@/components/card-name";
import Button from "@/components/button";

interface CardData {
  id: string;
  name: string;
  manaCost: string | null;
  manaValue: number;
  type: string;
  types: string[];
  colors: string[];
  isCommanderEligible: boolean;
  oracleText: string | null;
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
  const [reloadCounter, setReloadCounter] = useState(0);

  const [addName, setAddName] = useState("");
  const [addQuantity, setAddQuantity] = useState("1");
  const [addFoil, setAddFoil] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [addMessage, setAddMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    const query = addName.trim();
    if (query.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/cards/lookup?autocomplete=1&name=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (response.ok) {
          setNameSuggestions(((await response.json()) as { names: string[] }).names);
        }
      } catch {
        // Suggestions are a convenience; typing a full name still works.
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [addName]);

  async function handleAddCard(event: FormEvent) {
    event.preventDefault();
    setIsAdding(true);
    setAddMessage(null);

    try {
      const response = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName, quantity: Number(addQuantity), foil: addFoil }),
      });
      const data = (await response.json()) as { name?: string; error?: string };

      if (!response.ok) {
        setAddMessage({ text: data.error ?? "Could not add that card.", isError: true });
        return;
      }

      setAddMessage({ text: `Added ${addQuantity} x ${data.name}.`, isError: false });
      setAddName("");
      setAddQuantity("1");
      setReloadCounter((count) => count + 1);
    } catch {
      setAddMessage({ text: "Could not add that card.", isError: true });
    } finally {
      setIsAdding(false);
    }
  }

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
  }, [minManaValue, maxManaValue, colors, type, commanderEligibleOnly, sort, reloadCounter]);

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
      <h1 className="font-display text-3xl tracking-wide">Collection</h1>

      <form onSubmit={handleAddCard} className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">Add a card</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Card name (Scryfall search)</span>
            <input
              type="text"
              list="add-card-suggestions"
              value={addName}
              onChange={(event) => setAddName(event.target.value)}
              className="input"
            />
            <datalist id="add-card-suggestions">
              {(addName.trim().length >= 2 ? nameSuggestions : []).map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Quantity</span>
            <input
              type="number"
              min={1}
              value={addQuantity}
              onChange={(event) => setAddQuantity(event.target.value)}
              className="input w-24"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm font-medium">
            <input type="checkbox" checked={addFoil} onChange={(event) => setAddFoil(event.target.checked)} />
            Foil
          </label>
          <Button type="submit" disabled={isAdding || !addName.trim()} className="px-5 py-2 text-sm">
            {isAdding ? "Adding..." : "Add"}
          </Button>
        </div>
        {addMessage ? (
          <p className={`text-sm ${addMessage.isError ? "text-danger" : "text-muted"}`}>{addMessage.text}</p>
        ) : null}
      </form>

      <div className="card flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Min mana value</span>
            <input
              type="number"
              min={0}
              value={minManaValue}
              onChange={(event) => setMinManaValue(event.target.value)}
              className="input w-28"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Max mana value</span>
            <input
              type="number"
              min={0}
              value={maxManaValue}
              onChange={(event) => setMaxManaValue(event.target.value)}
              className="input w-28"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Type contains</span>
            <input
              type="text"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Sort by</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="input"
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

      {!isLoading && entries.length > 0 ? <CardStats entries={entries} /> : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">No cards match the current filters.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Mana cost</th>
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="py-2 pr-4 font-medium">Quantity</th>
              <th className="py-2 pr-4 font-medium">Foil</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  <CardName name={entry.card.name} oracleText={entry.card.oracleText} />
                </td>
                <td className="py-2 pr-4">
                  {entry.card.manaCost ? <ManaCost value={entry.card.manaCost} /> : "-"}
                </td>
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
