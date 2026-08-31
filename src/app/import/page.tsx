"use client";

import { useState, type FormEvent } from "react";

interface ImportSummary {
  matched: number;
  unmatched: number;
}

export default function ImportPage() {
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSummary(null);
    setIsSubmitting(true);

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file");

    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.[0]) {
      setError("Choose a CSV file to import");
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.set("file", fileInput.files[0]);

    try {
      const response = await fetch("/api/collection/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }

      const data = (await response.json()) as ImportSummary;
      setSummary(data);
      form.reset();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Import collection</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">ManaBox CSV export</span>
          <input
            name="file"
            type="file"
            accept=".csv"
            required
            className="rounded border px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {summary ? (
          <p className="text-sm text-zinc-700">
            Matched: {summary.matched}, Unmatched: {summary.unmatched}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? "Importing..." : "Import"}
        </button>
      </form>
    </main>
  );
}
