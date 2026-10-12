import { NextResponse } from "next/server";
import { LlmProviderError } from "@/lib/llm/provider";

/**
 * For a route's catch block: turns an LLM provider failure into a 502 with a
 * readable message, and rethrows anything else.
 */
export function llmErrorResponse(error: unknown): Response {
  if (error instanceof LlmProviderError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  throw error;
}
