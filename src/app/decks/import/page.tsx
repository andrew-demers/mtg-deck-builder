"use client";

import { useState, type FormEvent } from "react";
import Button, { LinkButton } from "@/components/button";

interface ImportedDeckCard {
  isCommander: boolean;
  quantity: number;
  card: { name: string };
}

interface ImportedDeck {
  id: string;
  cards: ImportedDeckCard[];
  unmatchedNames: string[];
}

export default function ImportDeckPage() {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportedDeck | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file");

    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.[0]) {
      setError("Choose a ManaBox .txt decklist to import");
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.set("file", fileInput.files[0]);

    try {
      const response = await fetch("/api/decks/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong importing this decklist.");
        return;
      }

      const data = (await response.json()) as ImportedDeck;
      setResult(data);
      form.reset();
    } catch {
      setError("Something went wrong importing this decklist.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const commanderNames = result?.cards.filter((c) => c.isCommander).map((c) => c.card.name) ?? [];
  const totalCards = result?.cards.reduce((sum, c) => sum + c.quantity, 0) ?? 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Import decklist</h1>
      <p className="text-sm text-muted">
        Import a deck exported from ManaBox as a .txt decklist, including a Partner/Background pair.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">ManaBox decklist export</span>
          <input
            name="file"
            type="file"
            accept=".txt"
            required
            className="rounded border px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={isSubmitting} className="px-4 py-2">
          {isSubmitting ? "Importing..." : "Import"}
        </Button>
      </form>
      {result ? (
        <div className="flex flex-col gap-2 rounded border p-4">
          <p className="text-sm font-medium">
            Commander{commanderNames.length > 1 ? "s" : ""}: {commanderNames.join(" + ")}
          </p>
          <p className="text-sm text-muted">{totalCards} cards imported</p>
          {result.unmatchedNames.length > 0 ? (
            <p className="text-sm text-danger">
              Not found in the catalog: {result.unmatchedNames.join(", ")}
            </p>
          ) : null}
          <LinkButton href={`/decks/${result.id}`} className="self-start px-4 py-2 text-sm">
            View deck
          </LinkButton>
        </div>
      ) : null}
    </main>
  );
}
