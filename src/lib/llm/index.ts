import type { LlmProvider } from "@/lib/llm/provider";
import { AnthropicProvider } from "@/lib/llm/anthropic-provider";
import { OllamaProvider } from "@/lib/llm/ollama-provider";

/**
 * Selects an `LlmProvider` implementation based on `LLM_PROVIDER`
 * (`"anthropic"` default, `"ollama"` alternative).
 */
export function getLlmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";

  switch (provider) {
    case "ollama":
      return new OllamaProvider();
    case "anthropic":
      return new AnthropicProvider();
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}
