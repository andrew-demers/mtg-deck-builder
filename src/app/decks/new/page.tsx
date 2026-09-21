"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/button";
import ManaCost from "@/components/mana-cost";
import CardName from "@/components/card-name";

interface SuggestedCard {
  id: string;
  name: string;
  type: string;
  manaCost: string | null;
  oracleText: string | null;
}

export default function NewDeckPage() {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<SuggestedCard | null>(null);
  const [deckName, setDeckName] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestSuggestion() {
    setError(null);
    setSuggestion(null);
    setIsSuggesting(true);

    try {
      const response = await fetch("/api/decks/suggest-commander", {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }

      const data = (await response.json()) as SuggestedCard;
      setSuggestion(data);
      setDeckName(`${data.name} Commander Deck`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSuggesting(false);
    }
  }

  async function useSuggestion() {
    if (!suggestion) {
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: deckName.trim() || `${suggestion.name} Commander Deck`,
          commanderCardId: suggestion.id,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }

      const deck = (await response.json()) as { id: string };
      router.push(`/decks/${deck.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="font-display text-3xl tracking-wide">New deck</h1>
      <p className="text-sm text-muted">
        Ask for a Commander suggestion from your collection, then build a deck around it.
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button onClick={requestSuggestion} disabled={isSuggesting} className="px-7 py-3">
        {isSuggesting ? "Suggesting..." : "Suggest a commander"}
      </Button>
      {suggestion ? (
        <div className="card flex flex-col gap-3">
          <div>
            <p className="font-medium">
              <CardName name={suggestion.name} oracleText={suggestion.oracleText} />
            </p>
            <p className="text-sm text-muted">
              {suggestion.manaCost ? (
                <>
                  <ManaCost value={suggestion.manaCost} /> -{" "}
                </>
              ) : (
                ""
              )}
              {suggestion.type}
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Deck name</span>
            <input
              type="text"
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
              className="input"
            />
          </label>
          <Button onClick={useSuggestion} disabled={isCreating} className="self-start px-5 py-2 text-sm">
            {isCreating ? "Creating..." : "Use this commander"}
          </Button>
        </div>
      ) : null}
    </main>
  );
}
