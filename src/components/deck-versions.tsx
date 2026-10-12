"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/button";
import Markdown from "@/components/markdown";
import { letterGrade } from "@/lib/deck-grade";

interface VersionChanges {
  added: { name: string; quantity: number }[];
  removed: { name: string; quantity: number }[];
  changed: { name: string; from: number; to: number }[];
  commander: { from: string | null; to: string | null } | null;
}

interface VersionGrade {
  score: number;
  goal: string;
  breakdown: { category: string; score: number; note: string }[];
  summary: string;
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
  /** Called with the refreshed deck JSON after the goal is saved. */
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

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function deltaClass(delta: number): string {
  return delta > 0 ? "text-mana-green" : delta < 0 ? "text-danger" : "text-muted";
}

/** Strong scores read green, middling gold, weak red, matching the stats bars' palette. */
function scoreColor(score: number): string {
  return score >= 80 ? "var(--mana-green)" : score >= 60 ? "var(--mana-white)" : "var(--danger)";
}

function GradePanel({ grade, baseline }: { grade: VersionGrade; baseline: VersionGrade | null }) {
  const overallDelta = baseline ? grade.score - baseline.score : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-background p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 sm:w-28">
          <span
            className="font-display text-5xl font-bold leading-none"
            style={{ color: scoreColor(grade.score) }}
          >
            {letterGrade(grade.score)}
          </span>
          <span className="text-sm text-muted">{grade.score} / 100</span>
          {overallDelta !== null ? (
            <span className={`text-xs font-semibold ${deltaClass(overallDelta)}`}>
              {overallDelta === 0 ? "no change" : `${formatDelta(overallDelta)} vs previous`}
            </span>
          ) : null}
        </div>
        <ul className="flex flex-1 flex-col gap-1.5">
          {grade.breakdown.map((entry) => {
            const before = baseline?.breakdown.find((item) => item.category === entry.category);
            const delta = before ? entry.score - before.score : null;
            return (
              <li key={entry.category} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate">{entry.category}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${entry.score}%`, backgroundColor: scoreColor(entry.score) }}
                  />
                </span>
                <span className="w-7 shrink-0 text-right">{entry.score}</span>
                <span className={`w-8 shrink-0 text-right ${delta ? deltaClass(delta) : "text-muted"}`}>
                  {delta ? formatDelta(delta) : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {grade.summary ? <p className="border-t border-border pt-3 text-sm">{grade.summary}</p> : null}
      <details>
        <summary className="cursor-pointer text-xs text-muted">Why these scores</summary>
        <dl className="mt-2 flex flex-col gap-2 text-xs">
          {grade.breakdown.map((entry) => (
            <div key={entry.category}>
              <dt className="font-medium">{entry.category}</dt>
              <dd className="text-muted">{entry.note}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
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

export default function DeckVersions({ deckId, goal, onGoalSaved, onRestored }: DeckVersionsProps) {
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

      {versions === null ? (
        <p className="text-sm text-muted">Loading versions...</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted">No versions saved yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {versions.map((version, index) => {
            // The next graded version down the list is the one before it in
            // time; scores only compare when both used the same goal.
            const earlier = versions.slice(index + 1).find((item) => item.grade !== null)?.grade ?? null;
            const baseline = earlier && version.grade && earlier.goal === version.grade.goal ? earlier : null;
            return (
              <li key={version.id} className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">
                    Version {version.number}
                    <span className="ml-2 text-xs font-normal text-muted">
                      {new Date(version.createdAt).toLocaleString()} - {version.cardCount} cards
                    </span>
                  </span>
                  <div className="flex items-center gap-3">
                    {goal ? (
                      <Button
                        variant="secondary"
                        onClick={() => handleGrade(version)}
                        disabled={gradingId !== null}
                        className="px-4 py-1 text-xs"
                      >
                        {gradingId === version.id ? "Grading..." : version.grade ? "Re-grade" : "Grade"}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={() => handleRestore(version)}
                      disabled={restoringId !== null}
                      className="px-4 py-1 text-xs"
                    >
                      {restoringId === version.id ? "Restoring..." : "Restore"}
                    </Button>
                  </div>
                </div>
                {version.grade && version.grade.goal !== goal?.trim() ? (
                  <p className="text-xs text-muted">Graded against an earlier goal: {version.grade.goal}</p>
                ) : null}
                <Markdown>{version.description}</Markdown>
                {version.grade ? <GradePanel grade={version.grade} baseline={baseline} /> : null}
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
