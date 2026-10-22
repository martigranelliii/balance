import {
  AI_MAX_MOVEMENTS,
  AI_MODEL,
  AI_SYSTEM_INSTRUCTION,
  buildAiPrompt,
  buildAiResponseSchema,
  parseAiSuggestions,
  sanitizeAiDescription,
  type AiCategories,
  type AiMovementInput,
  type AiSuggestion,
} from "./ai";

export type AiServiceErrorCode =
  | "invalid_response"
  | "generation_failed"
  | "rate_limited"
  | "timeout";

export class AiServiceError extends Error {
  constructor(
    public readonly code: AiServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

export interface AiGenerationRequest {
  model: string;
  systemInstruction: string;
  prompt: string;
  schema: Record<string, unknown>;
}

export type AiGenerator = (request: AiGenerationRequest) => Promise<string>;

export interface AiCategorizeOptions {
  movements: AiMovementInput[];
  categories: AiCategories;
  generate: AiGenerator;
}

export interface AiCategorizeResult {
  suggestions: AiSuggestion[];
  analyzed: number;
  model: string;
}

/**
 * The only place that turns rows into an AI request. Every description is
 * sanitized here, after validation and before the generator is called.
 */
export async function categorizeMovementsWithAi({
  movements,
  categories,
  generate,
}: AiCategorizeOptions): Promise<AiCategorizeResult> {
  if (movements.length === 0 || movements.length > AI_MAX_MOVEMENTS) {
    throw new AiServiceError(
      "invalid_response",
      `Numero di movimenti non valido: massimo ${AI_MAX_MOVEMENTS}.`,
    );
  }

  const sanitized = movements.map((movement) => ({
    ref: movement.ref,
    direction: movement.direction,
    description: sanitizeAiDescription(movement.description),
  }));

  let raw: string;
  try {
    raw = await generate({
      model: AI_MODEL,
      systemInstruction: AI_SYSTEM_INSTRUCTION,
      prompt: buildAiPrompt(categories, sanitized),
      schema: buildAiResponseSchema(categories),
    });
  } catch (caught) {
    if (caught instanceof AiServiceError) throw caught;
    throw new AiServiceError(
      "generation_failed",
      "Il servizio AI non è disponibile.",
    );
  }

  try {
    return {
      suggestions: parseAiSuggestions(raw, categories, sanitized),
      analyzed: sanitized.length,
      model: AI_MODEL,
    };
  } catch (caught) {
    if (caught instanceof AiServiceError) throw caught;
    throw new AiServiceError(
      "invalid_response",
      "La risposta AI non è valida.",
    );
  }
}
