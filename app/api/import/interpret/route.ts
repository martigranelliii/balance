import {
  AI_INTERPRET_MAX_BODY_BYTES,
  AiInterpretInputError,
  AiInterpretResponseError,
  interpretStatementWithAi,
  parseAiInterpretInput,
  type AiInterpretInput,
} from "@/lib/import/ai-interpret";
import { AiServiceError } from "@/lib/import/ai-service";
import { consumeAiRateLimit } from "@/lib/import/ai-rate-limit";
import { createGeminiGenerator } from "@/lib/import/gemini";
import {
  createUserSupabaseClient,
  extractBearerToken,
} from "@/lib/supabase/server";

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
  if (Number.isFinite(contentLength) && contentLength > AI_INTERPRET_MAX_BODY_BYTES) {
    return errorResponse(413, "Richiesta troppo grande.", "payload_too_large");
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(400, "Richiesta non valida.", "invalid_request");
  }
  if (rawBody.length > AI_INTERPRET_MAX_BODY_BYTES) {
    return errorResponse(413, "Richiesta troppo grande.", "payload_too_large");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "Richiesta non valida.", "invalid_request");
  }

  let input: AiInterpretInput;
  try {
    input = parseAiInterpretInput(body);
  } catch (caught) {
    if (caught instanceof AiInterpretInputError) {
      return errorResponse(
        caught.code === "too_many_rows" ? 413 : 400,
        caught.message,
        caught.code,
      );
    }
    return errorResponse(400, "Richiesta non valida.", "invalid_request");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse(
      503,
      "L'analisi automatica non è configurata. Puoi importare normalmente.",
      "ai_not_configured",
    );
  }

  try {
    const result = await interpretStatementWithAi({
      input,
      generate: createGeminiGenerator(apiKey),
    });

    return json({
      mapping: result.mapping,
      headerRowNumber: result.headerRowNumber,
      amountMode: result.amountMode,
      dateKind: result.dateKind,
      nonMovementRows: result.nonMovementRows,
      confidence: result.confidence,
      analyzedRows: result.analyzedRows,
      model: result.model,
    });
  } catch (caught) {
    if (caught instanceof AiInterpretResponseError) {
      return errorResponse(
        502,
        "La AI ha restituito una risposta non valida. Puoi importare normalmente.",
        "ai_invalid_response",
      );
    }
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
    }

    return errorResponse(
      503,
      "L'analisi automatica non è disponibile. Puoi importare normalmente.",
      "ai_unavailable",
    );
  }
}
