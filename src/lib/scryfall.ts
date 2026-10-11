/**
 * Minimal Scryfall API client. Scryfall requires a descriptive `User-Agent`
 * and an `Accept` header on every request, and asks clients to stay under
 * ~10 requests/second, so calls are spaced at least `MIN_REQUEST_INTERVAL_MS`
 * apart.
 *
 * Only used for live data (prices, images, ad-hoc lookups). Rules data still
 * comes from MTGJSON - see `mtgjson.ts`.
 */

const SCRYFALL_BASE_URL = "https://api.scryfall.com";
const COLLECTION_BATCH_SIZE = 75;
const MIN_REQUEST_INTERVAL_MS = 100;

const HEADERS = {
  "User-Agent": "mtg-deck-builder/0.1",
  Accept: "application/json",
};

export interface ScryfallCardData {
  name: string;
  scryfallId: string;
  oracleId: string | null;
  manaCost: string | null;
  typeLine: string;
  oracleText: string | null;
  imageUrl: string | null;
  priceUsd: number | null;
  priceUsdFoil: number | null;
  scryfallUri: string;
}

interface RawScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  scryfall_uri?: string;
  image_uris?: { normal?: string };
  card_faces?: Array<{
    mana_cost?: string;
    oracle_text?: string;
    image_uris?: { normal?: string };
  }>;
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
}

let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  lastRequestAt = Math.max(Date.now(), lastRequestAt + MIN_REQUEST_INTERVAL_MS);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

async function scryfallFetch(path: string, init?: RequestInit): Promise<Response> {
  await throttle();
  return fetch(`${SCRYFALL_BASE_URL}${path}`, {
    ...init,
    headers: { ...HEADERS, ...init?.headers },
  });
}

function parsePrice(value: string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseScryfallCard(raw: RawScryfallCard): ScryfallCardData {
  const frontFace = raw.card_faces?.[0];

  return {
    name: raw.name,
    scryfallId: raw.id,
    oracleId: raw.oracle_id ?? null,
    manaCost: raw.mana_cost || frontFace?.mana_cost || null,
    typeLine: raw.type_line ?? "",
    oracleText:
      raw.oracle_text ??
      (raw.card_faces?.map((face) => face.oracle_text).filter(Boolean).join("\n//\n") || null),
    imageUrl: raw.image_uris?.normal ?? frontFace?.image_uris?.normal ?? null,
    // Etched-only printings have no regular usd price; fall back so they aren't blank.
    priceUsd: parsePrice(raw.prices?.usd) ?? parsePrice(raw.prices?.usd_etched),
    priceUsdFoil: parsePrice(raw.prices?.usd_foil),
    scryfallUri: raw.scryfall_uri ?? "",
  };
}

/**
 * Looks up a single card by name. `fuzzy` tolerates typos and partial names;
 * `exact` requires the full name. Returns null when Scryfall has no match.
 */
export async function lookupCardByName(
  name: string,
  mode: "exact" | "fuzzy" = "fuzzy",
): Promise<ScryfallCardData | null> {
  const response = await scryfallFetch(`/cards/named?${mode}=${encodeURIComponent(name)}`);

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Scryfall lookup failed: ${response.status} ${response.statusText}`);
  }

  return parseScryfallCard((await response.json()) as RawScryfallCard);
}

/** Card-name autocomplete suggestions (up to 20 names). */
export async function autocompleteCardNames(query: string): Promise<string[]> {
  const response = await scryfallFetch(`/cards/autocomplete?q=${encodeURIComponent(query)}`);

  if (!response.ok) {
    throw new Error(`Scryfall autocomplete failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { data?: string[] };
  return body.data ?? [];
}

/**
 * Fetches many cards by exact name using Scryfall's `/cards/collection`
 * endpoint (75 identifiers per request). Names Scryfall doesn't recognise are
 * simply absent from the result. Keyed by the requested name, lowercased.
 */
export async function fetchCardsByName(names: string[]): Promise<Map<string, ScryfallCardData>> {
  const results = new Map<string, ScryfallCardData>();
  const uniqueNames = [...new Set(names)];

  for (let i = 0; i < uniqueNames.length; i += COLLECTION_BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + COLLECTION_BATCH_SIZE);
    const response = await scryfallFetch("/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
    });

    if (!response.ok) {
      throw new Error(`Scryfall collection fetch failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as { data?: RawScryfallCard[] };
    for (const raw of body.data ?? []) {
      const card = parseScryfallCard(raw);
      results.set(card.name.toLowerCase(), card);
      // Multi-faced cards are requested by front-face name or full "A // B" name
      // depending on the source; index by the front face too so either matches.
      const frontName = card.name.split(" // ")[0].toLowerCase();
      if (!results.has(frontName)) {
        results.set(frontName, card);
      }
    }
  }

  return results;
}

/**
 * Runs a Scryfall search (`/cards/search`, ordered by EDHREC popularity) and
 * returns the first `limit` cards of the first page, one printing per card.
 * A query with no results is an empty list, not an error.
 */
export async function searchCards(query: string, limit = 30): Promise<ScryfallCardData[]> {
  const response = await scryfallFetch(
    `/cards/search?q=${encodeURIComponent(query)}&order=edhrec&unique=cards`,
  );

  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Scryfall search failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { data?: RawScryfallCard[] };
  return (body.data ?? []).slice(0, limit).map(parseScryfallCard);
}
