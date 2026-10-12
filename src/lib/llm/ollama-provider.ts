import { LlmProviderError, type LlmProvider } from "@/lib/llm/provider";

const DEFAULT_BASE_URL = "http://localhost:11434";

interface OllamaGenerateResponse {
  response: string;
}

/**
 * `LlmProvider` backed by a local Ollama server's `/api/generate` endpoint.
 * Reads `OLLAMA_BASE_URL` (default `http://localhost:11434`) and
 * `OLLAMA_MODEL` from the environment.
 */
export class OllamaProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;

    const model = process.env.OLLAMA_MODEL;
    if (!model) {
      throw new Error("OLLAMA_MODEL environment variable is not set");
    }
    this.model = model;
  }

  async complete(prompt: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, prompt, stream: false }),
      });
    } catch (error) {
      throw new LlmProviderError(`Could not reach Ollama: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new LlmProviderError(
        `Ollama request failed with status ${response.status}: ${body}`,
      );
    }

    const data = (await response.json()) as OllamaGenerateResponse;
    return data.response;
  }
}
