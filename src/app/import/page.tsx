"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/button";

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
      <h1 className="font-display text-3xl tracking-wide">Import collection</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">ManaBox CSV export</span>
          <input name="file" type="file" accept=".csv" required className="input" />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {summary ? (
          <p className="text-sm text-muted">
            Matched: {summary.matched}, Unmatched: {summary.unmatched}
          </p>
        ) : null}
        <Button type="submit" disabled={isSubmitting} className="px-7 py-3">
          {isSubmitting ? "Importing..." : "Import"}
        </Button>
      </form>
    </main>
  );
}
