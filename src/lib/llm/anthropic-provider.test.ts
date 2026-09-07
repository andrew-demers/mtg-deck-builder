import { describe, expect, it, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function AnthropicClient(this: {
    messages: { create: typeof createMock };
  }) {
    this.messages = { create: createMock };
  }),
}));

import Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "@/lib/llm/anthropic-provider";

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

  it("surfaces errors thrown by the SDK client", async () => {
    createMock.mockRejectedValue(new Error("Request failed with status 500"));

    const provider = new AnthropicProvider();

    await expect(provider.complete("hello")).rejects.toThrow(
      "Request failed with status 500",
    );
  });
});
