import type { ManaBoxRow } from "@/lib/manabox-csv";

interface ExportDeckCard {
  cardId: string;
  quantity: number;
  card: { name: string };
}

interface ExportCollectionEntry {
  cardId: string;
  quantity: number;
  foil: boolean;
  setCode: string | null;
  sourceScryfallId: string | null;
}

/**
 * A card can have separate foil and non-foil CollectionEntry rows, and
 * DeckCard doesn't track which owned copies went into the deck. As a
 * best-effort guess we pick whichever owned entry has the larger quantity,
 * breaking ties toward the non-foil entry.
 */
function pickCollectionEntry(entries: ExportCollectionEntry[]): ExportCollectionEntry | null {
  if (entries.length === 0) {
    return null;
  }

  return entries.reduce((best, entry) => {
    if (entry.quantity > best.quantity) {
      return entry;
    }
    if (entry.quantity === best.quantity && best.foil && !entry.foil) {
      return entry;
    }
    return best;
  });
}

export function buildDeckExportRows(
  deckCards: ExportDeckCard[],
  collectionEntries: ExportCollectionEntry[],
): ManaBoxRow[] {
  const entriesByCardId = new Map<string, ExportCollectionEntry[]>();
  for (const entry of collectionEntries) {
    const existing = entriesByCardId.get(entry.cardId) ?? [];
    existing.push(entry);
    entriesByCardId.set(entry.cardId, existing);
  }

  return deckCards.map((deckCard) => {
    const owned = pickCollectionEntry(entriesByCardId.get(deckCard.cardId) ?? []);

    return {
      name: deckCard.card.name,
      setCode: owned?.setCode ?? null,
      scryfallId: owned?.sourceScryfallId ?? null,
      quantity: deckCard.quantity,
      foil: owned?.foil ?? false,
    };
  });
}
