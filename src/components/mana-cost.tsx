export const WUBRG_ORDER = ["W", "U", "B", "R", "G"];

export const PIP_COLORS: Record<string, string> = {
  W: "var(--mana-white)",
  U: "var(--mana-blue)",
  B: "var(--mana-black)",
  R: "var(--mana-red)",
  G: "var(--mana-green)",
};

export function pipColor(symbol: string): { background: string; foreground: string } {
  const colorLetter = Object.keys(PIP_COLORS).find((letter) => symbol.includes(letter));

  if (!colorLetter) {
    return { background: "var(--muted)", foreground: "var(--surface)" };
  }

  // White mana's pip color is light enough that white text on it fails
  // contrast - every other pip color is dark enough for white text.
  return {
    background: PIP_COLORS[colorLetter],
    foreground: colorLetter === "W" ? "#3a2f14" : "#ffffff",
  };
}

/** Renders a raw cost string like "{2}{W}{U}" as small colored mana pips instead of literal curly-brace text. */
export default function ManaCost({ value }: { value: string }) {
  const symbols = value.match(/\{[^}]+\}/g)?.map((token) => token.slice(1, -1));

  if (!symbols || symbols.length === 0) {
    return <span>{value}</span>;
  }

  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {symbols.map((symbol, index) => {
        const { background, foreground } = pipColor(symbol);
        return (
          <span
            key={index}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold"
            style={{ backgroundColor: background, color: foreground }}
          >
            {symbol}
          </span>
        );
      })}
    </span>
  );
}
