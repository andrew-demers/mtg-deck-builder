export type DeckTextFormat = "arena" | "mtgo";

interface TextExportCard {
  cardId: string;
  quantity: number;
  card: { name: string };
}

function formatLines(cards: TextExportCard[]): string[] {
  return cards.map((deckCard) => `${deckCard.quantity} ${deckCard.card.name}`);
}

/**
 * Plain-text decklist for pasting into MTG Arena ("Commander" / "Deck"
 * sections) or MTGO (mainboard, then the commander on an `SB:` sideboard
 * line, which is where MTGO keeps it). Names only - Arena and MTGO resolve
 * printings themselves.
 */
export function formatDeckText(
  deckCards: TextExportCard[],
  commanderCardId: string | null,
  format: DeckTextFormat,
): string {
  const commander = deckCards.filter((deckCard) => deckCard.cardId === commanderCardId);
  const mainboard = deckCards.filter((deckCard) => deckCard.cardId !== commanderCardId);

  if (format === "arena") {
    const sections: string[] = [];
    if (commander.length > 0) {
      sections.push(["Commander", ...formatLines(commander)].join("\n"));
    }
    sections.push(["Deck", ...formatLines(mainboard)].join("\n"));
    return `${sections.join("\n\n")}\n`;
  }

  const lines = formatLines(mainboard);
  if (commander.length > 0) {
    lines.push("", ...formatLines(commander).map((line) => `SB: ${line}`));
  }
  return `${lines.join("\n")}\n`;
}
