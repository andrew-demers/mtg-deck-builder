import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  autocompleteCardNames,
  fetchCardsByName,
  lookupCardByName,
  parseScryfallCard,
} from "@/lib/scryfall";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const solRing = {
  id: "sf-1",
  oracle_id: "oracle-1",
  name: "Sol Ring",
  mana_cost: "{1}",
  type_line: "Artifact",
  oracle_text: "{T}: Add {C}{C}.",
  scryfall_uri: "https://scryfall.com/card/x",
  image_uris: { normal: "https://img/sol-ring.jpg" },
  prices: { usd: "1.50", usd_foil: "3.25", usd_etched: null },
};

describe("scryfall client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("parseScryfallCard", () => {
    it("parses prices to numbers and keeps null for missing ones", () => {
      const card = parseScryfallCard({ ...solRing, prices: { usd: "1.50", usd_foil: null } });
      expect(card.priceUsd).toBe(1.5);
      expect(card.priceUsdFoil).toBeNull();
    });

    it("falls back to the etched price when there is no regular usd price", () => {
      const card = parseScryfallCard({ ...solRing, prices: { usd: null, usd_etched: "9.00" } });
      expect(card.priceUsd).toBe(9);
    });

    it("reads image, mana cost, and text from the front face of multi-faced cards", () => {
      const card = parseScryfallCard({
        id: "sf-2",
        name: "Delver of Secrets // Insectile Aberration",
        type_line: "Creature",
        card_faces: [
          { mana_cost: "{U}", oracle_text: "Front text", image_uris: { normal: "front.jpg" } },
          { oracle_text: "Back text", image_uris: { normal: "back.jpg" } },
        ],
      });
      expect(card.imageUrl).toBe("front.jpg");
      expect(card.manaCost).toBe("{U}");
      expect(card.oracleText).toBe("Front text\n//\nBack text");
    });
  });

  describe("lookupCardByName", () => {
    it("sends the required headers and returns the parsed card", async () => {
      fetchMock.mockResolvedValue(jsonResponse(solRing));

      const card = await lookupCardByName("sol rng");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.scryfall.com/cards/named?fuzzy=sol%20rng");
      expect(init.headers["User-Agent"]).toBeTruthy();
      expect(init.headers.Accept).toBe("application/json");
      expect(card?.name).toBe("Sol Ring");
      expect(card?.priceUsd).toBe(1.5);
    });

    it("returns null on 404", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ object: "error" }, 404));
      expect(await lookupCardByName("nonsense")).toBeNull();
    });

    it("throws on other errors", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 403));
      await expect(lookupCardByName("Sol Ring")).rejects.toThrow(/403/);
    });
  });

  describe("autocompleteCardNames", () => {
    it("returns the suggested names", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: ["Sol Ring", "Sol Talisman"] }));
      expect(await autocompleteCardNames("sol")).toEqual(["Sol Ring", "Sol Talisman"]);
    });
  });

  describe("fetchCardsByName", () => {
    it("batches names in groups of 75 and de-duplicates", async () => {
      fetchMock.mockImplementation(async () => jsonResponse({ data: [] }));
      const names = Array.from({ length: 80 }, (_, i) => `Card ${i}`);

      await fetchCardsByName([...names, "Card 0"]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(firstBody.identifiers).toHaveLength(75);
      expect(secondBody.identifiers).toHaveLength(5);
    });

    it("indexes results by lowercased full name and front-face name", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ data: [{ ...solRing, name: "Fire // Ice" }] }),
      );

      const results = await fetchCardsByName(["Fire // Ice"]);

      expect(results.get("fire // ice")?.scryfallId).toBe("sf-1");
      expect(results.get("fire")?.scryfallId).toBe("sf-1");
    });

    it("throws when Scryfall responds with an error", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 403));
      await expect(fetchCardsByName(["Sol Ring"])).rejects.toThrow(/403/);
    });
  });
});
