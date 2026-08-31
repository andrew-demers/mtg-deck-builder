"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

interface UnmatchedRow {
  id: string;
  rawName: string;
  rawSet: string | null;
  quantity: number;
  foil: boolean;
  createdAt: string;
}

interface CardSearchResult {
  id: string;
  name: string;
  type: string;
  manaCost: string | null;
}

export default function UnmatchedCollectionPage() {
  const [rows, setRows] = useState<UnmatchedRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, CardSearchResult[]>>({});
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const searchTimeouts = useRef<Record<string, number>>({});

  useEffect(() => {
    loadRows();
  }, []);

  async function loadRows() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/collection/unmatched");

      if (!response.ok) {
        setError("Could not load unmatched rows.");
        return;
      }

      const data = (await response.json()) as UnmatchedRow[];
      setRows(data);
    } catch {
      setError("Could not load unmatched rows.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleQueryChange(rowId: string, event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setQueries((previous) => ({ ...previous, [rowId]: value }));

    const existingTimeout = searchTimeouts.current[rowId];
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout);
    }

    const trimmed = value.trim();

    if (!trimmed) {
      setResults((previous) => ({ ...previous, [rowId]: [] }));
      return;
    }

    searchTimeouts.current[rowId] = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/cards/search?q=${encodeURIComponent(trimmed)}`);

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as CardSearchResult[];
        setResults((previous) => ({ ...previous, [rowId]: data }));
      } catch {
        // Ignore transient search failures - the user can keep typing.
      }
    }, 300);
  }

  async function resolveRow(rowId: string, body: { cardId: string } | { ignore: true }) {
    setPendingRowId(rowId);
    setError(null);

    try {
      const response = await fetch(`/api/collection/unmatched/${rowId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setError("Could not update that row. Please try again.");
        return;
      }

      setRows((previous) => previous.filter((row) => row.id !== rowId));
      setQueries((previous) => {
        const next = { ...previous };
        delete next[rowId];
        return next;
      });
      setResults((previous) => {
        const next = { ...previous };
        delete next[rowId];
        return next;
      });
    } catch {
      setError("Could not update that row. Please try again.");
    } finally {
      setPendingRowId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Resolve unmatched rows</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {isLoading ? <p className="text-sm text-zinc-700">Loading...</p> : null}
      {!isLoading && rows.length === 0 ? (
        <p className="text-sm text-zinc-700">No unmatched rows to resolve.</p>
      ) : null}
      <ul className="flex flex-col gap-6">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-3 rounded border p-4">
            <div>
              <p className="font-medium">{row.rawName}</p>
              <p className="text-sm text-zinc-500">
                {row.rawSet ? `${row.rawSet} - ` : ""}Qty {row.quantity}
                {row.foil ? " - Foil" : ""}
              </p>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Search for the matching card</span>
              <input
                type="text"
                value={queries[row.id] ?? ""}
                onChange={(event) => handleQueryChange(row.id, event)}
                className="rounded border px-3 py-2"
                placeholder="Card name"
              />
            </label>
            {(results[row.id]?.length ?? 0) > 0 ? (
              <ul className="flex flex-col gap-1">
                {results[row.id]?.map((card) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      disabled={pendingRowId === row.id}
                      onClick={() => resolveRow(row.id, { cardId: card.id })}
                      className="w-full rounded border px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {card.name}
                      {card.manaCost ? ` ${card.manaCost}` : ""} - {card.type}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              disabled={pendingRowId === row.id}
              onClick={() => resolveRow(row.id, { ignore: true })}
              className="self-start rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Ignore
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
