"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface CardData {
  id: string;
  name: string;
  manaCost: string | null;
  manaValue: number;
  type: string;
}

interface DeckCardData {
  id: string;
  cardId: string;
  quantity: number;
  isCommander: boolean;
  card: CardData;
}

interface DeckData {
  id: string;
  name: string;
  commanderCardId: string | null;
  commanderCard: CardData | null;
  cards: DeckCardData[];
  critique: string | null;
}

function sortDeckCards(cards: DeckCardData[]): DeckCardData[] {
  return [...cards].sort((a, b) => {
    if (a.isCommander !== b.isCommander) {
      return a.isCommander ? -1 : 1;
    }
    return a.card.name.localeCompare(b.card.name);
  });
}

export default function DeckPage() {
  const params = useParams<{ id: string }>();
  const deckId = params.id;

  const [deck, setDeck] = useState<DeckData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isCritiquing, setIsCritiquing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedCards, setSuggestedCards] = useState<CardData[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!deckId) {
      return;
    }

    const controller = new AbortController();

    async function loadDeck() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/decks/${deckId}`, { signal: controller.signal });

        if (!response.ok) {
          setError("Something went wrong loading this deck.");
          return;
        }

        const data = (await response.json()) as DeckData;
        setDeck(data);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }
        setError("Something went wrong loading this deck.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDeck();

    return () => controller.abort();
  }, [deckId]);

  async function handleBuildDeck() {
    setError(null);
    setIsBuilding(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/build`, { method: "POST" });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong building this deck.");
        return;
      }

      const data = (await response.json()) as DeckData;
      setDeck(data);
    } catch {
      setError("Something went wrong building this deck.");
    } finally {
      setIsBuilding(false);
    }
  }

  async function handleGetCritique() {
    setError(null);
    setIsCritiquing(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/critique`, { method: "POST" });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong getting a critique for this deck.");
        return;
      }

      const data = (await response.json()) as DeckData;
      setDeck(data);
    } catch {
      setError("Something went wrong getting a critique for this deck.");
    } finally {
      setIsCritiquing(false);
    }
  }

  async function handleGetSuggestions() {
    setError(null);
    setIsSuggesting(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/suggest-cards`, { method: "POST" });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong getting card suggestions for this deck.");
        return;
      }

      const data = (await response.json()) as CardData[];
      setSuggestedCards(data);
    } catch {
      setError("Something went wrong getting card suggestions for this deck.");
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleAddCard(cardId: string) {
    setError(null);
    setAddingCardId(cardId);

    try {
      const response = await fetch(`/api/decks/${deckId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong adding this card to the deck.");
        return;
      }

      const data = (await response.json()) as DeckData;
      setDeck(data);
      setSuggestedCards((current) => current.filter((card) => card.id !== cardId));
    } catch {
      setError("Something went wrong adding this card to the deck.");
    } finally {
      setAddingCardId(null);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
        <p className="text-sm text-zinc-700">Loading...</p>
      </main>
    );
  }

  if (!deck) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
        <p className="text-sm text-red-600">{error ?? "Deck not found."}</p>
      </main>
    );
  }

  const sortedCards = sortDeckCards(deck.cards);
  const totalCards = deck.cards.reduce((sum, deckCard) => sum + deckCard.quantity, 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{deck.name}</h1>

      {deck.commanderCard ? (
        <div className="rounded border p-4">
          <p className="text-sm font-medium text-zinc-500">Commander</p>
          <p className="text-lg font-medium">{deck.commanderCard.name}</p>
          <p className="text-sm text-zinc-500">
            {deck.commanderCard.manaCost ? `${deck.commanderCard.manaCost} - ` : ""}
            {deck.commanderCard.type}
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {deck.cards.length === 0 ? (
        <button
          type="button"
          onClick={handleBuildDeck}
          disabled={isBuilding}
          className="self-start rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {isBuilding ? "Building..." : "Build deck"}
        </button>
      ) : (
        <>
          <p className="text-sm text-zinc-700">{totalCards} cards</p>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Mana cost</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {sortedCards.map((deckCard) => (
                <tr key={deckCard.id} className="border-b">
                  <td className="py-2 pr-4">
                    {deckCard.card.name}
                    {deckCard.isCommander ? " (Commander)" : ""}
                  </td>
                  <td className="py-2 pr-4">{deckCard.card.manaCost ?? "-"}</td>
                  <td className="py-2 pr-4">{deckCard.card.type}</td>
                  <td className="py-2 pr-4">{deckCard.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-col gap-3 rounded border p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-zinc-500">Deck critique</p>
              <button
                type="button"
                onClick={handleGetCritique}
                disabled={isCritiquing}
                className="self-start rounded bg-black px-4 py-2 text-white disabled:opacity-50"
              >
                {isCritiquing
                  ? "Getting critique..."
                  : deck.critique
                    ? "Re-request critique"
                    : "Get critique"}
              </button>
            </div>
            {deck.critique ? (
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{deck.critique}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 rounded border p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-zinc-500">Card suggestions</p>
              <button
                type="button"
                onClick={handleGetSuggestions}
                disabled={isSuggesting}
                className="self-start rounded bg-black px-4 py-2 text-white disabled:opacity-50"
              >
                {isSuggesting ? "Getting suggestions..." : "Get suggestions"}
              </button>
            </div>
            {suggestedCards.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {suggestedCards.map((card) => (
                  <li key={card.id} className="flex items-center justify-between gap-4 text-sm">
                    <span>
                      {card.name}
                      <span className="text-zinc-500">
                        {card.manaCost ? ` - ${card.manaCost}` : ""} - {card.type}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddCard(card.id)}
                      disabled={addingCardId === card.id}
                      className="rounded border px-3 py-1 disabled:opacity-50"
                    >
                      {addingCardId === card.id ? "Adding..." : "Add"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      )}
    </main>
  );
}
