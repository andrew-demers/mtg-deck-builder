"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Button from "@/components/button";
import { isBasicLand, validateColorIdentity } from "@/lib/commander-legality";

interface CardData {
  id: string;
  name: string;
  manaCost: string | null;
  manaValue: number;
  type: string;
  colorIdentity: string[];
}

interface OwnedCollectionEntry {
  id: string;
  card: CardData;
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
  const [removingCardId, setRemovingCardId] = useState<string | null>(null);
  const [updatingCardId, setUpdatingCardId] = useState<string | null>(null);
  const [collectionCards, setCollectionCards] = useState<CardData[] | null>(null);
  const [isLoadingCollection, setIsLoadingCollection] = useState(false);
  const [collectionQuery, setCollectionQuery] = useState("");

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

  async function handleRemoveCard(cardId: string) {
    setError(null);
    setRemovingCardId(cardId);

    try {
      const response = await fetch(`/api/decks/${deckId}/cards/${cardId}`, { method: "DELETE" });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong removing this card.");
        return;
      }

      const data = (await response.json()) as DeckData;
      setDeck(data);
    } catch {
      setError("Something went wrong removing this card.");
    } finally {
      setRemovingCardId(null);
    }
  }

  async function handleUpdateQuantity(cardId: string, quantity: number) {
    if (quantity < 1) {
      return;
    }

    setError(null);
    setUpdatingCardId(cardId);

    try {
      const response = await fetch(`/api/decks/${deckId}/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong updating this card's quantity.");
        return;
      }

      const data = (await response.json()) as DeckData;
      setDeck(data);
    } catch {
      setError("Something went wrong updating this card's quantity.");
    } finally {
      setUpdatingCardId(null);
    }
  }

  async function handleLoadCollection() {
    setError(null);
    setIsLoadingCollection(true);

    try {
      const response = await fetch("/api/collection");

      if (!response.ok) {
        setError("Something went wrong loading your collection.");
        return;
      }

      const data = (await response.json()) as OwnedCollectionEntry[];
      const seen = new Set<string>();
      const deduped: CardData[] = [];

      for (const entry of data) {
        if (!seen.has(entry.card.id)) {
          seen.add(entry.card.id);
          deduped.push(entry.card);
        }
      }

      setCollectionCards(deduped);
    } catch {
      setError("Something went wrong loading your collection.");
    } finally {
      setIsLoadingCollection(false);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
        <p className="text-sm text-muted">Loading...</p>
      </main>
    );
  }

  if (!deck) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
        <p className="text-sm text-danger">{error ?? "Deck not found."}</p>
      </main>
    );
  }

  const sortedCards = sortDeckCards(deck.cards);
  const totalCards = deck.cards.reduce((sum, deckCard) => sum + deckCard.quantity, 0);

  const deckCardIds = new Set(deck.cards.map((deckCard) => deckCard.cardId));
  const commanderColorIdentity = deck.commanderCard?.colorIdentity ?? [];
  const normalizedCollectionQuery = collectionQuery.trim().toLowerCase();
  const availableCollectionCards = (collectionCards ?? []).filter(
    (card) =>
      !deckCardIds.has(card.id) &&
      validateColorIdentity(commanderColorIdentity, [card]) &&
      (normalizedCollectionQuery === "" || card.name.toLowerCase().includes(normalizedCollectionQuery)),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{deck.name}</h1>

      {deck.commanderCard ? (
        <div className="rounded border p-4">
          <p className="text-sm font-medium text-muted">Commander</p>
          <p className="text-lg font-medium">{deck.commanderCard.name}</p>
          <p className="text-sm text-muted">
            {deck.commanderCard.manaCost ? `${deck.commanderCard.manaCost} - ` : ""}
            {deck.commanderCard.type}
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {deck.cards.length === 0 ? (
        <Button onClick={handleBuildDeck} disabled={isBuilding} className="self-start px-4 py-2">
          {isBuilding ? "Building..." : "Build deck"}
        </Button>
      ) : (
        <>
          <p className="text-sm text-muted">{totalCards} cards</p>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Mana cost</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Quantity</th>
                <th className="py-2 pr-4 font-medium"></th>
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
                  <td className="py-2 pr-4">
                    {isBasicLand(deckCard.card) ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="px-2 py-0.5 text-xs"
                          disabled={updatingCardId === deckCard.cardId || deckCard.quantity <= 1}
                          onClick={() => handleUpdateQuantity(deckCard.cardId, deckCard.quantity - 1)}
                        >
                          -
                        </Button>
                        <span>{deckCard.quantity}</span>
                        <Button
                          variant="secondary"
                          className="px-2 py-0.5 text-xs"
                          disabled={updatingCardId === deckCard.cardId}
                          onClick={() => handleUpdateQuantity(deckCard.cardId, deckCard.quantity + 1)}
                        >
                          +
                        </Button>
                      </div>
                    ) : (
                      deckCard.quantity
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {deckCard.isCommander ? null : (
                      <Button
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        disabled={removingCardId === deckCard.cardId}
                        onClick={() => handleRemoveCard(deckCard.cardId)}
                      >
                        {removingCardId === deckCard.cardId ? "Removing..." : "Remove"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-col gap-3 rounded border p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted">Deck critique</p>
              <Button onClick={handleGetCritique} disabled={isCritiquing} className="self-start px-4 py-2">
                {isCritiquing
                  ? "Getting critique..."
                  : deck.critique
                    ? "Re-request critique"
                    : "Get critique"}
              </Button>
            </div>
            {deck.critique ? (
              <p className="whitespace-pre-wrap text-sm text-muted">{deck.critique}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 rounded border p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted">Card suggestions</p>
              <Button onClick={handleGetSuggestions} disabled={isSuggesting} className="self-start px-4 py-2">
                {isSuggesting ? "Getting suggestions..." : "Get suggestions"}
              </Button>
            </div>
            {suggestedCards.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {suggestedCards.map((card) => (
                  <li key={card.id} className="flex items-center justify-between gap-4 text-sm">
                    <span>
                      {card.name}
                      <span className="text-muted">
                        {card.manaCost ? ` - ${card.manaCost}` : ""} - {card.type}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => handleAddCard(card.id)}
                      disabled={addingCardId === card.id}
                      className="px-3 py-1"
                    >
                      {addingCardId === card.id ? "Adding..." : "Add"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 rounded border p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted">Add from collection</p>
              <Button
                onClick={handleLoadCollection}
                disabled={isLoadingCollection}
                className="self-start px-4 py-2"
              >
                {isLoadingCollection ? "Loading..." : collectionCards ? "Refresh" : "Browse collection"}
              </Button>
            </div>
            {collectionCards ? (
              <>
                <input
                  type="text"
                  value={collectionQuery}
                  onChange={(event) => setCollectionQuery(event.target.value)}
                  placeholder="Search your collection"
                  className="rounded border px-3 py-2 text-sm"
                />
                {availableCollectionCards.length === 0 ? (
                  <p className="text-sm text-muted">No owned cards match.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {availableCollectionCards.map((card) => (
                      <li key={card.id} className="flex items-center justify-between gap-4 text-sm">
                        <span>
                          {card.name}
                          <span className="text-muted">
                            {card.manaCost ? ` - ${card.manaCost}` : ""} - {card.type}
                          </span>
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() => handleAddCard(card.id)}
                          disabled={addingCardId === card.id}
                          className="px-3 py-1"
                        >
                          {addingCardId === card.id ? "Adding..." : "Add"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </div>
        </>
      )}
    </main>
  );
}
