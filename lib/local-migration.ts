import type { BalanceData } from "./types";
import { readStoredRaw, normalizeBalanceData } from "./storage";
import { mergeBalanceData } from "./backup";

export const LOCAL_DATA_OWNER_KEY = "balance.v1.owner";

export interface LocalMigrationSummary {
  transactions: number;
  accounts: number;
  budgets: number;
  trips: number;
  personalItems: number;
}

export interface LocalMigrationSnapshot {
  data: BalanceData;
  summary: LocalMigrationSummary;
}

export function summarizeLocalData(data: BalanceData): LocalMigrationSummary {
  return {
    transactions: data.transactions.length,
    accounts: data.accounts.length,
    budgets: data.monthlyBudgets.length,
    trips: data.businessTrips.length,
    personalItems: data.personalBalanceItems.length,
  };
}

export function hasMeaningfulData(data: BalanceData): boolean {
  const summary = summarizeLocalData(data);
  return Object.values(summary).some((count) => count > 0);
}

/** Reads the untouched balance.v1 snapshot. Never writes or removes it. */
export function readLocalBalanceForMigration(): LocalMigrationSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = readStoredRaw();
    if (!raw) return null;
    const normalized = normalizeBalanceData(JSON.parse(raw));
    if (!hasMeaningfulData(normalized.data)) return null;
    return {
      data: normalized.data,
      summary: summarizeLocalData(normalized.data),
    };
  } catch {
    return null;
  }
}

export function getLocalDataOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LOCAL_DATA_OWNER_KEY);
  } catch {
    return null;
  }
}

export function markLocalDataOwner(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_DATA_OWNER_KEY, userId);
  } catch {
    // The local copy is still kept; only the ownership hint could not be saved.
  }
}

export function localDataOwnerMatches(userId: string): boolean {
  const owner = getLocalDataOwner();
  return !owner || owner === userId;
}

/**
 * Reuses the backup merge rules. A missing cloud row receives the local data
 * as-is, including settings. Existing cloud data is merged without duplicates.
 */
export function mergeLocalDataForMigration(
  cloud: BalanceData,
  local: BalanceData,
  cloudExists: boolean,
): BalanceData {
  if (!cloudExists) {
    return {
      ...local,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
  }

  return mergeBalanceData(cloud, local);
}
