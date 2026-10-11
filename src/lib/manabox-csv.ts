import { parse } from "csv-parse/sync";

/**
 * A single normalized row from a ManaBox collection export CSV.
 *
 * `setCode` and `scryfallId` are provenance-only fields carried through to
 * `CollectionEntry` - they are not used for card matching (see the plan's
 * "Card rules data source" decision).
 */
export interface ManaBoxRow {
  name: string;
  setCode: string | null;
  scryfallId: string | null;
  quantity: number;
  foil: boolean;
  /** Present when the export has a "Set name" column; used to spot token rows. */
  setName?: string;
}

type RawRow = Record<string, string | undefined>;

const NAME_HEADER_NAMES = ["name"];
const SET_CODE_HEADER_NAMES = ["set code"];
const SET_NAME_HEADER_NAMES = ["set name"];
const SCRYFALL_ID_HEADER_NAMES = ["scryfall id"];
const QUANTITY_HEADER_NAMES = ["quantity"];
const FOIL_HEADER_NAMES = ["foil"];

/**
 * Validates and normalizes the CSV header row. Runs even for a header-only
 * file with zero data rows, so a missing `Name` column is caught upfront
 * rather than only surfacing once we try to read the first row.
 */
function normalizeHeader(header: string[]): string[] {
  const trimmed = header.map((column) => column.trim());
  const hasNameColumn = trimmed.some((column) =>
    NAME_HEADER_NAMES.includes(column.toLowerCase()),
  );

  if (!hasNameColumn) {
    throw new Error(
      'ManaBox CSV is missing a required "Name" column - cannot match rows to cards',
    );
  }

  return trimmed;
}

/** Case-insensitive lookup of a column value by one or more candidate header names. */
function findValue(row: RawRow, candidateNames: string[]): string | undefined {
  for (const key of Object.keys(row)) {
    if (candidateNames.includes(key.toLowerCase())) {
      const value = row[key];
      return value === undefined ? undefined : value.trim();
    }
  }

  return undefined;
}

function parseQuantity(rawQuantity: string | undefined): number {
  if (rawQuantity === undefined || rawQuantity === "") {
    return 1;
  }

  const parsed = Number(rawQuantity);

  // Malformed quantity (non-numeric, non-integer, zero, or negative) defaults
  // to 1 rather than throwing - a single bad row shouldn't kill the whole
  // import. This is a deliberate leniency choice, not a bug.
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

// Real ManaBox exports encode `Foil` as "normal" / "foil" (and "etched" for
// etched foils), so a case-insensitive substring match on "foil" plus an
// explicit "etched" check covers them. A "true"/"false"-style export would be
// read as non-foil.
function parseFoil(rawFoil: string | undefined): boolean {
  if (rawFoil === undefined) {
    return false;
  }

  const normalized = rawFoil.toLowerCase();
  return normalized.includes("foil") || normalized.includes("etched");
}

const EXPORT_HEADER = ["Name", "Set code", "Scryfall ID", "Quantity", "Foil"];

function escapeCsvField(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }

  return field;
}

/**
 * Serializes rows back into a ManaBox-compatible CSV (the inverse of
 * `parseManaBoxCsv`). The `Foil` column is written as "foil"/"normal" so a
 * round trip through `parseManaBoxCsv` (which matches on a "foil" substring)
 * reads it back correctly.
 */
export function formatManaBoxCsv(rows: ManaBoxRow[]): string {
  const lines = [
    EXPORT_HEADER,
    ...rows.map((row) => [
      row.name,
      row.setCode ?? "",
      row.scryfallId ?? "",
      String(row.quantity),
      row.foil ? "foil" : "normal",
    ]),
  ];

  return lines.map((fields) => fields.map(escapeCsvField).join(",")).join("\r\n") + "\r\n";
}

export function parseManaBoxCsv(csvText: string): ManaBoxRow[] {
  const records = parse(csvText, {
    columns: normalizeHeader,
    skip_empty_lines: true,
  }) as RawRow[];

  return records.map((row) => {
    const rawName = findValue(row, NAME_HEADER_NAMES);

    if (!rawName) {
      throw new Error(`ManaBox CSV row has no card name: ${JSON.stringify(row)}`);
    }

    return {
      name: rawName,
      setCode: findValue(row, SET_CODE_HEADER_NAMES) || null,
      scryfallId: findValue(row, SCRYFALL_ID_HEADER_NAMES) || null,
      quantity: parseQuantity(findValue(row, QUANTITY_HEADER_NAMES)),
      foil: parseFoil(findValue(row, FOIL_HEADER_NAMES)),
      setName: findValue(row, SET_NAME_HEADER_NAMES) || undefined,
    };
  });
}

/**
 * Token rows (e.g. set "Edge of Eternities Tokens") describe token cards
 * that aren't in the card catalog, so they can never be matched.
 */
export function isTokenRow(row: ManaBoxRow): boolean {
  return row.setName !== undefined && /\btokens?$/i.test(row.setName);
}

/**
 * Collapses rows for the same card and finish into one, summing quantities.
 * A bulk export lists a card once per printing and binder, but a collection
 * entry is keyed on (card, foil) - without this, each row would overwrite the
 * previous one's quantity. The first row's set code and Scryfall ID are kept.
 */
export function aggregateManaBoxRows(rows: ManaBoxRow[]): ManaBoxRow[] {
  const merged = new Map<string, ManaBoxRow>();

  for (const row of rows) {
    const key = `${row.name.toLowerCase()}|${row.foil}`;
    const existing = merged.get(key);

    if (existing) {
      existing.quantity += row.quantity;
    } else {
      merged.set(key, { ...row });
    }
  }

  return [...merged.values()];
}
