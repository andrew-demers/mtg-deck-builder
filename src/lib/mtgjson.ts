/**
 * Parses MTGJSON's `AtomicCards.json` export into a flat list of cards
 * suitable for syncing into the local `Card` table.
 *
 * MTGJSON's `data` object maps each unique card name to an array of "face"
 * objects. Multi-faced cards (split, MDFC, adventure, etc.) have one face
 * per side. For this slice we only need a single row per card name, so we
 * take face index 0 and ignore the rest - a deliberate scoping
 * simplification, not a bug (e.g. `Fire // Ice` only yields its "Fire"
 * face's `manaCost`, even though `colorIdentity` is already the combined
 * value MTGJSON computes across all faces).
 */

export interface ParsedCard {
  name: string;
  manaCost: string | null;
  manaValue: number;
  colors: string[];
  colorIdentity: string[];
  type: string;
  types: string[];
  supertypes: string[];
  subtypes: string[];
  oracleText: string | null;
  legalities: Record<string, string>;
  scryfallOracleId: string | null;
}

interface AtomicCardFace {
  name: string;
  manaCost?: string;
  manaValue?: number;
  convertedManaCost?: number;
  colors?: string[];
  colorIdentity?: string[];
  type: string;
  types?: string[];
  supertypes?: string[];
  subtypes?: string[];
  text?: string;
  legalities?: Record<string, string>;
  identifiers?: {
    scryfallOracleId?: string;
  };
  side?: string;
}

interface AtomicCardsJson {
  data: Record<string, AtomicCardFace[]>;
}

export function parseAtomicCards(jsonText: string): ParsedCard[] {
  const parsed = JSON.parse(jsonText) as AtomicCardsJson;

  return Object.entries(parsed.data).map(([name, faces]) => {
    const face = faces[0];

    return {
      name,
      manaCost: face.manaCost ?? null,
      manaValue: face.manaValue ?? face.convertedManaCost ?? 0,
      colors: face.colors ?? [],
      colorIdentity: face.colorIdentity ?? [],
      type: face.type,
      types: face.types ?? [],
      supertypes: face.supertypes ?? [],
      subtypes: face.subtypes ?? [],
      oracleText: face.text ?? null,
      legalities: face.legalities ?? {},
      scryfallOracleId: face.identifiers?.scryfallOracleId ?? null,
    };
  });
}
