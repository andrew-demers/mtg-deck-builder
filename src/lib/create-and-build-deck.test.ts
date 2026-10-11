import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createAndBuildDeck } from "@/lib/create-and-build-deck";

const fetchMock = vi.fn();
const input = { name: "Atraxa Deck", commanderCardId: "c1", allowUnowned: true };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createAndBuildDeck", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the deck, then builds it with the allowUnowned choice", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "deck_1" })).mockResolvedValueOnce(json({}));

    const result = await createAndBuildDeck(input);

    expect(result).toEqual({ deckId: "deck_1", buildError: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: "Atraxa Deck",
      commanderCardId: "c1",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/decks/deck_1/build");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ allowUnowned: true });
  });

  it("throws the server's message when the deck cannot be created, without building", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "Commander not owned" }, 400));

    await expect(createAndBuildDeck(input)).rejects.toThrow("Commander not owned");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves with buildError (and the deck id) when only the build fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: "deck_1" }))
      .mockResolvedValueOnce(json({ error: "LLM unavailable" }, 500));

    const result = await createAndBuildDeck(input);

    expect(result).toEqual({ deckId: "deck_1", buildError: "LLM unavailable" });
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("oops", { status: 500 }))
      .mockResolvedValue(json({}));

    await expect(createAndBuildDeck(input)).rejects.toThrow("Something went wrong creating this deck.");
  });
});
