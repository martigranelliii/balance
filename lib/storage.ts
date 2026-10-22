import {
  CURRENT_VERSION,
  RECOVERY_KEY,
  STORAGE_KEY,
  type Account,
  type AccountType,
  type BalanceData,
  type BusinessTrip,
  type BusinessTripExpense,
  type BusinessTripExpenseCategory,
  type CategoryRule,
  type CustomCategory,
  type HistoricalMonthlySummary,
  type ImportBatch,
  type LoadResult,
  type MonthlyBudget,
  type NetWorthSnapshot,
  type NormalizationResult,
  type PersonalBalanceDirection,
  type PersonalBalanceItem,
  type Reflection,
  type Settings,
  type SnapshotAccount,
  type Transaction,
  type TransactionType,
} from "./types";
import {
  addMonths,
  isISODate,
  isMonthKey,
  monthKeyFromDate,
} from "./dates";
import { isSafeCents, normalizeCents, sumCents } from "./money";
import {
  CATEGORIES,
  buildCategoryCatalog,
  normalizeCategoryName,
  type CategoryCatalog,
} from "./categories";
import { BUSINESS_TRIP_EXPENSE_CATEGORIES } from "./trips";

const ACCOUNT_TYPES: AccountType[] = [
  "checking",
  "savings",
  "cash",
  "investment",
  "wallet",
  "other",
];

const TRANSACTION_TYPES: TransactionType[] = ["income", "expense", "transfer"];
const REFLECTIONS: Reflection[] = ["yes", "neutral", "no"];

const DEFAULT_SETTINGS: Settings = {
  currency: "EUR",
  locale: "it-IT",
  reflectionEnabled: true,
  defaultRatePerKmMills: 0,
  theme: "classic",
};

const THEMES: Settings["theme"][] = ["classic", "sage", "rose", "minimal"];

export function createEmptyData(): BalanceData {
  return {
    version: CURRENT_VERSION,
    transactions: [],
    monthlyBudgets: [],
    accounts: [],
    netWorthSnapshots: [],
    historicalMonthlySummaries: [],
    categoryRules: [],
    importBatches: [],
    customCategories: [],
    hiddenDefaultCategories: [],
    businessTrips: [],
    personalBalanceItems: [],
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function safeTimestamp(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  return fallback;
}

function safeOptionalTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function safeId(value: unknown): string | null {
  const id = safeString(value, 120);
  return id ?? null;
}

function normalizeCentsMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const category = safeString(key, 80);
    if (!category || !isSafeCents(raw) || raw < 0) continue;
    result[category] = raw;
  }
  return result;
}

function normalizeTransaction(
  value: unknown,
  fallbackTimestamp: string,
): Transaction | null {
  if (!isRecord(value)) return null;
  const id = safeId(value.id);
  const date = value.date;
  const type = value.type;
  const amount = value.amountCents;

  if (!id || !isISODate(date)) return null;
  if (!TRANSACTION_TYPES.includes(type as TransactionType)) return null;
  if (!isSafeCents(amount) || amount <= 0) return null;

  const transactionType = type as TransactionType;
  const fallbackCategory =
    transactionType === "income" ? "altro-entrata" : "altro-spesa";
  const rawCategory = safeString(value.category, 80);
  const category =
    transactionType === "transfer"
      ? null
      : (rawCategory ?? fallbackCategory);

  const reflection = REFLECTIONS.includes(value.reflection as Reflection)
    ? (value.reflection as Reflection)
    : undefined;

  const rawAccountId = safeId(value.accountId);
  const rawToAccountId = safeId(value.toAccountId);
  const source =
    value.source === "bank-import"
      ? "bank-import"
      : value.source === "manual"
        ? "manual"
        : undefined;
  const importedAt = safeOptionalTimestamp(value.importedAt);
  const importBatchId =
    source === "bank-import" ? safeId(value.importBatchId) : null;
  const importFingerprint =
    source === "bank-import" ? safeString(value.importFingerprint, 200) : undefined;

  return {
    id,
    date,
    type: transactionType,
    amountCents: amount,
    category,
    subcategory: safeString(value.subcategory, 80),
    description: safeString(value.description, 280),
    notes: safeString(value.notes, 2000),
    accountId: rawAccountId,
    toAccountId:
      transactionType === "transfer" ? rawToAccountId : undefined,
    reflection: transactionType === "expense" ? reflection : undefined,
    source,
    importBatchId: importBatchId ?? undefined,
    originalDescription:
      source === "bank-import"
        ? safeString(value.originalDescription, 500)
        : undefined,
    importFingerprint,
    importedAt,
    createdAt: safeTimestamp(value.createdAt, fallbackTimestamp),
    updatedAt: safeTimestamp(value.updatedAt, fallbackTimestamp),
  };
}

function normalizeBudget(value: unknown): MonthlyBudget | null {
  if (!isRecord(value) || !isMonthKey(value.month)) return null;
  const month = value.month;
  const id = safeId(value.id) ?? `budget-${month}`;
  const categories = normalizeCentsMap(value.categories);
  return {
    id,
    month,
    categories,
    updatedAt: safeTimestamp(value.updatedAt, new Date(0).toISOString()),
  };
}

function normalizeAccount(value: unknown): Account | null {
  if (!isRecord(value)) return null;
  const id = safeId(value.id);
  const name = safeString(value.name, 80);
  if (!id || !name) return null;
  const type = ACCOUNT_TYPES.includes(value.type as AccountType)
    ? (value.type as AccountType)
    : "other";
  return {
    id,
    name,
    type,
    currentBalanceCents: normalizeCents(value.currentBalanceCents),
    includeInNetWorth: value.includeInNetWorth !== false,
    createdAt: safeTimestamp(value.createdAt, new Date(0).toISOString()),
    updatedAt: safeTimestamp(value.updatedAt, new Date(0).toISOString()),
  };
}

function normalizeSnapshotAccount(value: unknown): SnapshotAccount | null {
  if (!isRecord(value)) return null;
  const accountId = safeId(value.accountId);
  const name = safeString(value.name, 80);
  if (!accountId || !name) return null;
  const type = ACCOUNT_TYPES.includes(value.type as AccountType)
    ? (value.type as AccountType)
    : "other";
  return {
    accountId,
    name,
    type,
    balanceCents: normalizeCents(value.balanceCents),
    includeInNetWorth: value.includeInNetWorth !== false,
  };
}

function normalizeSnapshot(value: unknown): NetWorthSnapshot | null {
  if (!isRecord(value) || !isISODate(value.date)) return null;
  const date = value.date;
  const accounts = Array.isArray(value.accounts)
    ? value.accounts
        .map(normalizeSnapshotAccount)
        .filter((item): item is SnapshotAccount => item !== null)
    : [];
  const included = accounts.filter((item) => item.includeInNetWorth);
  const investmentsCents = sumCents(
    included
      .filter((item) => item.type === "investment")
      .map((item) => item.balanceCents),
  );
  const liquidCents = sumCents(
    included
      .filter((item) => item.type !== "investment")
      .map((item) => item.balanceCents),
  );
  const hasBreakdown = accounts.length > 0;

  return {
    id: safeId(value.id) ?? `snapshot-${date}`,
    date,
    totalCents: hasBreakdown
      ? liquidCents + investmentsCents
      : normalizeCents(value.totalCents),
    liquidCents: hasBreakdown
      ? liquidCents
      : normalizeCents(value.liquidCents),
    investmentsCents: hasBreakdown
      ? investmentsCents
      : normalizeCents(value.investmentsCents),
    accounts,
    createdAt: safeTimestamp(value.createdAt, new Date(0).toISOString()),
  };
}

function normalizeCustomCategory(value: unknown): CustomCategory | null {
  if (!isRecord(value)) return null;
  const id = safeId(value.id);
  const rawName = safeString(value.name, 60);
  const name = rawName?.replace(/\s+/g, " ");
  const type = value.type;
  if (!id || !name) return null;
  if (type !== "income" && type !== "expense") return null;
  if (CATEGORIES.some((category) => category.id === id)) return null;
  const normalizedName = normalizeCategoryName(name);
  if (
    CATEGORIES.some(
      (category) =>
        category.kind === type &&
        normalizeCategoryName(category.label) === normalizedName,
    )
  ) {
    return null;
  }

  return {
    id,
    name,
    type,
    archivedAt: safeOptionalTimestamp(value.archivedAt),
    createdAt: safeTimestamp(value.createdAt, new Date(0).toISOString()),
    updatedAt: safeTimestamp(value.updatedAt, new Date(0).toISOString()),
  };
}

function normalizeHiddenDefaults(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const defaultIds = new Set(CATEGORIES.map((category) => category.id));
  const result: string[] = [];
  for (const item of value) {
    const id = safeId(item);
    if (!id || !defaultIds.has(id) || result.includes(id)) continue;
    result.push(id);
  }
  return result;
}

function normalizeCategoryRule(
  value: unknown,
  catalog: CategoryCatalog,
): CategoryRule | null {
  if (!isRecord(value)) return null;
  const id = safeId(value.id);
  const pattern = safeString(value.pattern, 120)?.trim().toUpperCase();
  const category = safeString(value.category, 80);
  if (!id || !pattern || !category) return null;
  const definition = catalog.find((item) => item.id === category);
  if (!definition) return null;
  const kind = definition.kind;
  return {
    id,
    pattern,
    category,
    kind,
    createdAt: safeTimestamp(value.createdAt, new Date(0).toISOString()),
    updatedAt: safeTimestamp(value.updatedAt, new Date(0).toISOString()),
  };
}

function normalizeImportBatch(value: unknown): ImportBatch | null {
  if (!isRecord(value)) return null;
  const id = safeId(value.id);
  const fileName = safeString(value.fileName, 200);
  if (!id || !fileName) return null;
  const fileType = value.fileType === "xlsx" ? "xlsx" : "csv";
  const count = (raw: unknown): number =>
    typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
  return {
    id,
    fileName,
    fileType,
    importedAt: safeTimestamp(value.importedAt, new Date(0).toISOString()),
    transactionCount: count(value.transactionCount),
    rowCount: count(value.rowCount),
    skippedCount: count(value.skippedCount),
  };
}

function normalizeTripExpense(
  value: unknown,
  tripId: string,
  index: number,
): BusinessTripExpense | null {
  if (!isRecord(value)) return null;
  const category = BUSINESS_TRIP_EXPENSE_CATEGORIES.includes(
    value.category as BusinessTripExpenseCategory,
  )
    ? (value.category as BusinessTripExpenseCategory)
    : null;
  if (!category) return null;
  if (!isSafeCents(value.amountCents) || value.amountCents <= 0) return null;
  return {
    id: safeId(value.id) ?? `${tripId}-expense-${index + 1}`,
    category,
    amountCents: value.amountCents,
    description: safeString(value.description, 160),
  };
}

function normalizeBusinessTrip(value: unknown): BusinessTrip | null {
  if (!isRecord(value)) return null;
  const id = safeId(value.id);
  const title = safeString(value.title, 120);
  const date = value.date;
  if (!id || !title || !isISODate(date)) return null;

  const rawExpenses = Array.isArray(value.expenses) ? value.expenses : [];
  const seenExpenses = new Set<string>();
  const expenses: BusinessTripExpense[] = [];
  rawExpenses.forEach((raw, index) => {
    const expense = normalizeTripExpense(raw, id, index);
    if (!expense || seenExpenses.has(expense.id)) return;
    seenExpenses.add(expense.id);
    expenses.push(expense);
  });

  const kilometers =
    typeof value.kilometers === "number" &&
    Number.isFinite(value.kilometers) &&
    value.kilometers >= 0
      ? Math.round(value.kilometers * 1000) / 1000
      : undefined;
  const ratePerKmMills =
    isSafeCents(value.ratePerKmMills) && value.ratePerKmMills >= 0
      ? value.ratePerKmMills
      : undefined;
  const allowanceCents =
    isSafeCents(value.allowanceCents) && value.allowanceCents >= 0
      ? value.allowanceCents
      : undefined;
  const expectedSettlementMonth = isMonthKey(value.expectedSettlementMonth)
    ? value.expectedSettlementMonth
    : addMonths(monthKeyFromDate(date), 2);
  const status = value.status === "reimbursed" ? "reimbursed" : "open";

  return {
    id,
    date,
    title,
    location: safeString(value.location, 120),
    notes: safeString(value.notes, 2000),
    expenses,
    kilometers,
    ratePerKmMills,
    allowanceCents,
    expectedSettlementMonth,
    status,
    reimbursedAt:
      status === "reimbursed"
        ? safeOptionalTimestamp(value.reimbursedAt)
        : undefined,
    linkedSalaryTransactionId:
      status === "reimbursed" ? safeId(value.linkedSalaryTransactionId) ?? undefined : undefined,
    createdAt: safeTimestamp(value.createdAt, new Date(0).toISOString()),
    updatedAt: safeTimestamp(value.updatedAt, new Date(0).toISOString()),
  };
}

function normalizePersonalBalanceItem(
  value: unknown,
): PersonalBalanceItem | null {
  if (!isRecord(value)) return null;
  const id = safeId(value.id);
  const person = safeString(value.person, 120);
  const description = safeString(value.description, 280);
  const date = value.date;
  const direction: PersonalBalanceDirection | null =
    value.direction === "receivable" || value.direction === "payable"
      ? value.direction
      : null;
  if (
    !id ||
    !person ||
    !description ||
    !isISODate(date) ||
    !direction ||
    !isSafeCents(value.amountCents) ||
    value.amountCents <= 0
  ) {
    return null;
  }

  const status = value.status === "settled" ? "settled" : "open";
  return {
    id,
    direction,
    person,
    description,
    amountCents: value.amountCents,
    date,
    dueDate: isISODate(value.dueDate) ? value.dueDate : undefined,
    status,
    settledAt: status === "settled" ? safeOptionalTimestamp(value.settledAt) : undefined,
    linkedTransactionId:
      status === "settled"
        ? safeId(value.linkedTransactionId) ?? undefined
        : undefined,
    notes: safeString(value.notes, 2000),
    createdAt: safeTimestamp(value.createdAt, new Date(0).toISOString()),
    updatedAt: safeTimestamp(value.updatedAt, new Date(0).toISOString()),
  };
}

function normalizeHistorical(
  value: unknown,
): HistoricalMonthlySummary | null {
  if (!isRecord(value) || !isMonthKey(value.month)) return null;
  const month = value.month;
  const incomeByCategory = normalizeCentsMap(value.incomeByCategory);
  const expenseByCategory = normalizeCentsMap(value.expenseByCategory);
  const derivedIncome = sumCents(Object.values(incomeByCategory));
  const derivedExpenses = sumCents(Object.values(expenseByCategory));
  const totalIncomeCents = isSafeCents(value.totalIncomeCents)
    ? value.totalIncomeCents
    : derivedIncome;
  const totalExpensesCents = isSafeCents(value.totalExpensesCents)
    ? value.totalExpensesCents
    : derivedExpenses;
  const savingsCents = isSafeCents(value.savingsCents)
    ? value.savingsCents
    : totalIncomeCents - totalExpensesCents;

  return {
    id: safeId(value.id) ?? `historical-${month}`,
    month,
    incomeByCategory,
    expenseByCategory,
    totalIncomeCents,
    totalExpensesCents,
    savingsCents,
    source: "historical-import",
    createdAt: safeTimestamp(value.createdAt, new Date(0).toISOString()),
  };
}

function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  return {
    currency: "EUR",
    locale: "it-IT",
    reflectionEnabled: value.reflectionEnabled !== false,
    defaultRatePerKmMills:
      isSafeCents(value.defaultRatePerKmMills) &&
      value.defaultRatePerKmMills >= 0
        ? value.defaultRatePerKmMills
        : 0,
    theme: THEMES.includes(value.theme as Settings["theme"])
      ? (value.theme as Settings["theme"])
      : "classic",
  };
}

function dedupeBy<T>(
  items: T[],
  key: (item: T) => string,
  issues: string[],
  label: string,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) {
      issues.push(`${label}: duplicato ignorato (${id}).`);
      continue;
    }
    seen.add(id);
    result.push(item);
  }
  return result;
}

export class UnsupportedVersionError extends Error {}

/**
 * Normalizes individual records instead of rejecting the whole file. A broken
 * transaction is dropped, but the rest of the journal remains readable.
 */
export function normalizeBalanceData(raw: unknown): NormalizationResult {
  if (!isRecord(raw)) {
    throw new Error("Il contenuto salvato non è un oggetto Balance.");
  }

  const version = typeof raw.version === "number" ? raw.version : CURRENT_VERSION;
  if (version > CURRENT_VERSION) {
    throw new UnsupportedVersionError(
      "Questi dati sono stati creati con una versione più recente di Balance.",
    );
  }

  const issues: string[] = [];
  const fallbackTimestamp = new Date(0).toISOString();

  const rawTransactions = Array.isArray(raw.transactions)
    ? raw.transactions
    : [];
  if (raw.transactions !== undefined && !Array.isArray(raw.transactions)) {
    issues.push("Elenco movimenti non leggibile: è stato ignorato.");
  }
  const transactions = rawTransactions
    .map((item) => normalizeTransaction(item, fallbackTimestamp))
    .filter((item): item is Transaction => item !== null);
  if (transactions.length < rawTransactions.length) {
    issues.push(
      `${rawTransactions.length - transactions.length} movimenti non leggibili ignorati.`,
    );
  }

  const rawBudgets = Array.isArray(raw.monthlyBudgets) ? raw.monthlyBudgets : [];
  const budgets = rawBudgets
    .map(normalizeBudget)
    .filter((item): item is MonthlyBudget => item !== null);

  const rawAccounts = Array.isArray(raw.accounts) ? raw.accounts : [];
  const accounts = rawAccounts
    .map(normalizeAccount)
    .filter((item): item is Account => item !== null);
  if (accounts.length < rawAccounts.length) {
    issues.push(
      `${rawAccounts.length - accounts.length} conti non leggibili ignorati.`,
    );
  }

  const rawSnapshots = Array.isArray(raw.netWorthSnapshots)
    ? raw.netWorthSnapshots
    : [];
  const snapshots = rawSnapshots
    .map(normalizeSnapshot)
    .filter((item): item is NetWorthSnapshot => item !== null);

  const rawHistorical = Array.isArray(raw.historicalMonthlySummaries)
    ? raw.historicalMonthlySummaries
    : [];
  const historical = rawHistorical
    .map(normalizeHistorical)
    .filter((item): item is HistoricalMonthlySummary => item !== null);

  const rawCustom = Array.isArray(raw.customCategories)
    ? raw.customCategories
    : [];
  const customById = rawCustom
    .map(normalizeCustomCategory)
    .filter((item): item is CustomCategory => item !== null);
  if (customById.length < rawCustom.length) {
    issues.push(
      `${rawCustom.length - customById.length} categorie personalizzate non leggibili ignorate.`,
    );
  }
  const customCategories = dedupeBy(
    dedupeBy(customById, (item) => item.id, issues, "Categoria personalizzata"),
    (item) => `${item.type}:${normalizeCategoryName(item.name)}`,
    issues,
    "Categoria personalizzata",
  );
  const hiddenDefaultCategories = normalizeHiddenDefaults(
    raw.hiddenDefaultCategories,
  );
  const categoryCatalog = buildCategoryCatalog(
    customCategories,
    hiddenDefaultCategories,
  );

  const rawRules = Array.isArray(raw.categoryRules) ? raw.categoryRules : [];
  const rules = rawRules
    .map((item) => normalizeCategoryRule(item, categoryCatalog))
    .filter((item): item is CategoryRule => item !== null);

  const rawBatches = Array.isArray(raw.importBatches) ? raw.importBatches : [];
  const importBatches = rawBatches
    .map(normalizeImportBatch)
    .filter((item): item is ImportBatch => item !== null);

  const rawTrips = Array.isArray(raw.businessTrips) ? raw.businessTrips : [];
  const businessTrips = rawTrips
    .map(normalizeBusinessTrip)
    .filter((item): item is BusinessTrip => item !== null);
  if (businessTrips.length < rawTrips.length) {
    issues.push(
      `${rawTrips.length - businessTrips.length} trasferte non leggibili ignorate.`,
    );
  }

  const rawPersonal = Array.isArray(raw.personalBalanceItems)
    ? raw.personalBalanceItems
    : [];
  const personalBalanceItems = rawPersonal
    .map(normalizePersonalBalanceItem)
    .filter((item): item is PersonalBalanceItem => item !== null);
  if (personalBalanceItems.length < rawPersonal.length) {
    issues.push(
      `${rawPersonal.length - personalBalanceItems.length} voci personali non leggibili ignorate.`,
    );
  }

  const data: BalanceData = {
    version: CURRENT_VERSION,
    transactions: dedupeBy(transactions, (item) => item.id, issues, "Movimento"),
    monthlyBudgets: dedupeBy(
      budgets,
      (item) => item.month,
      issues,
      "Budget",
    ),
    accounts: dedupeBy(accounts, (item) => item.id, issues, "Conto"),
    netWorthSnapshots: dedupeBy(
      snapshots,
      (item) => item.id,
      issues,
      "Fotografia",
    ),
    historicalMonthlySummaries: dedupeBy(
      historical,
      (item) => item.month,
      issues,
      "Cronologia",
    ),
    categoryRules: dedupeBy(
      rules,
      (item) => `${item.kind}:${item.pattern}`,
      issues,
      "Regola",
    ),
    importBatches: dedupeBy(
      importBatches,
      (item) => item.id,
      issues,
      "Importazione",
    ),
    customCategories,
    hiddenDefaultCategories,
    businessTrips: dedupeBy(
      businessTrips,
      (item) => item.id,
      issues,
      "Trasferta",
    ),
    personalBalanceItems: dedupeBy(
      personalBalanceItems,
      (item) => item.id,
      issues,
      "Voce personale",
    ),
    settings: normalizeSettings(raw.settings),
    updatedAt: safeTimestamp(raw.updatedAt, ""),
  };

  return {
    // Keep unknown top-level fields created by newer/additive app versions.
    data: { ...raw, ...data } as BalanceData,
    issues,
  };
}

function preserveRaw(raw: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECOVERY_KEY, raw);
  } catch {
    // If even the recovery copy cannot be written, the canonical raw value is
    // intentionally left untouched.
  }
}

export function loadBalanceData(): LoadResult {
  if (typeof window === "undefined") {
    return { status: "empty", data: createEmptyData(), issues: [] };
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return {
      status: "corrupt",
      data: createEmptyData(),
      issues: ["Lo spazio locale non è accessibile in questo browser."],
    };
  }

  if (!raw) {
    return { status: "empty", data: createEmptyData(), issues: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    preserveRaw(raw);
    return {
      status: "corrupt",
      data: createEmptyData(),
      issues: ["I dati salvati non sono in un formato leggibile."],
      raw,
    };
  }

  try {
    const { data, issues } = normalizeBalanceData(parsed);
    if (issues.length > 0) {
      preserveRaw(raw);
      return {
        status: "recovered",
        data,
        issues,
        raw,
      };
    }
    return { status: "ok", data, issues: [] };
  } catch (error) {
    preserveRaw(raw);
    return {
      status: "corrupt",
      data: createEmptyData(),
      issues: [
        error instanceof Error
          ? error.message
          : "I dati salvati non sono leggibili.",
      ],
      raw,
    };
  }
}

export function saveBalanceData(data: BalanceData): {
  ok: boolean;
  error?: string;
} {
  if (typeof window === "undefined") {
    return { ok: false, error: "Salvataggio disponibile solo nel browser." };
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Non è stato possibile salvare. Controlla lo spazio disponibile e scarica un backup.",
    };
  }
}

export function getRecoveryRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(RECOVERY_KEY);
  } catch {
    return null;
  }
}

export function clearRecoveryData(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Best effort.
  }
}

export function clearAllStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Best effort.
  }
}

export function readStoredRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
