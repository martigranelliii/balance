"use client";

import { getSupabaseBrowserClient } from "../supabase/client";
import {
  AI_MAX_MOVEMENTS,
  type AiDirection,
  type AiSuggestion,
} from "./ai";
import type {
  AiInterpretInput,
  AiInterpretation,
} from "./ai-interpret";
import type { ColumnMapping } from "./bank";

const AI_CLIENT_TIMEOUT_MS = 20_000;

export interface AiClientMovement {
  ref: string;
  description: string;
  direction: AiDirection;
}

export interface AiClientResult {
  suggestions: AiSuggestion[];
  analyzed: number;
  model: string | null;
}

export interface AiClientInterpretationResult {
  mapping: ColumnMapping | null;
  headerRowNumber: number;
  amountMode: AiInterpretation["amountMode"];
  dateKind: AiInterpretation["dateKind"];
  nonMovementRows: number[];
  confidence: number;
  analyzed: number;
  model: string | null;
}

function friendlyError(status: number, fallback: string): string {
  if (status === 401) return "La sessione è scaduta. Accedi di nuovo.";
  if (status === 429) {
    return "Troppe richieste AI in poco tempo. Riprova tra qualche minuto.";
  }
  if (status === 503) {
    return "L'analisi AI non è disponibile. Uso il riconoscimento di Balance.";
  }
  if (status === 504) {
    return "La AI non ha risposto in tempo. Uso il riconoscimento di Balance.";
  }
  return fallback;
}

async function postAuthenticated(
  path: string,
  body: unknown,
): Promise<Response> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase non è configurato.");
  }

  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error("La sessione è scaduta. Accedi di nuovo.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    AI_CLIENT_TIMEOUT_MS,
  );

  try {
    return await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw new Error(
        "La AI non ha risposto in tempo. Continuo senza AI.",
      );
    }
    throw caught;
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Sends only uncertain movement descriptions and their direction. The Gemini
 * key stays on the server: this module never reads or receives it.
 */
export async function requestAiSuggestions(
  movements: AiClientMovement[],
): Promise<AiClientResult> {
  if (movements.length === 0) {
    return { suggestions: [], analyzed: 0, model: null };
  }
  if (movements.length > AI_MAX_MOVEMENTS) {
    throw new Error(
      `Puoi analizzare al massimo ${AI_MAX_MOVEMENTS} movimenti per volta.`,
    );
  }

  const response = await postAuthenticated("/api/import/categorize", {
    movements,
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        suggestions?: unknown;
        analyzed?: unknown;
        model?: unknown;
        error?: unknown;
      }
    | null;

  if (!response.ok) {
    const serverMessage =
      typeof payload?.error === "string" ? payload.error : null;
    throw new Error(
      friendlyError(
        response.status,
        serverMessage ??
          "La categorizzazione AI non è riuscita. Continuo senza AI.",
      ),
    );
  }

  return {
    suggestions: Array.isArray(payload?.suggestions)
      ? (payload.suggestions as AiSuggestion[])
      : [],
    analyzed:
      typeof payload?.analyzed === "number" ? payload.analyzed : movements.length,
    model: typeof payload?.model === "string" ? payload.model : null,
  };
}

/**
 * Sends a bounded, sanitized sample of the statement structure. The server
 * validates the returned mapping against the deterministic parser before it
 * can be used.
 */
export async function requestAiInterpretation(
  input: AiInterpretInput,
): Promise<AiClientInterpretationResult> {
  const response = await postAuthenticated("/api/import/interpret", input);
  const payload = (await response.json().catch(() => null)) as
    | {
        mapping?: unknown;
        headerRowNumber?: unknown;
        amountMode?: unknown;
        dateKind?: unknown;
        nonMovementRows?: unknown;
        confidence?: unknown;
        analyzedRows?: unknown;
        model?: unknown;
        error?: unknown;
      }
    | null;

  if (!response.ok) {
    const serverMessage =
      typeof payload?.error === "string" ? payload.error : null;
    throw new Error(
      friendlyError(
        response.status,
        serverMessage ?? "L'analisi della struttura non è riuscita.",
      ),
    );
  }

  const mapping =
    payload?.mapping && typeof payload.mapping === "object"
      ? (payload.mapping as ColumnMapping)
      : null;

  return {
    mapping,
    headerRowNumber:
      typeof payload?.headerRowNumber === "number"
        ? payload.headerRowNumber
        : 0,
    amountMode: payload?.amountMode === "debit-credit" ? "debit-credit" : "amount",
    dateKind:
      payload?.dateKind === "operation" || payload?.dateKind === "value"
        ? payload.dateKind
        : "unknown",
    nonMovementRows: Array.isArray(payload?.nonMovementRows)
      ? payload.nonMovementRows.filter(
          (value): value is number => typeof value === "number",
        )
      : [],
    confidence:
      typeof payload?.confidence === "number" ? payload.confidence : 0,
    analyzed:
      typeof payload?.analyzedRows === "number" ? payload.analyzedRows : 0,
    model: typeof payload?.model === "string" ? payload.model : null,
  };
}
