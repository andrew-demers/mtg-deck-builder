"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/button";
import Markdown from "@/components/markdown";

interface VersionChanges {
  added: { name: string; quantity: number }[];
  removed: { name: string; quantity: number }[];
  changed: { name: string; from: number; to: number }[];
  commander: { from: string | null; to: string | null } | null;
}

interface DeckVersion {
  id: string;
  number: number;
  description: string;
  createdAt: string;
  cardCount: number;
  changes: VersionChanges;
}

interface DeckVersionsProps {
  deckId: string;
  /** Called with the refreshed deck JSON after a version is restored. */
  onRestored: (deck: unknown) => void;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

function cardLabel(name: string, quantity: number): string {
  return quantity > 1 ? `${name} x${quantity}` : name;
}

function ChangeList({ changes }: { changes: VersionChanges }) {
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted">
      {changes.commander ? (
        <li>
          Commander: {changes.commander.from ?? "none"} to {changes.commander.to ?? "none"}
        </li>
      ) : null}
      {changes.added.map((card) => (
        <li key={`add-${card.name}`}>+ {cardLabel(card.name, card.quantity)}</li>
      ))}
      {changes.removed.map((card) => (
        <li key={`remove-${card.name}`}>- {cardLabel(card.name, card.quantity)}</li>
      ))}
      {changes.changed.map((card) => (
        <li key={`change-${card.name}`}>
          {card.name}: {card.from} to {card.to}
        </li>
      ))}
    </ul>
  );
}

function changeSummary(changes: VersionChanges): string {
  const parts: string[] = [];
  if (changes.commander) parts.push("commander changed");
  if (changes.added.length > 0) parts.push(`${changes.added.length} added`);
  if (changes.removed.length > 0) parts.push(`${changes.removed.length} removed`);
  if (changes.changed.length > 0) parts.push(`${changes.changed.length} quantity`);
  return parts.join(", ");
}

export default function DeckVersions({ deckId, onRestored }: DeckVersionsProps) {
  const [versions, setVersions] = useState<DeckVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    try {
      const response = await fetch(`/api/decks/${deckId}/versions`);
      if (!response.ok) {
        setError(await errorMessage(response, "Something went wrong loading versions."));
        return;
      }
      setVersions((await response.json()) as DeckVersion[]);
    } catch {
      setError("Something went wrong loading versions.");
    }
  }, [deckId]);

  useEffect(() => {
    // Fetch on mount; the state update happens after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadVersions();
  }, [loadVersions]);

  async function handleStartSave() {
    setError(null);
    setIsDrafting(true);
    // Open the box right away so the user can type their own note while the
    // draft loads; the draft only fills it if they haven't typed anything.
    setDraft("");

    try {
      const response = await fetch(`/api/decks/${deckId}/versions/draft`, { method: "POST" });
      if (!response.ok) {
        setError(await errorMessage(response, "Something went wrong drafting a description."));
        setDraft(null);
        return;
      }
      const data = (await response.json()) as { description: string };
      setDraft((current) => (current ? current : data.description));
    } catch {
      setError("Something went wrong drafting a description.");
      setDraft(null);
    } finally {
      setIsDrafting(false);
    }
  }

  async function handleSave() {
    if (!draft?.trim()) return;
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: draft }),
      });
      if (!response.ok) {
        setError(await errorMessage(response, "Something went wrong saving this version."));
        return;
      }
      setDraft(null);
      await loadVersions();
    } catch {
      setError("Something went wrong saving this version.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRestore(version: DeckVersion) {
    if (!window.confirm(`Restore version ${version.number}? The deck's current cards will be replaced.`)) {
      return;
    }
    setError(null);
    setRestoringId(version.id);

    try {
      const response = await fetch(`/api/decks/${deckId}/versions/${version.id}/restore`, {
        method: "POST",
      });
      if (!response.ok) {
        setError(await errorMessage(response, "Something went wrong restoring this version."));
        return;
      }
      onRestored(await response.json());
      await loadVersions();
    } catch {
      setError("Something went wrong restoring this version.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-muted">Version history</p>
        {draft === null ? (
          <Button onClick={handleStartSave} className="self-start px-5 py-2 text-sm">
            Save version
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {draft !== null ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="version-description" className="text-sm text-muted">
            What changed in this version?
          </label>
          <textarea
            id="version-description"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={isDrafting ? "Drafting a description..." : "Describe what changed"}
            rows={3}
            className="input text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDraft(null)}
              disabled={isSaving}
              className="px-5 py-2 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !draft.trim()}
              className="px-5 py-2 text-sm"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {versions === null ? (
        <p className="text-sm text-muted">Loading versions...</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted">No versions saved yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {versions.map((version) => (
            <li key={version.id} className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium">
                  Version {version.number}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {new Date(version.createdAt).toLocaleString()} - {version.cardCount} cards
                  </span>
                </span>
                <Button
                  variant="secondary"
                  onClick={() => handleRestore(version)}
                  disabled={restoringId !== null}
                  className="px-4 py-1 text-xs"
                >
                  {restoringId === version.id ? "Restoring..." : "Restore"}
                </Button>
              </div>
              <Markdown>{version.description}</Markdown>
              {changeSummary(version.changes) ? (
                <details>
                  <summary className="cursor-pointer text-xs text-muted">
                    {changeSummary(version.changes)}
                  </summary>
                  <div className="mt-1">
                    <ChangeList changes={version.changes} />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
