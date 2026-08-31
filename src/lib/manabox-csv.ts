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
}

type RawRow = Record<string, string | undefined>;

const NAME_HEADER_NAMES = ["name"];
const SET_CODE_HEADER_NAMES = ["set code"];
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

// ManaBox's `Foil` column encoding is not confirmed against a real export
// (see the plan's Group D self-review note). Research suggests different
// export versions use either "foil"/"normal" or "true"/"false" strings. We
// only reliably handle the former: a case-insensitive substring match on
// "foil". A "true"/"false"-style export would be silently read as non-foil
// under this heuristic, since "true" does not contain "foil" - flagged here
// rather than guessed at, since there was no real export file to confirm
// the exact encoding against.
function parseFoil(rawFoil: string | undefined): boolean {
  if (rawFoil === undefined) {
    return false;
  }

  return rawFoil.toLowerCase().includes("foil");
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
    };
  });
}
