import type { LlmProvider } from "@/lib/llm/provider";

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
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Ollama request failed with status ${response.status}: ${body}`,
      );
    }

    const data = (await response.json()) as OllamaGenerateResponse;
    return data.response;
  }
}
