import { GoogleGenAI } from "@google/genai";
import { AI_TIMEOUT_MS } from "./ai";
import { AiServiceError, type AiGenerator } from "./ai-service";

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { status?: unknown; code?: unknown; message?: unknown };
  if (record.status === 429 || record.code === 429) return true;
  const message =
    typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("rate limit")
  );
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: unknown; message?: unknown };
  const message =
    typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    record.name === "AbortError" ||
    record.name === "TimeoutError" ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}

/**
 * Single Gemini entry point for both import interpretation and category
 * suggestions. The API key is only ever read from the server environment.
 */
export function createGeminiGenerator(apiKey: string): AiGenerator {
  const ai = new GoogleGenAI({ apiKey });

  return async ({ model, systemInstruction, prompt, schema }) => {
    try {
      const interaction = await ai.interactions.create(
        {
          model,
          input: prompt,
          system_instruction: systemInstruction,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema,
          },
          generation_config: {
            temperature: 0.1,
            max_output_tokens: 4096,
            thinking_level: "low",
          },
          store: false,
        },
        {
          timeout_ms: AI_TIMEOUT_MS,
          retries: { strategy: "none" },
        },
      );

      if (!interaction.output_text) {
        throw new AiServiceError(
          "invalid_response",
          "La risposta AI non è valida.",
        );
      }
      return interaction.output_text;
    } catch (caught) {
      if (caught instanceof AiServiceError) throw caught;
      if (isRateLimitError(caught)) {
        throw new AiServiceError(
          "rate_limited",
          "La quota AI è momentaneamente esaurita.",
        );
      }
      if (isTimeoutError(caught)) {
        throw new AiServiceError("timeout", "La AI non ha risposto in tempo.");
      }
      throw new AiServiceError(
        "generation_failed",
        "Il servizio AI non è disponibile.",
      );
    }
  };
}
