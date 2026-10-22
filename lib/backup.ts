import {
  CURRENT_VERSION,
  type BackupFile,
  type BackupSummary,
  type BalanceData,
} from "./types";
import {
  normalizeBalanceData,
  UnsupportedVersionError,
} from "./storage";
import { normalizeCategoryName } from "./categories";

export type BackupParseResult =
  | {
      ok: true;
      data: BalanceData;
      summary: BackupSummary;
      exportedAt?: string;
    }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createBackup(data: BalanceData, now: Date = new Date()): BackupFile {
  return {
    app: "balance",
    version: CURRENT_VERSION,
    exportedAt: now.toISOString(),
    data,
    totals: {
      transactions: data.transactions.length,
      accounts: data.accounts.length,
    },
  };
}

export function serializeBackup(data: BalanceData): string {
  return JSON.stringify(createBackup(data), null, 2);
}

export function backupFileName(today: string): string {
  return `balance-backup-${today}.json`;
}

export function summarizeData(data: BalanceData): BackupSummary {
  return {
    transactionCount: data.transactions.length,
    accountCount: data.accounts.length,
    budgetMonthCount: data.monthlyBudgets.length,
    snapshotCount: data.netWorthSnapshots.length,
    historicalMonthCount: data.historicalMonthlySummaries.length,
    ruleCount: data.categoryRules.length,
    importBatchCount: data.importBatches.length,
    customCategoryCount: data.customCategories.length,
    hiddenCategoryCount: data.hiddenDefaultCategories.length,
    businessTripCount: data.businessTrips.length,
    personalBalanceCount: data.personalBalanceItems.length,
    updatedAt: data.updatedAt,
  };
}

export function parseBackup(text: string): BackupParseResult {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, errors: ["Il file è vuoto."] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: ["Il file non è un JSON valido."],
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      errors: ["Il file non contiene un backup Balance."],
    };
  }

  const wrapped = parsed.app === "balance" ? parsed.data : parsed;
  if (!isRecord(wrapped)) {
    return {
      ok: false,
      errors: ["Il backup non contiene dati leggibili."],
    };
  }

  const looksLikeBalance =
    wrapped.version !== undefined ||
    wrapped.transactions !== undefined ||
    wrapped.accounts !== undefined ||
    wrapped.businessTrips !== undefined ||
    wrapped.personalBalanceItems !== undefined;
  if (!looksLikeBalance) {
    return {
      ok: false,
      errors: ["Questo file non sembra un backup di Balance."],
    };
  }

  if (typeof wrapped.version === "number" && wrapped.version > CURRENT_VERSION) {
    return {
      ok: false,
      errors: [
        "Il backup è stato creato con una versione più recente di Balance e non può essere importato qui.",
      ],
    };
  }

  try {
    const { data, issues } = normalizeBalanceData(wrapped);
    if (issues.length > 0) {
      return {
        ok: false,
        errors: [
          "Il backup contiene dati non validi. Non è stato modificato nulla.",
          ...issues.slice(0, 6),
        ],
      };
    }
    return {
      ok: true,
      data,
      summary: summarizeData(data),
      exportedAt:
        typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        error instanceof UnsupportedVersionError
          ? error.message
          : "Il backup non è leggibile. Non è stato modificato nulla.",
      ],
    };
  }
}

/**
 * Merge is additive and ID-protected: an incoming record never overwrites an
 * existing one. Budgets and historical summaries are unique per month;
 * snapshots are unique per day so the trend does not get duplicate points.
 */
export function mergeBalanceData(
  current: BalanceData,
  incoming: BalanceData,
): BalanceData {
  const transactionIds = new Set(current.transactions.map((item) => item.id));
  const accountIds = new Set(current.accounts.map((item) => item.id));
  const budgetMonths = new Set(current.monthlyBudgets.map((item) => item.month));
  const snapshotIds = new Set(current.netWorthSnapshots.map((item) => item.id));
  const snapshotDates = new Set(
    current.netWorthSnapshots.map((item) => item.date),
  );
  const historicalMonths = new Set(
    current.historicalMonthlySummaries.map((item) => item.month),
  );
  const ruleKeys = new Set(
    current.categoryRules.map((item) => `${item.kind}:${item.pattern}`),
  );
  const importBatchIds = new Set(
    current.importBatches.map((item) => item.id),
  );
  const customCategoryIds = new Set(
    current.customCategories.map((item) => item.id),
  );
  const customCategoryNameIds = new Map(
    current.customCategories.map((item) => [
      `${item.type}:${normalizeCategoryName(item.name)}`,
      item.id,
    ]),
  );
  // When the same logical custom category exists with another id, incoming
  // records are linked to the id already on this device instead of creating a
  // duplicate category or leaving transactions with an orphan category id.
  const customCategoryRemap = new Map<string, string>();
  for (const item of incoming.customCategories) {
    if (customCategoryIds.has(item.id)) continue;
    const nameKey = `${item.type}:${normalizeCategoryName(item.name)}`;
    const targetId = customCategoryNameIds.get(nameKey);
    if (targetId) customCategoryRemap.set(item.id, targetId);
  }
  const remapCategoryId = (
    id: string | null | undefined,
  ): string | null | undefined => (id ? customCategoryRemap.get(id) ?? id : id);
  const remapCategoryTotals = (
    totals: Record<string, number>,
  ): Record<string, number> => {
    const remapped: Record<string, number> = {};
    for (const [categoryId, cents] of Object.entries(totals)) {
      const targetId = remapCategoryId(categoryId) ?? categoryId;
      remapped[targetId] = (remapped[targetId] ?? 0) + cents;
    }
    return remapped;
  };
  const hiddenDefaultCategories = Array.from(
    new Set([
      ...current.hiddenDefaultCategories,
      ...incoming.hiddenDefaultCategories,
    ]),
  );
  const businessTripIds = new Set(
    current.businessTrips.map((item) => item.id),
  );
  const personalBalanceIds = new Set(
    current.personalBalanceItems.map((item) => item.id),
  );

  const transactions = [...current.transactions];
  for (const item of incoming.transactions) {
    if (transactionIds.has(item.id)) continue;
    transactionIds.add(item.id);
    transactions.push({
      ...item,
      category: remapCategoryId(item.category) ?? null,
    });
  }

  const accounts = [...current.accounts];
  for (const item of incoming.accounts) {
    if (accountIds.has(item.id)) continue;
    accountIds.add(item.id);
    accounts.push(item);
  }

  const monthlyBudgets = [...current.monthlyBudgets];
  for (const item of incoming.monthlyBudgets) {
    if (budgetMonths.has(item.month)) continue;
    budgetMonths.add(item.month);
    monthlyBudgets.push({
      ...item,
      categories: remapCategoryTotals(item.categories),
    });
  }

  const netWorthSnapshots = [...current.netWorthSnapshots];
  for (const item of incoming.netWorthSnapshots) {
    if (snapshotIds.has(item.id) || snapshotDates.has(item.date)) continue;
    snapshotIds.add(item.id);
    snapshotDates.add(item.date);
    netWorthSnapshots.push(item);
  }

  const historicalMonthlySummaries = [...current.historicalMonthlySummaries];
  for (const item of incoming.historicalMonthlySummaries) {
    if (historicalMonths.has(item.month)) continue;
    historicalMonths.add(item.month);
    historicalMonthlySummaries.push({
      ...item,
      incomeByCategory: remapCategoryTotals(item.incomeByCategory),
      expenseByCategory: remapCategoryTotals(item.expenseByCategory),
    });
  }

  const categoryRules = [...current.categoryRules];
  for (const item of incoming.categoryRules) {
    const key = `${item.kind}:${item.pattern}`;
    if (ruleKeys.has(key)) continue;
    ruleKeys.add(key);
    categoryRules.push({
      ...item,
      category: remapCategoryId(item.category) ?? item.category,
    });
  }

  const importBatches = [...current.importBatches];
  for (const item of incoming.importBatches) {
    if (importBatchIds.has(item.id)) continue;
    importBatchIds.add(item.id);
    importBatches.push(item);
  }

  const customCategories = [...current.customCategories];
  for (const item of incoming.customCategories) {
    if (customCategoryIds.has(item.id)) continue;
    const nameKey = `${item.type}:${normalizeCategoryName(item.name)}`;
    if (customCategoryNameIds.has(nameKey)) continue;
    customCategoryIds.add(item.id);
    customCategoryNameIds.set(nameKey, item.id);
    customCategories.push(item);
  }

  const businessTrips = [...current.businessTrips];
  for (const item of incoming.businessTrips) {
    if (businessTripIds.has(item.id)) continue;
    businessTripIds.add(item.id);
    businessTrips.push(item);
  }

  const personalBalanceItems = [...current.personalBalanceItems];
  for (const item of incoming.personalBalanceItems) {
    if (personalBalanceIds.has(item.id)) continue;
    personalBalanceIds.add(item.id);
    personalBalanceItems.push(item);
  }

  return {
    ...current,
    transactions,
    accounts,
    monthlyBudgets,
    netWorthSnapshots,
    historicalMonthlySummaries,
    categoryRules,
    importBatches,
    customCategories,
    hiddenDefaultCategories,
    businessTrips,
    personalBalanceItems,
    updatedAt: new Date().toISOString(),
  };
}
