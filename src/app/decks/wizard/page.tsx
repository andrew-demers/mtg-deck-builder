"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/button";
import ManaCost from "@/components/mana-cost";
import CardName from "@/components/card-name";

const WIN_CONDITIONS = [
  "Combat damage",
  "Voltron (one big evasive threat)",
  "Aristocrats (sacrifice for value/drain)",
  "Combo",
  "Poison / Infect",
  "Attrition / value grind",
  "Alternate win conditions (mill, burn, etc.)",
  "Stax / lock opponents out",
];

const PACES = [
  "Fast and aggressive",
  "Slow and controlling",
  "Political / group-oriented",
  "Solitaire / engine-focused",
];

interface CommanderCard {
  id: string;
  name: string;
  manaCost: string | null;
  type: string;
  oracleText: string | null;
}

interface CommanderSuggestion {
  card: CommanderCard;
  reason: string;
}

type Step = "preferences" | "commander" | "confirm";

export default function DeckWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("preferences");
  const [error, setError] = useState<string | null>(null);

  const [winCondition, setWinCondition] = useState(WIN_CONDITIONS[0]);
  const [pace, setPace] = useState(PACES[0]);
  const [notes, setNotes] = useState("");

  const [isLoadingCommanders, setIsLoadingCommanders] = useState(false);
  const [commanders, setCommanders] = useState<CommanderSuggestion[]>([]);
  const [selectedCommander, setSelectedCommander] = useState<CommanderCard | null>(null);

  const [deckName, setDeckName] = useState("");
  const [allowUnowned, setAllowUnowned] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  async function findCommanders() {
    setError(null);
    setIsLoadingCommanders(true);

    try {
      const response = await fetch("/api/decks/wizard/commanders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winCondition, pace, notes: notes.trim() || undefined }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong finding commanders for your playstyle.");
        return;
      }

      const data = (await response.json()) as CommanderSuggestion[];
      setCommanders(data);
      setStep("commander");
    } catch {
      setError("Something went wrong finding commanders for your playstyle.");
    } finally {
      setIsLoadingCommanders(false);
    }
  }

  function chooseCommander(card: CommanderCard) {
    setError(null);
    setSelectedCommander(card);
    setDeckName(`${card.name} Commander Deck`);
    setStep("confirm");
  }

  async function createDeck() {
    if (!selectedCommander) {
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const createResponse = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: deckName.trim() || `${selectedCommander.name} Commander Deck`,
          commanderCardId: selectedCommander.id,
        }),
      });

      if (!createResponse.ok) {
        const data = (await createResponse.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong creating this deck.");
        return;
      }

      const deck = (await createResponse.json()) as { id: string };

      const buildResponse = await fetch(`/api/decks/${deck.id}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowUnowned }),
      });

      if (!buildResponse.ok) {
        const data = (await buildResponse.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Deck was created, but something went wrong filling in the rest of the cards.");
        router.push(`/decks/${deck.id}`);
        return;
      }

      router.push(`/decks/${deck.id}`);
    } catch {
      setError("Something went wrong creating this deck.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-3xl tracking-wide">Deck wizard</h1>
      <p className="text-sm text-muted">
        Build a new deck from your collection: tell us how you like to win, pick a commander, and let the
        wizard fill in the rest.
      </p>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {step === "preferences" ? (
        <div className="card flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">How do you want to win?</legend>
            {WIN_CONDITIONS.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="winCondition"
                  value={option}
                  checked={winCondition === option}
                  onChange={() => setWinCondition(option)}
                />
                {option}
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">What pace do you enjoy?</legend>
            {PACES.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="pace"
                  value={option}
                  checked={pace === option}
                  onChange={() => setPace(option)}
                />
                {option}
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Anything else? (optional)</span>
            <input
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. no infinite combos, I like tribal synergies"
              className="input text-sm"
            />
          </label>

          <Button
            onClick={findCommanders}
            disabled={isLoadingCommanders}
            className="self-start px-7 py-3"
          >
            {isLoadingCommanders ? "Finding commanders..." : "Find commanders"}
          </Button>
        </div>
      ) : null}

      {step === "commander" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted">
            Commanders for <span className="font-semibold">{winCondition}</span> /{" "}
            <span className="font-semibold">{pace}</span>:
          </p>
          {commanders.length === 0 ? (
            <p className="text-sm text-muted">
              No owned commander-eligible cards matched these preferences. Try different ones.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {commanders.map(({ card, reason }) => (
                <li key={card.id} className="card flex flex-col gap-2">
                  <p className="font-medium">
                    <CardName name={card.name} oracleText={card.oracleText} />
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
                  </p>
                  <p className="text-sm text-muted">{reason}</p>
                  <Button
                    variant="secondary"
                    onClick={() => chooseCommander(card)}
                    className="self-start px-4 py-1 text-xs"
                  >
                    Choose this commander
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="secondary"
            onClick={() => setStep("preferences")}
            className="self-start px-4 py-1 text-xs"
          >
            Back
          </Button>
        </div>
      ) : null}

      {step === "confirm" && selectedCommander ? (
        <div className="card flex flex-col gap-3">
          <p className="font-medium">{selectedCommander.name}</p>
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
              onClick={() => setStep("commander")}
              disabled={isCreating}
              className="self-start px-4 py-1 text-xs"
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
