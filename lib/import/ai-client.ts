"use client";

import { getSupabaseBrowserClient } from "../supabase/client";
import {
  AI_MAX_MOVEMENTS,
  type AiDirection,
  type AiSuggestion,
} from "./ai";

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

function friendlyError(status: number, fallback: string): string {
  if (status === 401) return "La sessione è scaduta. Accedi di nuovo.";
  if (status === 429) {
    return "Troppe richieste AI in poco tempo. Riprova tra qualche minuto.";
  }
  if (status === 503) {
    return "La categorizzazione AI non è disponibile. Puoi importare normalmente.";
  }
  if (status === 504) {
    return "La AI non ha risposto in tempo. Puoi riprovare o categorizzare a mano.";
  }
  return fallback;
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
    const response = await fetch("/api/import/categorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ movements }),
      signal: controller.signal,
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
            "La categorizzazione AI non è riuscita. Puoi importare normalmente.",
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
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw new Error(
        "La AI non ha risposto in tempo. Puoi riprovare o categorizzare a mano.",
      );
    }
    throw caught;
  } finally {
    window.clearTimeout(timeout);
  }
}
