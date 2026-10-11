import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/scryfall", () => ({
  lookupCardByName: vi.fn(),
  autocompleteCardNames: vi.fn(),
}));

import { auth } from "@/auth";
import { autocompleteCardNames, lookupCardByName } from "@/lib/scryfall";
import { GET } from "@/app/api/cards/lookup/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const lookupMock = lookupCardByName as unknown as ReturnType<typeof vi.fn>;
const autocompleteMock = autocompleteCardNames as unknown as ReturnType<typeof vi.fn>;

const get = (query: string) => GET(new Request(`http://localhost/api/cards/lookup?${query}`));

describe("GET /api/cards/lookup", () => {
  beforeEach(() => {
    authMock.mockReset();
    lookupMock.mockReset();
    autocompleteMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    expect((await get("name=sol")).status).toBe(401);
  });

  it("returns 400 without a name", async () => {
    expect((await get("name=")).status).toBe(400);
  });

  it("returns the looked-up card", async () => {
    lookupMock.mockResolvedValue({ name: "Sol Ring", priceUsd: 1.5 });
    const response = await get("name=sol%20rng");
    expect(lookupMock).toHaveBeenCalledWith("sol rng");
    expect(await response.json()).toEqual({ name: "Sol Ring", priceUsd: 1.5 });
  });

  it("returns 404 when nothing matches", async () => {
    lookupMock.mockResolvedValue(null);
    expect((await get("name=zzz")).status).toBe(404);
  });

  it("returns autocomplete names", async () => {
    autocompleteMock.mockResolvedValue(["Sol Ring"]);
    const response = await get("name=sol&autocomplete=1");
    expect(await response.json()).toEqual({ names: ["Sol Ring"] });
  });

  it("returns 502 when Scryfall is unreachable", async () => {
    lookupMock.mockRejectedValue(new Error("403"));
    expect((await get("name=sol")).status).toBe(502);
  });
});
