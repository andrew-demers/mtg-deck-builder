import { describe, expect, it, vi, beforeEach } from "vitest";

const createMock = vi.fn();

const { FakeApiError } = vi.hoisted(() => ({
  FakeApiError: class FakeApiError extends Error {
    constructor(
      public status: number,
      public error: unknown,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock("@anthropic-ai/sdk", () => {
  const AnthropicClient = vi.fn().mockImplementation(function AnthropicClient(this: {
    messages: { create: typeof createMock };
  }) {
    this.messages = { create: createMock };
  });
  return { default: Object.assign(AnthropicClient, { APIError: FakeApiError }) };
});

import Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "@/lib/llm/anthropic-provider";
import { LlmProviderError } from "@/lib/llm/provider";

const AnthropicMock = Anthropic as unknown as ReturnType<typeof vi.fn>;

describe("AnthropicProvider", () => {
  beforeEach(() => {
    createMock.mockReset();
    AnthropicMock.mockClear();
    process.env.ANTHROPIC_API_KEY = "test-api-key";
  });

  it("sends the prompt as a single user message and extracts the response text", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "Krenko, Mob Boss" }],
    });

    const provider = new AnthropicProvider();
    const result = await provider.complete("Suggest a commander for a goblins deck");

    expect(result).toBe("Krenko, Mob Boss");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "Suggest a commander for a goblins deck" },
        ],
      }),
    );
  });

  it("disables extended thinking so a text block is always produced within max_tokens", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

    const provider = new AnthropicProvider();
    await provider.complete("hello");

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: { type: "disabled" } }),
    );
  });

  it("constructs the client using ANTHROPIC_API_KEY from the environment", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

    new AnthropicProvider();

    expect(AnthropicMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "test-api-key" }),
    );
  });

  it("throws when the response contains no text block", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", id: "1", name: "x", input: {} }],
    });

    const provider = new AnthropicProvider();

    await expect(provider.complete("hello")).rejects.toThrow(
      /did not contain a text block/,
    );
  });

  it("wraps non-API client failures as LlmProviderError", async () => {
    createMock.mockRejectedValue(new Error("socket hang up"));

    const provider = new AnthropicProvider();
    const result = provider.complete("hello");

    await expect(result).rejects.toBeInstanceOf(LlmProviderError);
    await expect(result).rejects.toThrow("socket hang up");
  });

  it("surfaces the API's own message, e.g. a low credit balance", async () => {
    createMock.mockRejectedValue(
      new FakeApiError(400, { error: { message: "Your credit balance is too low" } }, "400 {...}"),
    );

    const provider = new AnthropicProvider();
    const result = provider.complete("hello");

    await expect(result).rejects.toBeInstanceOf(LlmProviderError);
    await expect(result).rejects.toThrow("Anthropic API error (400): Your credit balance is too low");
  });
});
