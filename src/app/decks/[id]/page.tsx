"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Button, { LinkButton } from "@/components/button";
import ManaCost from "@/components/mana-cost";
import ColorIdentityPips from "@/components/color-identity";
import CardStats from "@/components/card-stats";
import CardName from "@/components/card-name";
import CollapsibleCard from "@/components/collapsible-card";
import Markdown from "@/components/markdown";
import DeckVersions from "@/components/deck-versions";
import type { VersionGrade } from "@/components/grade-panel";
import { deckSignature } from "@/lib/deck-signature";
import { PIP_COLORS, WUBRG_ORDER } from "@/components/mana-cost";
import { computeDeckPrice, formatUsd } from "@/lib/deck-price";
import { selectWithinBudget } from "@/lib/budget-selection";
import { isCommanderEligible } from "@/lib/commander-eligibility";
import {
  buildBuyList,
  buildMassEntryUrl,
  formatBuyListText,
} from "@/lib/tcgplayer";
import {
  isBasicLand,
  unionColorIdentity,
  validateColorIdentity,
} from "@/lib/commander-legality";

interface CardData {
  id: string;
  name: string;
  manaCost: string | null;
  manaValue: number;
  type: string;
  types: string[];
  colors: string[];
  colorIdentity: string[];
  oracleText: string | null;
  priceUsd: number | null;
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
  description: string | null;
  goal: string | null;
  gradeScore: number | null;
  gradeGoal: string | null;
  gradeBreakdown: VersionGrade["breakdown"] | null;
  gradeSummary: string | null;
  gradeSignature: string | null;
}

interface SuggestedCard {
  card: CardData;
  tag: string;
  reason: string;
}

interface TokenRecommendation {
  kind: "token" | "counter";
  name: string;
  quantity: number;
  cards: string[];
  reason: string;
}

interface ReplacementSuggestion {
  add: CardData;
  remove: CardData;
  reason: string;
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
  const router = useRouter();
  const deckId = params.id;

  const [deck, setDeck] = useState<DeckData | null>(null);
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isCritiquing, setIsCritiquing] = useState(false);
  const [isDescribing, setIsDescribing] = useState(false);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedCards, setSuggestedCards] = useState<SuggestedCard[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  // Every card the critique recommends, kept so a budget can narrow the
  // visible list and be widened again. Null when the list is not from a critique.
  const [critiqueSuggestions, setCritiqueSuggestions] = useState<
    SuggestedCard[] | null
  >(null);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [tokenRecommendations, setTokenRecommendations] = useState<
    TokenRecommendation[] | null
  >(null);
  const [isEvaluatingTokens, setIsEvaluatingTokens] = useState(false);
  const [changingFromCardId, setChangingFromCardId] = useState<string | null>(
    null,
  );
  const [commanderQuery, setCommanderQuery] = useState("");
  const [isChangingCommander, setIsChangingCommander] = useState(false);
  const [isKeepingOwned, setIsKeepingOwned] = useState(false);
  const [keepOwnedNotice, setKeepOwnedNotice] = useState<string | null>(null);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);
  const [isAddingAll, setIsAddingAll] = useState(false);
  const [removingCardId, setRemovingCardId] = useState<string | null>(null);
  const [updatingCardId, setUpdatingCardId] = useState<string | null>(null);
  const [collectionCards, setCollectionCards] = useState<CardData[] | null>(
    null,
  );
  const [isLoadingCollection, setIsLoadingCollection] = useState(false);
  const [collectionQuery, setCollectionQuery] = useState("");
  const [switchingCardId, setSwitchingCardId] = useState<string | null>(null);
  const [otherDeckCardIds, setOtherDeckCardIds] = useState<Set<string>>(
    new Set(),
  );
  const [swapQuery, setSwapQuery] = useState("");
  const [selectedNewCardIds, setSelectedNewCardIds] = useState<Set<string>>(
    new Set(),
  );
  const [replacements, setReplacements] = useState<ReplacementSuggestion[]>([]);
  const [isFindingReplacements, setIsFindingReplacements] = useState(false);
  const [applyingSwapId, setApplyingSwapId] = useState<string | null>(null);

  useEffect(() => {
    if (!deckId) {
      return;
    }

    const controller = new AbortController();

    async function loadDeck() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/decks/${deckId}`, {
          signal: controller.signal,
        });

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

  useEffect(() => {
    if (!deckId) {
      return;
    }

    const controller = new AbortController();

    async function loadCollection() {
      setIsLoadingCollection(true);

      try {
        const response = await fetch("/api/collection", {
          signal: controller.signal,
        });

        if (!response.ok) {
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
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }
      } finally {
        setIsLoadingCollection(false);
      }
    }

    loadCollection();

    return () => controller.abort();
  }, [deckId]);

  useEffect(() => {
    if (!deckId) {
      return;
    }

    const controller = new AbortController();

    async function loadOtherDeckCardIds() {
      try {
        const response = await fetch(
          `/api/decks/${deckId}/other-deck-card-ids`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as string[];
        setOtherDeckCardIds(new Set(data));
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }
      }
    }

    loadOtherDeckCardIds();

    return () => controller.abort();
  }, [deckId]);

  async function handleBuildDeck() {
    setError(null);
    setIsBuilding(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/build`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
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

  async function handleRefreshPrices() {
    setError(null);
    setIsRefreshingPrices(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/prices`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Something went wrong refreshing prices.");
        return;
      }

      const deckResponse = await fetch(`/api/decks/${deckId}`);
      if (deckResponse.ok) {
        setDeck((await deckResponse.json()) as DeckData);
      }
    } catch {
      setError("Something went wrong refreshing prices.");
    } finally {
      setIsRefreshingPrices(false);
    }
  }

  async function handleChangeCommander(
    fromCardId: string,
    toCardId: string,
    removeOffIdentity = false,
  ) {
    setError(null);
    setIsChangingCommander(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/change-commander`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromCardId, toCardId, removeOffIdentity }),
      });

      if (response.status === 409) {
        const { conflicts } = (await response.json()) as {
          conflicts: string[];
        };
        if (
          window.confirm(
            `This commander's colors don't allow ${conflicts.length} card${conflicts.length === 1 ? "" : "s"} in the deck: ${conflicts.join(", ")}. Remove them and change commander?`,
          )
        ) {
          setIsChangingCommander(false);
          await handleChangeCommander(fromCardId, toCardId, true);
        }
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Something went wrong changing the commander.");
        return;
      }

      setDeck((await response.json()) as DeckData);
      setChangingFromCardId(null);
      setCommanderQuery("");
    } catch {
      setError("Something went wrong changing the commander.");
    } finally {
      setIsChangingCommander(false);
    }
  }

  async function handleKeepOwnedOnly() {
    if (
      !window.confirm(
        "Remove every card you don't own, and every card already in another deck, from this deck? Commanders and basic lands are kept.",
      )
    ) {
      return;
    }

    setError(null);
    setKeepOwnedNotice(null);
    setIsKeepingOwned(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/keep-owned`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Something went wrong updating this deck.");
        return;
      }

      const { removed } = (await response.json()) as {
        removed: { name: string }[];
      };
      setKeepOwnedNotice(
        removed.length === 0
          ? "Every card in this deck is already owned and unused elsewhere."
          : `Removed ${removed.length} card${removed.length === 1 ? "" : "s"}: ${removed.map((card) => card.name).join(", ")}`,
      );

      const deckResponse = await fetch(`/api/decks/${deckId}`);
      if (deckResponse.ok) {
        setDeck((await deckResponse.json()) as DeckData);
      }
    } catch {
      setError("Something went wrong updating this deck.");
    } finally {
      setIsKeepingOwned(false);
    }
  }

  async function handleGetCritique() {
    setError(null);
    setIsCritiquing(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/critique`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ??
            "Something went wrong getting a critique for this deck.",
        );
        return;
      }

      const data = (await response.json()) as DeckData;
      setDeck(data);
      await handleSuggestFromCritique();
    } catch {
      setError("Something went wrong getting a critique for this deck.");
    } finally {
      setIsCritiquing(false);
    }
  }

  async function handleGetDescription() {
    setError(null);
    setIsDescribing(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/description`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ??
            "Something went wrong getting a description for this deck.",
        );
        return;
      }

      const data = (await response.json()) as DeckData;
      setDeck(data);
    } catch {
      setError("Something went wrong getting a description for this deck.");
    } finally {
      setIsDescribing(false);
    }
  }

  async function handleEvaluateTokens() {
    setError(null);
    setIsEvaluatingTokens(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/evaluate-tokens`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ?? "Something went wrong evaluating tokens and counters.",
        );
        return;
      }

      setTokenRecommendations((await response.json()) as TokenRecommendation[]);
    } catch {
      setError("Something went wrong evaluating tokens and counters.");
    } finally {
      setIsEvaluatingTokens(false);
    }
  }

  async function handleGetSuggestions(
    allowUnowned: boolean,
    budgetUsd?: number,
  ) {
    setError(null);
    setIsSuggesting(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/suggest-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowUnowned, budgetUsd }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ??
            "Something went wrong getting card suggestions for this deck.",
        );
        return;
      }

      const data = (await response.json()) as SuggestedCard[];
      setCritiqueSuggestions(null);
      setSuggestedCards(data);
    } catch {
      setError("Something went wrong getting card suggestions for this deck.");
    } finally {
      setIsSuggesting(false);
    }
  }

  /** Fills the suggestions list with the cards the saved critique recommends adding. */
  async function handleSuggestFromCritique() {
    setError(null);
    setIsSuggesting(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/suggest-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromCritique: true }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ??
            "Something went wrong getting the critique's suggested cards.",
        );
        return;
      }

      const data = (await response.json()) as SuggestedCard[];
      setCritiqueSuggestions(data);
      setSuggestedCards(data);
    } catch {
      setError("Something went wrong getting the critique's suggested cards.");
    } finally {
      setIsSuggesting(false);
    }
  }

  /**
   * Narrows the critique's cards to the best set whose unowned cards fit the
   * budget (owned cards are free), keeping the critique's order. Cards
   * without a known price can't be checked against it, so they are left out.
   */
  function narrowCritiqueToBudget(budgetUsd: number) {
    if (!critiqueSuggestions) {
      return;
    }
    const owned = new Set((collectionCards ?? []).map((card) => card.id));
    const inDeck = new Set(deck?.cards.map((deckCard) => deckCard.cardId));
    const remaining = critiqueSuggestions.filter(
      ({ card }) => !inDeck.has(card.id),
    );
    const chosen = new Set(
      selectWithinBudget(
        remaining
          .filter(({ card }) => owned.has(card.id) || card.priceUsd !== null)
          .map(({ card }) => ({
            id: card.id,
            costCents: owned.has(card.id)
              ? 0
              : Math.round((card.priceUsd ?? 0) * 100),
          })),
        Math.round(budgetUsd * 100),
        remaining.length,
      ),
    );
    setSuggestedCards(remaining.filter(({ card }) => chosen.has(card.id)));
  }

  function toggleNewCard(cardId: string) {
    setSelectedNewCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  async function handleGetReplacements() {
    setError(null);
    setIsFindingReplacements(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/replace-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: Array.from(selectedNewCardIds) }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ??
            "Something went wrong getting replacement suggestions.",
        );
        return;
      }

      const data = (await response.json()) as ReplacementSuggestion[];
      setReplacements(data);
    } catch {
      setError("Something went wrong getting replacement suggestions.");
    } finally {
      setIsFindingReplacements(false);
    }
  }

  async function handleApplyReplacement({
    add,
    remove,
  }: ReplacementSuggestion) {
    setError(null);
    setApplyingSwapId(add.id);

    try {
      const addResponse = await fetch(`/api/decks/${deckId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: add.id }),
      });

      if (!addResponse.ok) {
        const data = (await addResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ?? "Something went wrong adding this card to the deck.",
        );
        return;
      }

      const removeResponse = await fetch(
        `/api/decks/${deckId}/cards/${remove.id}`,
        {
          method: "DELETE",
        },
      );

      if (!removeResponse.ok) {
        // The add already succeeded, so show the deck as it now stands (one
        // card over) rather than hiding that half of the swap happened.
        setDeck((await addResponse.json()) as DeckData);
        setError(
          `Added ${add.name}, but couldn't remove ${remove.name}. Remove it manually.`,
        );
        return;
      }

      setDeck((await removeResponse.json()) as DeckData);
      setReplacements((current) =>
        current.filter((swap) => swap.add.id !== add.id),
      );
      setSelectedNewCardIds((current) => {
        const next = new Set(current);
        next.delete(add.id);
        return next;
      });
    } catch {
      setError("Something went wrong applying this swap.");
    } finally {
      setApplyingSwapId(null);
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
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ?? "Something went wrong adding this card to the deck.",
        );
        return;
      }

      const data = (await response.json()) as DeckData;
      setDeck(data);
      setSuggestedCards((current) =>
        current.filter((suggestion) => suggestion.card.id !== cardId),
      );
    } catch {
      setError("Something went wrong adding this card to the deck.");
    } finally {
      setAddingCardId(null);
    }
  }

  async function handleAddAllSuggestions() {
    setError(null);
    setIsAddingAll(true);

    // Sequential on purpose: the add route reads then writes the deck, so
    // parallel requests could race on the same DeckCard rows.
    const failed: string[] = [];

    try {
      for (const { card } of suggestedCards) {
        setAddingCardId(card.id);

        try {
          const response = await fetch(`/api/decks/${deckId}/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardId: card.id }),
          });

          if (!response.ok) {
            failed.push(card.name);
            continue;
          }

          setDeck((await response.json()) as DeckData);
          setSuggestedCards((current) =>
            current.filter((suggestion) => suggestion.card.id !== card.id),
          );
        } catch {
          failed.push(card.name);
        }
      }

      if (failed.length > 0) {
        setError(`Couldn't add ${failed.join(", ")}.`);
      }
    } finally {
      setAddingCardId(null);
      setIsAddingAll(false);
    }
  }

  async function handleRemoveCard(cardId: string) {
    setError(null);
    setRemovingCardId(cardId);

    try {
      const response = await fetch(`/api/decks/${deckId}/cards/${cardId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
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
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ?? "Something went wrong updating this card's quantity.",
        );
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

  async function handleRename() {
    if (nameDraft === null || !nameDraft.trim()) return;
    setError(null);
    setIsRenaming(true);

    try {
      const response = await fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Something went wrong renaming this deck.");
        return;
      }

      setDeck((await response.json()) as DeckData);
      setNameDraft(null);
    } catch {
      setError("Something went wrong renaming this deck.");
    } finally {
      setIsRenaming(false);
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

  async function handleDeleteDeck() {
    if (
      !deck ||
      !window.confirm(`Delete "${deck.name}"? This can't be undone.`)
    ) {
      return;
    }

    setError(null);
    setIsDeletingDeck(true);

    try {
      const response = await fetch(`/api/decks/${deckId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("Something went wrong deleting this deck.");
        return;
      }

      router.push("/decks");
    } catch {
      setError("Something went wrong deleting this deck.");
    } finally {
      setIsDeletingDeck(false);
    }
  }

  async function handleSwitchCommander(cardId: string) {
    setError(null);
    setSwitchingCardId(cardId);

    try {
      const response = await fetch(`/api/decks/${deckId}/commander`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ?? "Something went wrong switching the active commander.",
        );
        return;
      }

      const data = (await response.json()) as DeckData;
      setDeck(data);
    } catch {
      setError("Something went wrong switching the active commander.");
    } finally {
      setSwitchingCardId(null);
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

  const deckCardIds = new Set(deck.cards.map((deckCard) => deckCard.cardId));
  const builtCommanderDeckCards = deck.cards.filter(
    (deckCard) => deckCard.isCommander,
  );
  // A deck's commander is chosen (and `commanderCardId` set) before it's ever
  // built, when `cards` has no rows yet - fall back to `commanderCard` so the
  // commander box still renders pre-build, same as before multi-commander
  // decks existed.
  const commanderDeckCards =
    builtCommanderDeckCards.length > 0
      ? builtCommanderDeckCards
      : deck.commanderCard
        ? [
            {
              id: deck.commanderCard.id,
              cardId: deck.commanderCard.id,
              card: deck.commanderCard,
            },
          ]
        : [];
  const commanderColorIdentity = unionColorIdentity(
    commanderDeckCards.map((deckCard) => deckCard.card),
  );
  const ownedCardIds = new Set((collectionCards ?? []).map((card) => card.id));
  const normalizedCollectionQuery = collectionQuery.trim().toLowerCase();
  const availableCollectionCards = (collectionCards ?? []).filter(
    (card) =>
      !deckCardIds.has(card.id) &&
      validateColorIdentity(commanderColorIdentity, [card]) &&
      (normalizedCollectionQuery === "" ||
        card.name.toLowerCase().includes(normalizedCollectionQuery)),
  );

  const normalizedCommanderQuery = commanderQuery.trim().toLowerCase();
  const commanderCandidates = (collectionCards ?? []).filter(
    (card) =>
      isCommanderEligible(card) &&
      !commanderDeckCards.some((deckCard) => deckCard.cardId === card.id) &&
      (normalizedCommanderQuery === "" ||
        card.name.toLowerCase().includes(normalizedCommanderQuery)),
  );

  const deckPrice = computeDeckPrice(deck.cards);

  const buyList = collectionCards ? buildBuyList(deck.cards, ownedCardIds) : [];
  const massEntryUrl = buildMassEntryUrl(buyList);

  const normalizedSwapQuery = swapQuery.trim().toLowerCase();
  const swapCandidates = (collectionCards ?? []).filter(
    (card) =>
      (!deckCardIds.has(card.id) || selectedNewCardIds.has(card.id)) &&
      validateColorIdentity(commanderColorIdentity, [card]) &&
      (normalizedSwapQuery === "" ||
        card.name.toLowerCase().includes(normalizedSwapQuery) ||
        selectedNewCardIds.has(card.id)),
  );
  // Selected cards stay pinned to the top so they remain visible while searching.
  const sortedSwapCandidates = [
    ...swapCandidates.filter((card) => selectedNewCardIds.has(card.id)),
    ...swapCandidates.filter((card) => !selectedNewCardIds.has(card.id)),
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        {nameDraft === null ? (
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl tracking-wide">{deck.name}</h1>
            <Button
              variant="secondary"
              className="px-4 py-1 text-xs"
              onClick={() => setNameDraft(deck.name)}
            >
              Rename
            </Button>
          </div>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRename();
            }}
          >
            <input
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              aria-label="Deck name"
              autoFocus
              className="input text-lg"
            />
            <Button
              type="submit"
              disabled={isRenaming || !nameDraft.trim()}
              className="px-4 py-1 text-xs"
            >
              {isRenaming ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="secondary"
              disabled={isRenaming}
              onClick={() => setNameDraft(null)}
              className="px-4 py-1 text-xs"
            >
              Cancel
            </Button>
          </form>
        )}
        <div className="flex gap-2">
          <LinkButton
            variant="secondary"
            className="px-4 py-1 text-xs"
            href={`/api/decks/${deckId}/export`}
          >
            Export
          </LinkButton>
          <Button
            variant="secondary"
            className="px-4 py-1 text-xs text-danger"
            disabled={isDeletingDeck}
            onClick={handleDeleteDeck}
          >
            {isDeletingDeck ? "Deleting..." : "Delete deck"}
          </Button>
        </div>
      </div>

      {commanderDeckCards.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          {commanderDeckCards.map((deckCard) => {
            const isActive = deckCard.cardId === deck.commanderCardId;

            return (
              <div key={deckCard.id} className="card flex-1 overflow-hidden">
                <div className="mb-3 -mx-6 -mt-6 flex h-1.5">
                  {WUBRG_ORDER.filter((letter) =>
                    deckCard.card.colorIdentity.includes(letter),
                  ).map((letter) => (
                    <span
                      key={letter}
                      className="flex-1"
                      style={{ backgroundColor: PIP_COLORS[letter] }}
                    />
                  ))}
                </div>
                <p className="text-sm font-medium text-muted">
                  Commander
                  {commanderDeckCards.length > 1 && isActive ? " (Active)" : ""}
                </p>
                <p className="text-lg font-medium">
                  <CardName
                    name={deckCard.card.name}
                    oracleText={deckCard.card.oracleText}
                  />
                  {collectionCards && !ownedCardIds.has(deckCard.cardId) ? (
                    <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                      Not owned - {formatUsd(deckCard.card.priceUsd)}
                    </span>
                  ) : null}
                  {otherDeckCardIds.has(deckCard.cardId) ? (
                    <span className="tag-badge ml-2">In another deck</span>
                  ) : null}
                </p>
                <p className="text-sm text-muted">
                  {deckCard.card.manaCost ? (
                    <>
                      <ManaCost value={deckCard.card.manaCost} /> -{" "}
                    </>
                  ) : (
                    ""
                  )}
                  {deckCard.card.type}
                </p>
                {!isActive ? (
                  <Button
                    variant="secondary"
                    className="mt-2 px-4 py-1 text-xs"
                    disabled={switchingCardId === deckCard.cardId}
                    onClick={() => handleSwitchCommander(deckCard.cardId)}
                  >
                    {switchingCardId === deckCard.cardId
                      ? "Switching..."
                      : "Make active"}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  className="ml-2 mt-2 px-4 py-1 text-xs"
                  onClick={() => {
                    setChangingFromCardId(
                      changingFromCardId === deckCard.cardId
                        ? null
                        : deckCard.cardId,
                    );
                    setCommanderQuery("");
                  }}
                >
                  {changingFromCardId === deckCard.cardId
                    ? "Cancel"
                    : "Change commander"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      {changingFromCardId ? (
        <div className="card flex flex-col gap-3">
          <p className="text-sm font-medium text-muted">
            Choose a new commander from your collection
          </p>
          <input
            type="search"
            value={commanderQuery}
            onChange={(event) => setCommanderQuery(event.target.value)}
            placeholder="Search commanders"
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {commanderCandidates.length === 0 ? (
              <li className="text-sm text-muted">No owned commanders match.</li>
            ) : (
              commanderCandidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span>
                    {candidate.name}{" "}
                    <span className="text-muted">- {candidate.type}</span>
                  </span>
                  <Button
                    variant="secondary"
                    className="px-4 py-1 text-xs"
                    disabled={isChangingCommander}
                    onClick={() =>
                      handleChangeCommander(changingFromCardId, candidate.id)
                    }
                  >
                    {isChangingCommander ? "Changing..." : "Use"}
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {deck.cards.length === 0 ? (
        <Button
          onClick={handleBuildDeck}
          disabled={isBuilding}
          className="self-start px-7 py-3"
        >
          {isBuilding ? "Building..." : "Build deck"}
        </Button>
      ) : (
        <>
          <CardStats entries={deck.cards} label="cards in deck" />
          <DeckVersions
            deckId={deckId}
            goal={deck.goal}
            currentGrade={
              deck.gradeScore !== null &&
              deck.gradeGoal &&
              (!deck.goal?.trim() || deck.gradeGoal === deck.goal.trim()) &&
              deck.gradeBreakdown &&
              deck.gradeSignature ===
                deckSignature(deck.commanderCardId, deck.cards)
                ? {
                    score: deck.gradeScore,
                    goal: deck.gradeGoal,
                    breakdown: deck.gradeBreakdown,
                    summary: deck.gradeSummary ?? "",
                  }
                : null
            }
            onGoalSaved={(updated) => setDeck(updated as DeckData)}
            onRestored={(restored) => setDeck(restored as DeckData)}
          />
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm">
              <span className="font-medium">Estimated price:</span>{" "}
              {formatUsd(deckPrice.totalUsd)}
              {deckPrice.unpricedCount > 0 ? (
                <span className="text-muted">
                  {" "}
                  ({deckPrice.unpricedCount} cards unpriced)
                </span>
              ) : null}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="px-4 py-1 text-xs"
                disabled={isKeepingOwned}
                onClick={handleKeepOwnedOnly}
              >
                {isKeepingOwned
                  ? "Updating..."
                  : "Update deck with only owned cards"}
              </Button>
              {massEntryUrl ? (
                <LinkButton
                  variant="secondary"
                  className="px-4 py-1 text-xs"
                  href={massEntryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buy {buyList.length} on TCGplayer
                </LinkButton>
              ) : null}
              {buyList.length > 0 ? (
                <Button
                  variant="secondary"
                  className="px-4 py-1 text-xs"
                  onClick={() =>
                    navigator.clipboard.writeText(formatBuyListText(buyList))
                  }
                >
                  Copy buy list
                </Button>
              ) : null}
              <Button
                variant="secondary"
                className="px-4 py-1 text-xs"
                disabled={isRefreshingPrices}
                onClick={handleRefreshPrices}
              >
                {isRefreshingPrices ? "Refreshing..." : "Refresh prices"}
              </Button>
            </div>
          </div>
          {keepOwnedNotice ? (
            <p className="text-sm text-muted">{keepOwnedNotice}</p>
          ) : null}
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Mana cost</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Price</th>
                <th className="py-2 pr-4 font-medium">Quantity</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sortedCards.map((deckCard) => (
                <tr key={deckCard.id} className="border-b border-border">
                  <td className="py-2 pr-4">
                    <span className="mr-2 inline-block">
                      <ColorIdentityPips colors={deckCard.card.colorIdentity} />
                    </span>
                    <CardName
                      name={deckCard.card.name}
                      oracleText={deckCard.card.oracleText}
                    />
                    {deckCard.isCommander ? " (Commander)" : ""}
                    {collectionCards && !ownedCardIds.has(deckCard.cardId) ? (
                      <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                        Not owned - {formatUsd(deckCard.card.priceUsd)}
                      </span>
                    ) : null}
                    {otherDeckCardIds.has(deckCard.cardId) ? (
                      <span className="tag-badge ml-2">In another deck</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4">
                    {deckCard.card.manaCost ? (
                      <ManaCost value={deckCard.card.manaCost} />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 pr-4">{deckCard.card.type}</td>
                  <td className="py-2 pr-4">
                    {formatUsd(deckCard.card.priceUsd)}
                  </td>
                  <td className="py-2 pr-4">
                    {isBasicLand(deckCard.card) ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="px-2 py-0.5 text-xs"
                          disabled={
                            updatingCardId === deckCard.cardId ||
                            deckCard.quantity <= 1
                          }
                          onClick={() =>
                            handleUpdateQuantity(
                              deckCard.cardId,
                              deckCard.quantity - 1,
                            )
                          }
                        >
                          -
                        </Button>
                        <span>{deckCard.quantity}</span>
                        <Button
                          variant="secondary"
                          className="px-2 py-0.5 text-xs"
                          disabled={updatingCardId === deckCard.cardId}
                          onClick={() =>
                            handleUpdateQuantity(
                              deckCard.cardId,
                              deckCard.quantity + 1,
                            )
                          }
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
                        className="px-4 py-1 text-xs"
                        disabled={removingCardId === deckCard.cardId}
                        onClick={() => handleRemoveCard(deckCard.cardId)}
                      >
                        {removingCardId === deckCard.cardId
                          ? "Removing..."
                          : "Remove"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <CollapsibleCard
            title="Deck description"
            actions={
              <Button
                onClick={handleGetDescription}
                disabled={isDescribing}
                className="self-start px-5 py-2 text-sm"
              >
                {isDescribing
                  ? "Getting description..."
                  : deck.description
                    ? "Re-request description"
                    : "Get description"}
              </Button>
            }
          >
            {deck.description ? <Markdown>{deck.description}</Markdown> : null}
          </CollapsibleCard>

          <CollapsibleCard
            title="Deck critique"
            actions={
              <Button
                onClick={handleGetCritique}
                disabled={isCritiquing}
                className="self-start px-5 py-2 text-sm"
              >
                {isCritiquing
                  ? "Getting critique..."
                  : deck.critique
                    ? "Re-request critique"
                    : "Get critique and grade"}
              </Button>
            }
          >
            {!deck.goal ? (
              <p className="text-xs text-muted">
                No deck goal set, so the critique works out the deck&apos;s win
                condition and grades against that. Set a goal in the version
                history above to grade against your own.
              </p>
            ) : null}
            {deck.critique ? <Markdown>{deck.critique}</Markdown> : null}
          </CollapsibleCard>

          <CollapsibleCard
            title="Tokens and counters"
            actions={
              <Button
                onClick={handleEvaluateTokens}
                disabled={isEvaluatingTokens}
                className="self-start px-5 py-2 text-sm"
              >
                {isEvaluatingTokens
                  ? "Evaluating..."
                  : tokenRecommendations
                    ? "Re-evaluate tokens/counters"
                    : "Evaluate tokens/counters"}
              </Button>
            }
          >
            {tokenRecommendations?.length === 0 ? (
              <p className="text-sm text-muted">
                This deck doesn&apos;t appear to make or use tokens or counters.
              </p>
            ) : null}
            {tokenRecommendations && tokenRecommendations.length > 0 ? (
              <ul className="flex flex-col gap-3 text-sm">
                {tokenRecommendations.map((recommendation) => (
                  <li
                    key={`${recommendation.kind}-${recommendation.name}`}
                    className="flex flex-col gap-1"
                  >
                    <p>
                      <span className="font-medium">
                        {recommendation.quantity} x {recommendation.name}
                      </span>{" "}
                      <span className="text-xs text-muted">
                        ({recommendation.kind})
                      </span>
                    </p>
                    <p className="text-muted">{recommendation.reason}</p>
                    <p className="text-xs text-muted">
                      From: {recommendation.cards.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </CollapsibleCard>

          <CollapsibleCard
            title="Card suggestions"
            actions={
              <div className="flex gap-2">
                <Button
                  onClick={() => handleGetSuggestions(!ownedOnly)}
                  disabled={isSuggesting}
                  className="self-start px-5 py-2 text-sm"
                >
                  {isSuggesting ? "Getting suggestions..." : "Get suggestions"}
                </Button>
                {deck.critique ? (
                  <Button
                    variant="secondary"
                    onClick={handleSuggestFromCritique}
                    disabled={isSuggesting}
                    className="self-start px-5 py-2 text-sm"
                  >
                    From critique
                  </Button>
                ) : null}
              </div>
            }
          >
            <label className="flex items-center justify-end gap-2 text-sm">
              <input
                type="checkbox"
                checked={ownedOnly}
                onChange={(event) => setOwnedOnly(event.target.checked)}
              />
              Only suggest cards I own
            </label>
            <div className="flex items-center justify-end gap-2 text-sm">
              <label htmlFor="suggestion-budget" className="text-muted">
                Budget for cards I don&apos;t own ($)
              </label>
              <input
                id="suggestion-budget"
                type="number"
                min="1"
                step="1"
                inputMode="decimal"
                value={budgetInput}
                disabled={ownedOnly && !critiqueSuggestions}
                onChange={(event) => setBudgetInput(event.target.value)}
                placeholder="20"
                className="w-24 rounded border border-border bg-transparent px-2 py-1"
              />
              <Button
                variant="secondary"
                onClick={() =>
                  critiqueSuggestions
                    ? narrowCritiqueToBudget(Number(budgetInput))
                    : handleGetSuggestions(true, Number(budgetInput))
                }
                disabled={
                  isSuggesting ||
                  (ownedOnly && !critiqueSuggestions) ||
                  !(Number(budgetInput) > 0)
                }
                className="px-5 py-2 text-sm"
              >
                {critiqueSuggestions
                  ? "Narrow critique cards to budget"
                  : "Best cards for budget"}
              </Button>
            </div>
            {suggestedCards.length > 0 ? (
              <Button
                variant="secondary"
                onClick={handleAddAllSuggestions}
                disabled={isAddingAll || addingCardId !== null}
                className="self-start px-4 py-1 text-xs"
              >
                {isAddingAll
                  ? "Adding..."
                  : `Add all (${suggestedCards.length})`}
              </Button>
            ) : null}
            {suggestedCards.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {suggestedCards.map(({ card, tag, reason }) => (
                  <li
                    key={card.id}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span>
                      <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {tag}
                      </span>
                      <CardName name={card.name} oracleText={card.oracleText} />
                      {collectionCards && !ownedCardIds.has(card.id) ? (
                        <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                          Not owned
                        </span>
                      ) : null}
                      {otherDeckCardIds.has(card.id) ? (
                        <span className="tag-badge ml-2">In another deck</span>
                      ) : null}
                      <span className="text-muted">
                        {card.manaCost ? (
                          <>
                            {" "}
                            - <ManaCost value={card.manaCost} />
                          </>
                        ) : (
                          ""
                        )}{" "}
                        - {card.type}
                      </span>
                      <span className="ml-2 font-medium">
                        {formatUsd(card.priceUsd)}
                      </span>
                      <span className="block text-xs text-muted">{reason}</span>
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => handleAddCard(card.id)}
                      disabled={addingCardId === card.id || isAddingAll}
                      className="px-4 py-1 text-xs"
                    >
                      {addingCardId === card.id ? "Adding..." : "Add"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </CollapsibleCard>

          <CollapsibleCard
            title="Swap in new cards"
            actions={
              <Button
                onClick={handleGetReplacements}
                disabled={
                  isFindingReplacements || selectedNewCardIds.size === 0
                }
                className="self-start px-5 py-2 text-sm"
              >
                {isFindingReplacements
                  ? "Finding replacements..."
                  : `Recommend cuts${selectedNewCardIds.size > 0 ? ` (${selectedNewCardIds.size})` : ""}`}
              </Button>
            }
          >
            {collectionCards ? (
              <>
                <input
                  type="text"
                  value={swapQuery}
                  onChange={(event) => setSwapQuery(event.target.value)}
                  placeholder="Search your collection for the cards you just got"
                  className="input text-sm"
                />
                {sortedSwapCandidates.length === 0 ? (
                  <p className="text-sm text-muted">No owned cards match.</p>
                ) : (
                  <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {sortedSwapCandidates.map((card) => (
                      <li key={card.id} className="text-sm">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedNewCardIds.has(card.id)}
                            onChange={() => toggleNewCard(card.id)}
                          />
                          <CardName
                            name={card.name}
                            oracleText={card.oracleText}
                          />
                          <span className="text-muted">- {card.type}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Loading your collection...</p>
            )}
            {replacements.length > 0 ? (
              <ul className="flex flex-col gap-2 border-t border-border pt-3">
                {replacements.map((swap) => (
                  <li
                    key={swap.add.id}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span>
                      <span className="text-muted">Cut </span>
                      <CardName
                        name={swap.remove.name}
                        oracleText={swap.remove.oracleText}
                      />
                      <span className="text-muted"> for </span>
                      <CardName
                        name={swap.add.name}
                        oracleText={swap.add.oracleText}
                      />
                      <span className="block text-xs text-muted">
                        {swap.reason}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => handleApplyReplacement(swap)}
                      disabled={applyingSwapId === swap.add.id}
                      className="px-4 py-1 text-xs"
                    >
                      {applyingSwapId === swap.add.id ? "Swapping..." : "Swap"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </CollapsibleCard>

          <CollapsibleCard
            title="Add from collection"
            actions={
              collectionCards ? (
                <Button
                  variant="secondary"
                  onClick={handleLoadCollection}
                  disabled={isLoadingCollection}
                  className="self-start px-5 py-2 text-sm"
                >
                  {isLoadingCollection ? "Refreshing..." : "Refresh"}
                </Button>
              ) : null
            }
          >
            {!collectionCards && isLoadingCollection ? (
              <p className="text-sm text-muted">Loading your collection...</p>
            ) : null}
            {collectionCards ? (
              <>
                <input
                  type="text"
                  value={collectionQuery}
                  onChange={(event) => setCollectionQuery(event.target.value)}
                  placeholder="Search your collection"
                  className="input text-sm"
                />
                {availableCollectionCards.length === 0 ? (
                  <p className="text-sm text-muted">No owned cards match.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {availableCollectionCards.map((card) => (
                      <li
                        key={card.id}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span>
                          <CardName
                            name={card.name}
                            oracleText={card.oracleText}
                          />
                          {otherDeckCardIds.has(card.id) ? (
                            <span className="tag-badge ml-2">
                              In another deck
                            </span>
                          ) : null}
                          <span className="text-muted">
                            {card.manaCost ? (
                              <>
                                {" "}
                                - <ManaCost value={card.manaCost} />
                              </>
                            ) : (
                              ""
                            )}{" "}
                            - {card.type}
                          </span>
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() => handleAddCard(card.id)}
                          disabled={addingCardId === card.id}
                          className="px-4 py-1 text-xs"
                        >
                          {addingCardId === card.id ? "Adding..." : "Add"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </CollapsibleCard>
        </>
      )}
    </main>
  );
}
