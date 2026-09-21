"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button, { LinkButton } from "@/components/button";
import ColorIdentityPips from "@/components/color-identity";

interface CommanderCardData {
  id: string;
  name: string;
  colorIdentity: string[];
}

interface DeckSummary {
  id: string;
  name: string;
  commanderCard: CommanderCardData | null;
}

export default function DecksPage() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);

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

  async function handleDeleteDeck(deckId: string, deckName: string) {
    if (!window.confirm(`Delete "${deckName}"? This can't be undone.`)) {
      return;
    }

    setError(null);
    setDeletingDeckId(deckId);
    try {
      const response = await fetch(`/api/decks/${deckId}`, { method: "DELETE" });

      if (!response.ok) {
        setError("Something went wrong deleting this deck.");
        return;
      }

      setDecks((current) => current?.filter((deck) => deck.id !== deckId) ?? current);
    } catch {
      setError("Something went wrong deleting this deck.");
    } finally {
      setDeletingDeckId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl tracking-wide">My Decks</h1>
        <div className="flex gap-2">
          <LinkButton href="/decks/new" className="px-5 py-2 text-sm">
            New deck
          </LinkButton>
          <LinkButton href="/decks/wizard" variant="secondary" className="px-5 py-2 text-sm">
            Deck wizard
          </LinkButton>
          <LinkButton href="/decks/import" variant="secondary" className="px-5 py-2 text-sm">
            Import decklist
          </LinkButton>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {decks && decks.length === 0 ? (
        <p className="text-sm text-muted">
          You don&apos;t have any decks yet.{" "}
          <Link href="/decks/new" className="text-primary underline">
            Create one
          </Link>
          .
        </p>
      ) : null}

      {decks && decks.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {decks.map((deck) => (
            <li key={deck.id} className="card flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Link href={`/decks/${deck.id}`} className="text-lg font-medium">
                  {deck.name}
                </Link>
                <p className="flex items-center gap-2 text-sm text-muted">
                  {deck.commanderCard ? (
                    <>
                      <ColorIdentityPips colors={deck.commanderCard.colorIdentity} />
                      {deck.commanderCard.name}
                    </>
                  ) : (
                    "No commander set"
                  )}
                </p>
              </div>
              <Button
                variant="secondary"
                className="px-4 py-1 text-xs text-danger"
                disabled={deletingDeckId === deck.id}
                onClick={() => handleDeleteDeck(deck.id, deck.name)}
              >
                {deletingDeckId === deck.id ? "Deleting..." : "Delete"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
