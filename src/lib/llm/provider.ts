/**
 * Small provider abstraction so deck-feature code (commander suggestion,
 * deck construction, critique, card suggestions) can call an LLM without
 * depending on a specific vendor. Implementations are simple text-in/
 * text-out wrappers - not chat UIs, no conversation state.
 */
export interface LlmProvider {
  complete(prompt: string): Promise<string>;
}
