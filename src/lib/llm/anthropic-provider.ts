import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "@/lib/llm/provider";

// Deck features only need single-turn completions, but some (a 99-card deck
// list, up to 8 commander suggestions with reasons) can run long, so
// max_tokens has enough headroom that a real answer never gets cut off
// before a text block is produced.
const MODEL = "claude-opus-5";
const MAX_TOKENS = 4096;

/**
 * `LlmProvider` backed by the Anthropic Messages API. Reads `ANTHROPIC_API_KEY`
 * from the environment (the SDK's default resolution).
 */
export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );

    if (!textBlock) {
      const blockTypes = response.content.map((block) => block.type).join(", ") || "none";
      throw new Error(
        `Anthropic response did not contain a text block (stop_reason: ${response.stop_reason}, content block types: ${blockTypes})`,
      );
    }

    return textBlock.text;
  }
}
