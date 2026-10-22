"use client";

import type { BalanceData } from "./types";
import { createEmptyData, normalizeBalanceData } from "./storage";
import {
  mergeLocalDataForMigration,
  type LocalMigrationSnapshot,
} from "./local-migration";
import { getSupabaseBrowserClient } from "./supabase/client";

export interface CloudLoadResult {
  data: BalanceData;
  exists: boolean;
}

export interface CloudSaveResult {
  ok: boolean;
  error?: string;
}

interface PendingSave {
  userId: string;
  data: BalanceData;
  resolve: (result: CloudSaveResult) => void;
}

let pendingSave: PendingSave | null = null;
let saving = false;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Errore di connessione a Supabase.";
}

function requireClient() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error(
      "Supabase non è configurato. Aggiungi NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
}

export async function loadCloudBalance(
  userId: string,
): Promise<CloudLoadResult> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("balance_data")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossibile caricare i dati dal cloud. ${error.message}`,
    );
  }

  if (!data) {
    return { data: createEmptyData(), exists: false };
  }

  const row = data as { data?: unknown };
  const normalized = normalizeBalanceData(row.data);
  return { data: normalized.data, exists: true };
}

export async function saveCloudBalance(
  userId: string,
  data: BalanceData,
): Promise<CloudSaveResult> {
  try {
    const supabase = requireClient();
    const { error } = await supabase.from("balance_data").upsert(
      {
        user_id: userId,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      return {
        ok: false,
        error: `Salvataggio cloud non riuscito. ${error.message}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: `Salvataggio cloud non riuscito. ${errorMessage(error)}`,
    };
  }
}

/**
 * Writes snapshots in order so an older, slower request cannot overwrite a
 * newer one. Only the newest pending snapshot is kept.
 */
export function queueCloudSave(
  userId: string,
  data: BalanceData,
): Promise<CloudSaveResult> {
  return new Promise((resolve) => {
    if (pendingSave) {
      pendingSave.resolve({ ok: false, error: "Salvataggio superato." });
    }
    pendingSave = { userId, data, resolve };
    if (!saving) void flushCloudSaves();
  });
}

async function flushCloudSaves(): Promise<void> {
  if (saving) return;
  saving = true;

  while (pendingSave) {
    const job = pendingSave;
    pendingSave = null;
    const result = await saveCloudBalance(job.userId, job.data);
    job.resolve(result);
  }

  saving = false;
}

export function resetCloudSaveQueue(): void {
  if (pendingSave) {
    pendingSave.resolve({ ok: false, error: "Sessione terminata." });
    pendingSave = null;
  }
}

export async function migrateLocalDataToCloud(
  userId: string,
  local: LocalMigrationSnapshot,
): Promise<BalanceData> {
  const cloud = await loadCloudBalance(userId);
  const merged = mergeLocalDataForMigration(
    cloud.data,
    local.data,
    cloud.exists,
  );
  const result = await saveCloudBalance(userId, merged);
  if (!result.ok) {
    throw new Error(result.error ?? "Importazione cloud non riuscita.");
  }
  return merged;
}
