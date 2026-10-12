import { letterGrade } from "@/lib/grade-letter";

export interface VersionGrade {
  score: number;
  goal: string;
  breakdown: { category: string; score: number; note: string }[];
  summary: string;
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

export default function GradePanel({
  grade,
  baseline = null,
}: {
  grade: VersionGrade;
  baseline?: VersionGrade | null;
}) {
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
