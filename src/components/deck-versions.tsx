"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/button";
import Markdown from "@/components/markdown";
import GradePanel, { type VersionGrade } from "@/components/grade-panel";
import { letterGrade } from "@/lib/grade-letter";

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
  grade: VersionGrade | null;
}

interface DeckVersionsProps {
  deckId: string;
  /** What the deck is built to do; versions are graded against it. */
  goal: string | null;
  /** The deck's own grade if it is still current for the live cards and goal, else null. */
  currentGrade: VersionGrade | null;
  /** Called with the refreshed deck JSON after the goal is saved or the deck is graded. */
  onGoalSaved: (deck: unknown) => void;
  /** Called with the refreshed deck JSON after a version is restored. */
  onRestored: (deck: unknown) => void;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
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

function baselineFor(versions: DeckVersion[]): VersionGrade | null {
  const latest = versions[0].grade;
  const earlier = versions.slice(1).find((version) => version.grade !== null)?.grade ?? null;
  return latest && earlier && earlier.goal === latest.goal ? earlier : null;
}

function LatestVersion({
  version,
  baseline,
  goal,
  isGrading,
  onGrade,
}: {
  version: DeckVersion;
  baseline: VersionGrade | null;
  goal: string | null;
  isGrading: boolean;
  onGrade: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">
          Latest: version {version.number}
          <span className="ml-2 text-xs font-normal text-muted">
            {new Date(version.createdAt).toLocaleString()} - {version.cardCount} cards
          </span>
        </span>
        {goal ? (
          <Button variant="secondary" onClick={onGrade} disabled={isGrading} className="px-4 py-1 text-xs">
            {isGrading ? "Grading..." : version.grade ? "Re-grade" : "Grade"}
          </Button>
        ) : null}
      </div>
      {version.grade && version.grade.goal !== goal?.trim() ? (
        <p className="text-xs text-muted">Graded against an earlier goal: {version.grade.goal}</p>
      ) : null}
      <Markdown>{version.description}</Markdown>
      {version.grade ? <GradePanel grade={version.grade} baseline={baseline} /> : null}
      {changeSummary(version.changes) ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted">{changeSummary(version.changes)}</summary>
          <div className="mt-1">
            <ChangeList changes={version.changes} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

export default function DeckVersions({
  deckId,
  goal,
  currentGrade,
  onGoalSaved,
  onRestored,
}: DeckVersionsProps) {
  const [versions, setVersions] = useState<DeckVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState<string | null>(null);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isDraftingGoal, setIsDraftingGoal] = useState(false);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState("");
  const [isGradingDeck, setIsGradingDeck] = useState(false);

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
      const response = await fetch(`/api/decks/${deckId}/versions/draft`, {
        method: "POST",
      });
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

  async function handleDraftGoal() {
    setError(null);
    setIsDraftingGoal(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/goal/draft`, { method: "POST" });
      if (!response.ok) {
        setError(await errorMessage(response, "Something went wrong drafting a goal."));
        return;
      }
      // Only fills the box; the user reviews and saves it.
      setGoalDraft(((await response.json()) as { goal: string }).goal);
    } catch {
      setError("Something went wrong drafting a goal.");
    } finally {
      setIsDraftingGoal(false);
    }
  }

  async function handleSaveGoal() {
    if (goalDraft === null) return;
    setError(null);
    setIsSavingGoal(true);

    try {
      const response = await fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goalDraft }),
      });
      if (!response.ok) {
        setError(await errorMessage(response, "Something went wrong saving the goal."));
        return;
      }
      onGoalSaved(await response.json());
      setGoalDraft(null);
    } catch {
      setError("Something went wrong saving the goal.");
    } finally {
      setIsSavingGoal(false);
    }
  }

  async function handleGradeDeck() {
    setError(null);
    setIsGradingDeck(true);

    try {
      const response = await fetch(`/api/decks/${deckId}/grade`, { method: "POST" });
      if (!response.ok) {
        setError(await errorMessage(response, "Something went wrong grading the deck."));
        return;
      }
      onGoalSaved(await response.json());
    } catch {
      setError("Something went wrong grading the deck.");
    } finally {
      setIsGradingDeck(false);
    }
  }

  async function handleGrade(version: DeckVersion) {
    setError(null);
    setGradingId(version.id);

    try {
      const response = await fetch(`/api/decks/${deckId}/versions/${version.id}/grade`, {
        method: "POST",
      });
      if (!response.ok) {
        setError(await errorMessage(response, "Something went wrong grading this version."));
        return;
      }
      await loadVersions();
    } catch {
      setError("Something went wrong grading this version.");
    } finally {
      setGradingId(null);
    }
  }

  const restoreChoice = versions?.find((version) => version.id === restoreId) ?? null;

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
      setRestoreId("");
      await loadVersions();
    } catch {
      setError("Something went wrong restoring this version.");
    } finally {
      setRestoringId(null);
    }
  }

  const latest = versions?.[0] ?? null;

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

      <div className="flex flex-col gap-2">
        <label htmlFor="deck-goal" className="text-sm text-muted">
          Deck goal (versions are graded on how well the deck achieves this)
        </label>
        <textarea
          id="deck-goal"
          value={goalDraft ?? goal ?? ""}
          onChange={(event) => setGoalDraft(event.target.value)}
          placeholder="e.g. Win by turn 8 with infinite combos, while holding up a counterspell"
          rows={2}
          className="input text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={handleDraftGoal}
            disabled={isDraftingGoal || isSavingGoal}
            className="px-4 py-1 text-xs"
          >
            {isDraftingGoal ? "Drafting..." : goal || goalDraft ? "Redraft with AI" : "Draft with AI"}
          </Button>
          {goalDraft !== null && goalDraft.trim() !== (goal ?? "") ? (
            <Button onClick={handleSaveGoal} disabled={isSavingGoal} className="px-4 py-1 text-xs">
              {isSavingGoal ? "Saving..." : "Save goal"}
            </Button>
          ) : null}
        </div>
      </div>

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
            <Button onClick={handleSave} disabled={isSaving || !draft.trim()} className="px-5 py-2 text-sm">
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {goal || currentGrade ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">
              Current deck
              <span className="ml-2 text-xs font-normal text-muted">
                includes any changes you haven&apos;t saved yet
              </span>
            </span>
            <Button
              variant="secondary"
              onClick={handleGradeDeck}
              disabled={isGradingDeck}
              className="px-4 py-1 text-xs"
            >
              {isGradingDeck ? "Grading..." : currentGrade ? "Re-grade deck" : "Grade current deck"}
            </Button>
          </div>
          {currentGrade ? (
            <GradePanel
              grade={currentGrade}
              baseline={
                latest?.grade && latest.grade.goal === currentGrade.goal ? latest.grade : null
              }
            />
          ) : (
            <p className="text-xs text-muted">
              {latest
                ? `Grade the deck as it is now to see how your unsaved changes compare with version ${latest.number}.`
                : "Grade the deck as it is now, or get a critique to grade it along with a written review."}
            </p>
          )}
        </div>
      ) : null}

      {versions === null ? (
        <p className="text-sm text-muted">Loading versions...</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted">No versions saved yet.</p>
      ) : (
        <>
          <LatestVersion
            version={versions[0]}
            // The most recent earlier graded version is the comparison point;
            // scores only compare when both used the same goal.
            baseline={baselineFor(versions)}
            goal={goal}
            isGrading={gradingId === versions[0].id}
            onGrade={() => handleGrade(versions[0])}
          />
          <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
            <div className="flex items-center gap-2">
              <label htmlFor="restore-version" className="shrink-0 text-muted">
                Restore a saved version
              </label>
              <select
                id="restore-version"
                value={restoreId}
                onChange={(event) => setRestoreId(event.target.value)}
                className="input min-w-0 flex-1 text-sm"
              >
                <option value="">Choose a version...</option>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.number} - {new Date(version.createdAt).toLocaleDateString()} -{" "}
                    {version.description.length > 60
                      ? `${version.description.slice(0, 60)}...`
                      : version.description}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                onClick={() => restoreChoice && handleRestore(restoreChoice)}
                disabled={!restoreChoice || restoringId !== null}
                className="shrink-0 px-4 py-1 text-xs"
              >
                {restoringId !== null ? "Restoring..." : "Restore"}
              </Button>
            </div>
            {restoreChoice ? (
              <div className="flex flex-col gap-1 text-xs text-muted">
                <Markdown>{restoreChoice.description}</Markdown>
                {restoreChoice.grade ? (
                  <p>
                    Grade: {letterGrade(restoreChoice.grade.score)} ({restoreChoice.grade.score})
                  </p>
                ) : null}
                {changeSummary(restoreChoice.changes) ? (
                  <details>
                    <summary className="cursor-pointer">{changeSummary(restoreChoice.changes)}</summary>
                    <div className="mt-1">
                      <ChangeList changes={restoreChoice.changes} />
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
