import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/llm/anthropic-provider", () => ({
  AnthropicProvider: vi.fn(),
}));

vi.mock("@/lib/llm/ollama-provider", () => ({
  OllamaProvider: vi.fn(),
}));

import { AnthropicProvider } from "@/lib/llm/anthropic-provider";
import { OllamaProvider } from "@/lib/llm/ollama-provider";
import { getLlmProvider } from "@/lib/llm/index";

describe("getLlmProvider", () => {
  const originalEnv = process.env.LLM_PROVIDER;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.LLM_PROVIDER = originalEnv;
  });

  it("returns an AnthropicProvider by default when LLM_PROVIDER is unset", () => {
    delete process.env.LLM_PROVIDER;

    const provider = getLlmProvider();

    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(OllamaProvider).not.toHaveBeenCalled();
  });

  it("returns an AnthropicProvider when LLM_PROVIDER=anthropic", () => {
    process.env.LLM_PROVIDER = "anthropic";

    const provider = getLlmProvider();

    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it("returns an OllamaProvider when LLM_PROVIDER=ollama", () => {
    process.env.LLM_PROVIDER = "ollama";

    const provider = getLlmProvider();

    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(AnthropicProvider).not.toHaveBeenCalled();
  });

  it("throws for an unrecognized LLM_PROVIDER value", () => {
    process.env.LLM_PROVIDER = "not-a-real-provider";

    expect(() => getLlmProvider()).toThrow(/Unknown LLM_PROVIDER/);
  });
});
