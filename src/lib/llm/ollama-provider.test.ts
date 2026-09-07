import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "@/lib/llm/ollama-provider";

const fetchMock = vi.fn();

describe("OllamaProvider", () => {
  const originalBaseUrl = process.env.OLLAMA_BASE_URL;
  const originalModel = process.env.OLLAMA_MODEL;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.OLLAMA_MODEL = "llama3";
    delete process.env.OLLAMA_BASE_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.OLLAMA_BASE_URL = originalBaseUrl;
    process.env.OLLAMA_MODEL = originalModel;
  });

  it("POSTs to /api/generate on the default base URL with the model and prompt", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ response: "Krenko, Mob Boss" }),
    });

    const provider = new OllamaProvider();
    const result = await provider.complete("Suggest a commander for a goblins deck");

    expect(result).toBe("Krenko, Mob Boss");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/generate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "llama3",
          prompt: "Suggest a commander for a goblins deck",
          stream: false,
        }),
      }),
    );
  });

  it("uses OLLAMA_BASE_URL when set", async () => {
    process.env.OLLAMA_BASE_URL = "http://ollama-host:9999";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ response: "ok" }) });

    const provider = new OllamaProvider();
    await provider.complete("hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://ollama-host:9999/api/generate",
      expect.anything(),
    );
  });

  it("throws with the status and body when the response is not ok", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal server error",
    });

    const provider = new OllamaProvider();

    await expect(provider.complete("hello")).rejects.toThrow(
      /500[\s\S]*internal server error/,
    );
  });

  it("throws when OLLAMA_MODEL is not set", () => {
    delete process.env.OLLAMA_MODEL;

    expect(() => new OllamaProvider()).toThrow(/OLLAMA_MODEL/);
  });
});
