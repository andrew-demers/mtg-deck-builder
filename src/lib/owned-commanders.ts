export interface OwnedCommanderCard {
  id: string;
  name: string;
  manaCost: string | null;
  type: string;
  colorIdentity: string[];
  oracleText: string | null;
}

interface OwnedEntry {
  card: OwnedCommanderCard;
}

/**
 * Collapses collection entries (one per card and finish) into one row per
 * card, sorted by name, so a commander owned in both normal and foil is only
 * listed once.
 */
export function uniqueOwnedCommanders(entries: OwnedEntry[]): OwnedCommanderCard[] {
  const byId = new Map<string, OwnedCommanderCard>();

  for (const { card } of entries) {
    if (!byId.has(card.id)) {
      byId.set(card.id, card);
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Case-insensitive name filter; an empty query returns everything. */
export function filterCommandersByName(
  commanders: OwnedCommanderCard[],
  query: string,
): OwnedCommanderCard[] {
  const normalized = query.trim().toLowerCase();

  if (normalized === "") {
    return commanders;
  }

  return commanders.filter((card) => card.name.toLowerCase().includes(normalized));
}
