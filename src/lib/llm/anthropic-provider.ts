import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "@/lib/llm/provider";

// Deck features only need short, single-turn completions (a commander name,
// a list of card names, a paragraph of critique) - not a chat UI, so a
// modest max_tokens and a current mid-tier model are enough.
const MODEL = "claude-opus-5";
const MAX_TOKENS = 1024;

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
      throw new Error("Anthropic response did not contain a text block");
    }

    return textBlock.text;
  }
}
