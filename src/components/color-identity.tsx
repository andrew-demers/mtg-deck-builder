import { PIP_COLORS, WUBRG_ORDER } from "@/components/mana-cost";

/** Renders a deck or card's color identity as small WUBRG-ordered dots - the same brand accent as the navbar stripe, scoped to just the colors in play. Colorless identities render a single muted dot. */
export default function ColorIdentityPips({ colors }: { colors: string[] }) {
  const present = WUBRG_ORDER.filter((letter) => colors.includes(letter));

  if (present.length === 0) {
    return (
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{ backgroundColor: "var(--muted)" }}
        title="Colorless"
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {present.map((letter) => (
        <span
          key={letter}
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: PIP_COLORS[letter] }}
          title={letter}
        />
      ))}
    </span>
  );
}
