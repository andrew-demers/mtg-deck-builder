/**
 * Small provider abstraction so deck-feature code (commander suggestion,
 * deck construction, critique, card suggestions) can call an LLM without
 * depending on a specific vendor. Implementations are simple text-in/
 * text-out wrappers - not chat UIs, no conversation state.
 */
export interface LlmProvider {
  complete(prompt: string): Promise<string>;
}

/**
 * A failure talking to the LLM (billing, rate limit, network, bad response),
 * carrying a message that is safe to show the user. Routes turn it into a 502
 * instead of letting it surface as an opaque 500.
 */
export class LlmProviderError extends Error {}
