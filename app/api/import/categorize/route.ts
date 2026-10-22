import { GoogleGenAI } from "@google/genai";
import {
  AI_MAX_MOVEMENTS,
  AI_TIMEOUT_MS,
  AiInputError,
  parseAiMovementsInput,
  type AiCategories,
  type AiMovementInput,
} from "@/lib/import/ai";
import {
  AiServiceError,
  categorizeMovementsWithAi,
} from "@/lib/import/ai-service";
import { consumeAiRateLimit } from "@/lib/import/ai-rate-limit";
import {
  categoriesForType,
  createCategoryCatalog,
} from "@/lib/categories";
import { normalizeBalanceData } from "@/lib/storage";
import {
  createUserSupabaseClient,
  extractBearerToken,
} from "@/lib/supabase/server";

const MAX_BODY_BYTES = 32_000;

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function errorResponse(
  status: number,
  error: string,
  code: string,
  headers?: HeadersInit,
): Response {
  return json({ error, code }, status, headers);
}

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

async function loadAiCategories(
  supabase: NonNullable<ReturnType<typeof createUserSupabaseClient>>,
  userId: string,
): Promise<AiCategories> {
  const { data, error } = await supabase
    .from("balance_data")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Cloud data unavailable.");
  }

  const row = data as { data?: unknown } | null;
  const normalized = normalizeBalanceData(row?.data);
  const catalog = createCategoryCatalog(normalized.data);

  return {
    income: categoriesForType("income", catalog).map((category) => ({
      id: category.id,
      label: category.label,
    })),
    expense: categoriesForType("expense", catalog).map((category) => ({
      id: category.id,
      label: category.label,
    })),
  };
}

export async function POST(request: Request): Promise<Response> {
  const accessToken = extractBearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    return errorResponse(401, "Autenticazione richiesta.", "unauthorized");
  }

  const supabase = createUserSupabaseClient(accessToken);
  if (!supabase) {
    return errorResponse(
      503,
      "Supabase non è configurato sul server.",
      "supabase_not_configured",
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return errorResponse(401, "Sessione non valida.", "unauthorized");
  }

  const rateLimit = consumeAiRateLimit(user.id);
  if (!rateLimit.allowed) {
    return errorResponse(
      429,
      "Troppe richieste AI. Riprova più tardi.",
      "rate_limited",
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse(413, "Richiesta troppo grande.", "payload_too_large");
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(400, "Richiesta non valida.", "invalid_request");
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return errorResponse(413, "Richiesta troppo grande.", "payload_too_large");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "Richiesta non valida.", "invalid_request");
  }

  let movements: AiMovementInput[];
  try {
    movements = parseAiMovementsInput(body);
  } catch (caught) {
    if (caught instanceof AiInputError) {
      return errorResponse(
        caught.code === "too_many_movements" ? 413 : 400,
        caught.message,
        caught.code,
      );
    }
    return errorResponse(400, "Richiesta non valida.", "invalid_request");
  }

  let categories: AiCategories;
  try {
    categories = await loadAiCategories(supabase, user.id);
  } catch {
    return errorResponse(
      503,
      "Non riesco a leggere le categorie del tuo account. Riprova.",
      "categories_unavailable",
    );
  }

  if (
    movements.some(
      (movement) => categories[movement.direction].length === 0,
    )
  ) {
    return json({
      suggestions: [],
      analyzed: 0,
      model: null,
      message: "Nessuna categoria disponibile per questi movimenti.",
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse(
      503,
      "La categorizzazione AI non è configurata. Puoi importare normalmente.",
      "ai_not_configured",
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await categorizeMovementsWithAi({
      movements,
      categories,
      generate: async ({ model, systemInstruction, prompt, schema }) => {
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
            throw new AiServiceError(
              "timeout",
              "La AI non ha risposto in tempo.",
            );
          }
          throw new AiServiceError(
            "generation_failed",
            "Il servizio AI non è disponibile.",
          );
        }
      },
    });

    return json({
      suggestions: result.suggestions,
      analyzed: result.analyzed,
      model: result.model,
      maxMovements: AI_MAX_MOVEMENTS,
    });
  } catch (caught) {
    if (caught instanceof AiServiceError) {
      if (caught.code === "rate_limited") {
        return errorResponse(
          429,
          "La quota AI è momentaneamente esaurita. Riprova più tardi.",
          "ai_rate_limited",
        );
      }
      if (caught.code === "timeout") {
        return errorResponse(
          504,
          "La AI non ha risposto in tempo. Puoi importare normalmente.",
          "ai_timeout",
        );
      }
      if (caught.code === "invalid_response") {
        return errorResponse(
          502,
          "La AI ha restituito una risposta non valida. Puoi importare normalmente.",
          "ai_invalid_response",
        );
      }
      return errorResponse(
        503,
        "La categorizzazione AI non è disponibile. Puoi importare normalmente.",
        "ai_unavailable",
      );
    }

    return errorResponse(
      503,
      "La categorizzazione AI non è disponibile. Puoi importare normalmente.",
      "ai_unavailable",
    );
  }
}
