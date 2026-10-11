import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    card: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/scryfall", () => ({
  fetchCardsByName: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { fetchCardsByName } from "@/lib/scryfall";
import { isPriceStale, refreshCardPrices, PRICE_STALE_AFTER_MS } from "@/lib/card-prices";

const findManyMock = prisma.card.findMany as unknown as ReturnType<typeof vi.fn>;
const updateMock = prisma.card.update as unknown as ReturnType<typeof vi.fn>;
const fetchMock = fetchCardsByName as unknown as ReturnType<typeof vi.fn>;

const scryfallCard = {
  name: "Sol Ring",
  priceUsd: 1.5,
  priceUsdFoil: 3,
  imageUrl: "https://img/sol-ring.jpg",
};

describe("isPriceStale", () => {
  it("treats never-fetched prices as stale", () => {
    expect(isPriceStale(null)).toBe(true);
  });

  it("treats prices older than the TTL as stale and fresh ones as not", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    expect(isPriceStale(new Date(now.getTime() - PRICE_STALE_AFTER_MS - 1), now)).toBe(true);
    expect(isPriceStale(new Date(now.getTime() - 1000), now)).toBe(false);
  });
});

describe("refreshCardPrices", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    updateMock.mockReset();
    fetchMock.mockReset();
    updateMock.mockResolvedValue(undefined);
  });

  it("fetches and stores prices for stale cards only", async () => {
    findManyMock.mockResolvedValue([
      { id: "c1", name: "Sol Ring", pricesUpdatedAt: null },
      { id: "c2", name: "Fresh Card", pricesUpdatedAt: new Date() },
    ]);
    fetchMock.mockResolvedValue(new Map([["sol ring", scryfallCard]]));

    const updated = await refreshCardPrices(["c1", "c2"]);

    expect(fetchMock).toHaveBeenCalledWith(["Sol Ring"]);
    expect(updated).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ priceUsd: 1.5, priceUsdFoil: 3, imageUrl: scryfallCard.imageUrl }),
    });
  });

  it("refreshes fresh cards too when forced", async () => {
    findManyMock.mockResolvedValue([{ id: "c2", name: "Sol Ring", pricesUpdatedAt: new Date() }]);
    fetchMock.mockResolvedValue(new Map([["sol ring", scryfallCard]]));

    expect(await refreshCardPrices(["c2"], { force: true })).toBe(1);
  });

  it("skips cards Scryfall does not return", async () => {
    findManyMock.mockResolvedValue([{ id: "c1", name: "Unknown", pricesUpdatedAt: null }]);
    fetchMock.mockResolvedValue(new Map());

    expect(await refreshCardPrices(["c1"])).toBe(0);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not call Scryfall when nothing is stale", async () => {
    findManyMock.mockResolvedValue([{ id: "c1", name: "Sol Ring", pricesUpdatedAt: new Date() }]);

    expect(await refreshCardPrices(["c1"])).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
