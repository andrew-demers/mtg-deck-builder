"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LinkButton } from "@/components/button";

interface CommanderCardData {
  id: string;
  name: string;
}

interface DeckSummary {
  id: string;
  name: string;
  commanderCard: CommanderCardData | null;
}

export default function DecksPage() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDecks() {
      try {
        const response = await fetch("/api/decks", { signal: controller.signal });

        if (!response.ok) {
          setError("Something went wrong loading your decks.");
          return;
        }

        const data = (await response.json()) as DeckSummary[];
        setDecks(data);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }
        setError("Something went wrong loading your decks.");
      }
    }

    loadDecks();

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">My Decks</h1>
        <LinkButton href="/decks/new" className="px-4 py-2 text-sm">
          New deck
        </LinkButton>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {decks && decks.length === 0 ? (
        <p className="text-sm text-muted">
          You don&apos;t have any decks yet. <Link href="/decks/new" className="underline">Create one</Link>.
        </p>
      ) : null}

      {decks && decks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {decks.map((deck) => (
            <li key={deck.id} className="rounded border p-4">
              <Link href={`/decks/${deck.id}`} className="text-lg font-medium underline">
                {deck.name}
              </Link>
              <p className="text-sm text-muted">
                {deck.commanderCard ? deck.commanderCard.name : "No commander set"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
