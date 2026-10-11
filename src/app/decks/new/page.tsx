"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "@/components/button";
import ManaCost from "@/components/mana-cost";
import CardName from "@/components/card-name";
import ColorIdentityPips from "@/components/color-identity";
import { createAndBuildDeck } from "@/lib/create-and-build-deck";
import {
  filterCommandersByName,
  uniqueOwnedCommanders,
  type OwnedCommanderCard,
} from "@/lib/owned-commanders";

interface SuggestedCommander {
  id: string;
  name: string;
  type: string;
  manaCost: string | null;
  oracleText: string | null;
}

export default function NewDeckPage() {
  const router = useRouter();
  const [commanders, setCommanders] = useState<OwnedCommanderCard[] | null>(null);
  const [query, setQuery] = useState("");
  const [otherDeckCardIds, setOtherDeckCardIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [deckName, setDeckName] = useState("");
  const [allowUnowned, setAllowUnowned] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCommanders() {
      try {
        const response = await fetch("/api/collection?commanderEligible=true", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setError("Could not load your commanders. Please try again.");
          return;
        }

        const entries = (await response.json()) as { card: OwnedCommanderCard }[];
        setCommanders(uniqueOwnedCommanders(entries));
      } catch {
        if (!controller.signal.aborted) {
          setError("Could not load your commanders. Please try again.");
        }
      }
    }

    // Best-effort: the "In another deck" tag is a nicety, so a failure here
    // shouldn't block picking a commander.
    async function loadCardIdsInUse() {
      try {
        const response = await fetch("/api/decks/card-ids-in-use", { signal: controller.signal });

        if (response.ok) {
          setOtherDeckCardIds(new Set((await response.json()) as string[]));
        }
      } catch {
        // ignored - see above
      }
    }

    void loadCommanders();
    void loadCardIdsInUse();

    return () => controller.abort();
  }, []);

  function chooseCommander(card: { id: string; name: string }) {
    setError(null);
    setSelected({ id: card.id, name: card.name });
    setDeckName(`${card.name} Commander Deck`);
  }

  async function requestSuggestion() {
    setError(null);
    setIsSuggesting(true);

    try {
      const response = await fetch("/api/decks/suggest-commander", { method: "POST" });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }

      chooseCommander((await response.json()) as SuggestedCommander);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSuggesting(false);
    }
  }

  async function createDeck() {
    if (!selected) {
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const result = await createAndBuildDeck({
        name: deckName.trim() || `${selected.name} Commander Deck`,
        commanderCardId: selected.id,
        allowUnowned,
      });
      router.push(`/decks/${result.deckId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong creating this deck.");
      setIsCreating(false);
    }
  }

  const visibleCommanders = filterCommandersByName(commanders ?? [], query);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-3xl tracking-wide">New deck</h1>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {selected ? (
        <div className="card flex flex-col gap-3">
          <p className="text-sm font-medium text-muted">Commander</p>
          <p className="text-lg font-medium">{selected.name}</p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Deck name</span>
            <input
              type="text"
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
              className="input"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowUnowned}
              onChange={(event) => setAllowUnowned(event.target.checked)}
            />
            Allow suggestions for cards I don&apos;t own yet (flagged as &quot;Not owned&quot;)
          </label>
          <div className="flex gap-3">
            <Button onClick={createDeck} disabled={isCreating} className="self-start px-5 py-2 text-sm">
              {isCreating ? "Building deck..." : "Create and build deck"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSelected(null)}
              disabled={isCreating}
              className="self-start px-4 py-1 text-xs"
            >
              Back
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            Pick a commander from your collection and the rest of the deck will be built around it.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your commanders"
              aria-label="Search your commanders"
              className="input min-w-0 flex-1 text-sm"
            />
            <Button
              variant="secondary"
              onClick={requestSuggestion}
              disabled={isSuggesting || commanders?.length === 0}
              className="px-4 py-2 text-xs"
            >
              {isSuggesting ? "Suggesting..." : "Suggest one for me"}
            </Button>
          </div>

          {commanders === null && !error ? <p className="text-sm text-muted">Loading...</p> : null}

          {commanders?.length === 0 ? (
            <p className="text-sm text-muted">
              You don&apos;t own any commander-eligible cards yet.{" "}
              <Link href="/import" className="text-primary underline">
                Import your collection
              </Link>{" "}
              to get started.
            </p>
          ) : null}

          {commanders && commanders.length > 0 ? (
            <>
              <p className="text-sm text-muted">
                {visibleCommanders.length === commanders.length
                  ? `${commanders.length} commanders you own`
                  : `${visibleCommanders.length} of ${commanders.length} commanders`}
              </p>
              {visibleCommanders.length === 0 ? (
                <p className="text-sm text-muted">No commanders match &quot;{query.trim()}&quot;.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {visibleCommanders.map((card) => (
                    <li key={card.id} className="card flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <span className="mr-2 inline-block">
                            <ColorIdentityPips colors={card.colorIdentity} />
                          </span>
                          <CardName name={card.name} oracleText={card.oracleText} />
                          {otherDeckCardIds.has(card.id) ? (
                            <span className="tag-badge ml-2">In another deck</span>
                          ) : null}
                        </p>
                        <p className="text-sm text-muted">
                          {card.manaCost ? (
                            <>
                              <ManaCost value={card.manaCost} /> -{" "}
                            </>
                          ) : (
                            ""
                          )}
                          {card.type}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => chooseCommander(card)}
                        className="shrink-0 px-4 py-1 text-xs"
                      >
                        Choose
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
