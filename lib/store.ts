"use client";

import { useSyncExternalStore } from "react";
import {
  createEmptyData,
  clearAllStorage,
  loadBalanceData,
  saveBalanceData,
} from "./storage";
import { queueCloudSave, resetCloudSaveQueue } from "./cloud";
import type {
  Account,
  AccountType,
  BalanceData,
  BusinessTrip,
  BusinessTripExpense,
  BusinessTripExpenseCategory,
  CategoryRule,
  CustomCategory,
  ImportBatch,
  LoadResult as LoadInfo,
  PersonalBalanceDirection,
  PersonalBalanceItem,
  Reflection,
  Settings,
  Transaction,
  TransactionType,
} from "./types";
import { calculateNetWorth } from "./finance";
import { isISODate, isMonthKey, todayISO } from "./dates";
import { isSafeCents } from "./money";
import { createId } from "./id";
import { mergeBalanceData } from "./backup";
import {
  CATEGORIES,
  buildCategoryCatalog,
  findCategoryByName,
  isCategoryAvailable,
  type CategoryKind,
} from "./categories";
import { merchantPatternFor } from "./import/bank";
import {
  BUSINESS_TRIP_EXPENSE_CATEGORIES,
  defaultSettlementMonth,
} from "./trips";

export interface NewTransactionInput {
  type: TransactionType;
  amountCents: number;
  date: string;
  category: string | null;
  description?: string;
  notes?: string;
  accountId?: string | null;
  toAccountId?: string | null;
  reflection?: Reflection;
}

export interface AccountInput {
  id?: string;
  name: string;
  type: AccountType;
  currentBalanceCents: number;
  includeInNetWorth: boolean;
}

export interface BusinessTripExpenseInput {
  id?: string;
  category: BusinessTripExpenseCategory;
  amountCents: number;
  description?: string;
}

export interface BusinessTripInput {
  id?: string;
  date: string;
  title: string;
  location?: string;
  notes?: string;
  expenses: BusinessTripExpenseInput[];
  kilometers?: number;
  ratePerKmMills?: number;
  allowanceCents?: number;
  expectedSettlementMonth?: string;
}

export interface PersonalBalanceInput {
  id?: string;
  direction: PersonalBalanceDirection;
  person: string;
  description: string;
  amountCents: number;
  date: string;
  dueDate?: string;
  notes?: string;
}

export interface CustomCategoryInput {
  name: string;
  type: CategoryKind;
}

export interface BankImportCommitRow {
  date: string;
  type: TransactionType;
  amountCents: number;
  category: string | null;
  description: string;
  originalDescription?: string;
  accountId?: string | null;
  toAccountId?: string | null;
  importFingerprint: string;
}

export interface RuleToLearn {
  pattern: string;
  category: string;
  kind: "income" | "expense";
}

export interface BankImportInput {
  fileName: string;
  fileType: "csv" | "xlsx";
  rows: BankImportCommitRow[];
  /** Data rows found in the file, before exclusions. */
  detectedCount: number;
  rulesToLearn: RuleToLearn[];
}

interface StoreSnapshot {
  data: BalanceData;
  hydrated: boolean;
  loadInfo: LoadInfo | null;
  storageError: string | null;
}

const EMPTY_DATA = createEmptyData();
const SERVER_SNAPSHOT: StoreSnapshot = {
  data: EMPTY_DATA,
  hydrated: false,
  loadInfo: null,
  storageError: null,
};

let snapshot: StoreSnapshot = SERVER_SNAPSHOT;
let initialized = false;
let storageMode: "local" | "cloud" = "local";
let cloudUserId: string | null = null;
let cloudSaveRequest = 0;
const listeners = new Set<() => void>();

function publish(next: Partial<StoreSnapshot>, nextData?: BalanceData): void {
  snapshot = {
    ...snapshot,
    ...next,
    data: nextData ?? snapshot.data,
  };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): StoreSnapshot {
  return snapshot;
}

export function getServerSnapshot(): StoreSnapshot {
  return SERVER_SNAPSHOT;
}

export function useBalanceStore(): StoreSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function initializeStore(): void {
  if (initialized || storageMode !== "local" || typeof window === "undefined") {
    return;
  }
  initialized = true;
  const result = loadBalanceData();
  publish(
    { hydrated: true, loadInfo: result, storageError: null },
    result.data,
  );

  window.addEventListener("storage", (event) => {
    if (event.key !== "balance.v1" && event.key !== null) return;
    const refreshed = loadBalanceData();
    publish(
      {
        hydrated: true,
        loadInfo: refreshed,
        storageError: null,
      },
      refreshed.data,
    );
  });
}

export function initializeCloudStore(
  data: BalanceData,
  userId: string,
): void {
  storageMode = "cloud";
  cloudUserId = userId;
  initialized = true;
  cloudSaveRequest += 1;
  resetCloudSaveQueue();
  publish(
    {
      hydrated: true,
      loadInfo: { status: "ok", data, issues: [] },
      storageError: null,
    },
    data,
  );
}

/** Replaces the in-memory snapshot after a cloud-side migration. */
export function updateCloudStoreData(data: BalanceData): void {
  if (storageMode !== "cloud") return;
  publish(
    {
      hydrated: true,
      loadInfo: { status: "ok", data, issues: [] },
      storageError: null,
    },
    data,
  );
}

export function resetStoreForSession(): void {
  storageMode = "local";
  cloudUserId = null;
  initialized = false;
  cloudSaveRequest += 1;
  resetCloudSaveQueue();
  const data = createEmptyData();
  publish(
    {
      data,
      hydrated: false,
      loadInfo: null,
      storageError: null,
    },
    data,
  );
}

function commit(nextData: BalanceData): void {
  const data: BalanceData = {
    ...nextData,
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  if (storageMode === "cloud" && cloudUserId) {
    const requestId = ++cloudSaveRequest;
    publish(
      {
        storageError: null,
        loadInfo:
          snapshot.loadInfo?.status === "corrupt" ||
          snapshot.loadInfo?.status === "recovered"
            ? snapshot.loadInfo
            : { status: "ok", data, issues: [] },
      },
      data,
    );

    const userId = cloudUserId;
    void queueCloudSave(userId, data).then((result) => {
      if (
        requestId !== cloudSaveRequest ||
        storageMode !== "cloud" ||
        cloudUserId !== userId
      ) {
        return;
      }
      publish({
        storageError: result.ok
          ? null
          : (result.error ?? "Errore di salvataggio sul cloud."),
      });
    });
    return;
  }

  const result = saveBalanceData(data);
  publish(
    {
      storageError: result.ok ? null : (result.error ?? "Errore di salvataggio."),
      loadInfo:
        snapshot.loadInfo?.status === "corrupt" ||
        snapshot.loadInfo?.status === "recovered"
          ? snapshot.loadInfo
          : { status: "ok", data, issues: [] },
    },
    data,
  );
}

function validateAmount(amountCents: number): void {
  if (!isSafeCents(amountCents) || amountCents <= 0) {
    throw new Error("L'importo deve essere maggiore di zero.");
  }
}

function currentCategoryCatalog() {
  return buildCategoryCatalog(
    snapshot.data.customCategories,
    snapshot.data.hiddenDefaultCategories,
  );
}

function cleanCategoryName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) throw new Error("Dai un nome alla categoria.");
  if (cleaned.length > 60) {
    throw new Error("Il nome della categoria è troppo lungo.");
  }
  return cleaned;
}

function assertCategoryNameAvailable(
  name: string,
  type: CategoryKind,
  excludeId?: string,
): void {
  const catalog = currentCategoryCatalog();
  const conflict = findCategoryByName(name, type, catalog);
  if (!conflict || conflict.id === excludeId) return;

  if (conflict.custom && conflict.archived) {
    throw new Error(
      "Questa categoria esiste già ma è stata eliminata. Puoi ripristinarla dalle categorie non utilizzate.",
    );
  }
  if (conflict.hidden) {
    throw new Error(
      "Questa categoria esiste già ma è nascosta. Puoi ripristinarla dalle categorie non utilizzate.",
    );
  }
  throw new Error("Esiste già una categoria con questo nome.");
}

function cleanTransaction(
  input: NewTransactionInput,
  id: string,
  createdAt: string,
): Transaction {
  if (!isISODate(input.date)) throw new Error("Data non valida.");
  validateAmount(input.amountCents);
  if (input.type !== "transfer" && !input.category) {
    throw new Error("Scegli una categoria.");
  }
  if (
    input.type === "transfer" &&
    input.accountId &&
    input.toAccountId &&
    input.accountId === input.toAccountId
  ) {
    throw new Error("I due conti devono essere diversi.");
  }
  const now = new Date().toISOString();
  return {
    id,
    date: input.date,
    type: input.type,
    amountCents: input.amountCents,
    category: input.type === "transfer" ? null : input.category,
    description: input.description?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    accountId: input.accountId || undefined,
    toAccountId:
      input.type === "transfer" ? input.toAccountId || undefined : undefined,
    reflection: input.type === "expense" ? input.reflection : undefined,
    createdAt,
    updatedAt: now,
  };
}

export function addTransaction(input: NewTransactionInput): string {
  const id = createId("tx");
  const transaction = cleanTransaction(input, id, new Date().toISOString());
  commit({
    ...snapshot.data,
    transactions: [transaction, ...snapshot.data.transactions],
  });
  return id;
}

export function updateTransaction(id: string, input: NewTransactionInput): void {
  const existing = snapshot.data.transactions.find((item) => item.id === id);
  if (!existing) throw new Error("Movimento non trovato.");
  const transaction = cleanTransaction(input, id, existing.createdAt);
  // Keep import traceability when an imported row is edited later.
  if (existing.source === "bank-import") {
    transaction.source = existing.source;
    transaction.importBatchId = existing.importBatchId;
    transaction.originalDescription = existing.originalDescription;
    transaction.importFingerprint = existing.importFingerprint;
    transaction.importedAt = existing.importedAt;
  }
  commit({
    ...snapshot.data,
    transactions: snapshot.data.transactions.map((item) =>
      item.id === id ? transaction : item,
    ),
  });
}

export function deleteTransaction(id: string): void {
  commit({
    ...snapshot.data,
    transactions: snapshot.data.transactions.filter((item) => item.id !== id),
    businessTrips: snapshot.data.businessTrips.map((trip) =>
      trip.linkedSalaryTransactionId === id
        ? { ...trip, linkedSalaryTransactionId: undefined }
        : trip,
    ),
    personalBalanceItems: snapshot.data.personalBalanceItems.map((item) =>
      item.linkedTransactionId === id
        ? { ...item, linkedTransactionId: undefined }
        : item,
    ),
  });
}

function cleanBusinessTrip(
  input: BusinessTripInput,
  existing: BusinessTrip | undefined,
  id: string,
  now: string,
): BusinessTrip {
  const title = input.title.trim();
  if (!title) throw new Error("Dai un titolo alla trasferta.");
  if (!isISODate(input.date)) throw new Error("Data non valida.");

  const expenses: BusinessTripExpense[] = input.expenses.map((expense) => {
    if (!BUSINESS_TRIP_EXPENSE_CATEGORIES.includes(expense.category)) {
      throw new Error("Categoria di spesa non valida.");
    }
    if (!isSafeCents(expense.amountCents) || expense.amountCents <= 0) {
      throw new Error("Ogni spesa deve avere un importo maggiore di zero.");
    }
    return {
      id: expense.id ?? createId("trip-expense"),
      category: expense.category,
      amountCents: expense.amountCents,
      description: expense.description?.trim().slice(0, 160) || undefined,
    };
  });

  const kilometers =
    typeof input.kilometers === "number" &&
    Number.isFinite(input.kilometers) &&
    input.kilometers > 0
      ? Math.round(input.kilometers * 1000) / 1000
      : undefined;
  const ratePerKmMills =
    isSafeCents(input.ratePerKmMills) && input.ratePerKmMills > 0
      ? input.ratePerKmMills
      : undefined;
  const allowanceCents =
    isSafeCents(input.allowanceCents) && input.allowanceCents > 0
      ? input.allowanceCents
      : undefined;

  if (kilometers && !ratePerKmMills) {
    throw new Error("Inserisci la tariffa per chilometro.");
  }
  if (
    expenses.length === 0 &&
    !kilometers &&
    !allowanceCents
  ) {
    throw new Error(
      "Aggiungi almeno una spesa, i chilometri o un’indennità.",
    );
  }

  const expectedSettlementMonth = isMonthKey(input.expectedSettlementMonth)
    ? input.expectedSettlementMonth
    : defaultSettlementMonth(input.date);

  return {
    id,
    date: input.date,
    title: title.slice(0, 120),
    location: input.location?.trim().slice(0, 120) || undefined,
    notes: input.notes?.trim().slice(0, 2000) || undefined,
    expenses,
    kilometers,
    ratePerKmMills,
    allowanceCents,
    expectedSettlementMonth,
    status: existing?.status ?? "open",
    reimbursedAt: existing?.reimbursedAt,
    linkedSalaryTransactionId: existing?.linkedSalaryTransactionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function saveBusinessTrip(input: BusinessTripInput): string {
  const now = new Date().toISOString();
  const existing = input.id
    ? snapshot.data.businessTrips.find((trip) => trip.id === input.id)
    : undefined;
  const id = existing?.id ?? createId("trip");
  const trip = cleanBusinessTrip(input, existing, id, now);
  const businessTrips = existing
    ? snapshot.data.businessTrips.map((item) => (item.id === id ? trip : item))
    : [trip, ...snapshot.data.businessTrips];
  commit({ ...snapshot.data, businessTrips });
  return id;
}

export function deleteBusinessTrip(id: string): void {
  commit({
    ...snapshot.data,
    businessTrips: snapshot.data.businessTrips.filter(
      (trip) => trip.id !== id,
    ),
  });
}

export function markBusinessTripReimbursed(
  id: string,
  linkedSalaryTransactionId?: string,
): void {
  const trip = snapshot.data.businessTrips.find((item) => item.id === id);
  if (!trip) throw new Error("Trasferta non trovata.");

  if (linkedSalaryTransactionId) {
    const transaction = snapshot.data.transactions.find(
      (item) => item.id === linkedSalaryTransactionId,
    );
    if (!transaction) throw new Error("Movimento non trovato.");
    if (transaction.type !== "income") {
      throw new Error("Scegli un movimento in entrata.");
    }
  }

  const now = new Date().toISOString();
  commit({
    ...snapshot.data,
    businessTrips: snapshot.data.businessTrips.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "reimbursed",
            reimbursedAt: now,
            linkedSalaryTransactionId: linkedSalaryTransactionId || undefined,
            updatedAt: now,
          }
        : item,
    ),
  });
}

export function reopenBusinessTrip(id: string): void {
  const now = new Date().toISOString();
  commit({
    ...snapshot.data,
    businessTrips: snapshot.data.businessTrips.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "open",
            reimbursedAt: undefined,
            linkedSalaryTransactionId: undefined,
            updatedAt: now,
          }
        : item,
    ),
  });
}

function cleanPersonalBalanceItem(
  input: PersonalBalanceInput,
  existing: PersonalBalanceItem | undefined,
  id: string,
  now: string,
): PersonalBalanceItem {
  const person = input.person.trim();
  const description = input.description.trim();
  if (!person) throw new Error("Indica a chi si riferisce la voce.");
  if (!description) throw new Error("Aggiungi una descrizione.");
  if (!isISODate(input.date)) throw new Error("Data non valida.");
  if (!isSafeCents(input.amountCents) || input.amountCents <= 0) {
    throw new Error("L’importo deve essere maggiore di zero.");
  }
  if (input.direction !== "receivable" && input.direction !== "payable") {
    throw new Error("Scegli se è da ricevere o da dare.");
  }
  if (input.dueDate && !isISODate(input.dueDate)) {
    throw new Error("Scadenza non valida.");
  }

  return {
    id,
    direction: input.direction,
    person: person.slice(0, 120),
    description: description.slice(0, 280),
    amountCents: input.amountCents,
    date: input.date,
    dueDate: input.dueDate || undefined,
    status: existing?.status ?? "open",
    settledAt: existing?.settledAt,
    linkedTransactionId: existing?.linkedTransactionId,
    notes: input.notes?.trim().slice(0, 2000) || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function savePersonalBalanceItem(input: PersonalBalanceInput): string {
  const now = new Date().toISOString();
  const existing = input.id
    ? snapshot.data.personalBalanceItems.find((item) => item.id === input.id)
    : undefined;
  const id = existing?.id ?? createId("personal");
  const item = cleanPersonalBalanceItem(input, existing, id, now);
  const personalBalanceItems = existing
    ? snapshot.data.personalBalanceItems.map((entry) =>
        entry.id === id ? item : entry,
      )
    : [item, ...snapshot.data.personalBalanceItems];
  commit({ ...snapshot.data, personalBalanceItems });
  return id;
}

export function deletePersonalBalanceItem(id: string): void {
  commit({
    ...snapshot.data,
    personalBalanceItems: snapshot.data.personalBalanceItems.filter(
      (item) => item.id !== id,
    ),
  });
}

export function settlePersonalBalanceItem(
  id: string,
  linkedTransactionId?: string,
): void {
  const item = snapshot.data.personalBalanceItems.find(
    (entry) => entry.id === id,
  );
  if (!item) throw new Error("Voce non trovata.");

  if (linkedTransactionId) {
    const transaction = snapshot.data.transactions.find(
      (entry) => entry.id === linkedTransactionId,
    );
    if (!transaction) throw new Error("Movimento non trovato.");
  }

  const now = new Date().toISOString();
  commit({
    ...snapshot.data,
    personalBalanceItems: snapshot.data.personalBalanceItems.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status: "settled",
            settledAt: now,
            linkedTransactionId: linkedTransactionId || undefined,
            updatedAt: now,
          }
        : entry,
    ),
  });
}

export function importBankTransactions(input: BankImportInput): ImportBatch {
  if (input.rows.length === 0) {
    throw new Error("Nessun movimento da importare.");
  }

  const now = new Date().toISOString();
  const batchId = createId("import");
  const transactions = input.rows.map((row) => {
    const transaction = cleanTransaction(
      {
        type: row.type,
        amountCents: row.amountCents,
        date: row.date,
        category: row.category,
        description: row.description,
        accountId: row.accountId,
        toAccountId: row.toAccountId,
      },
      createId("tx"),
      now,
    );
    transaction.source = "bank-import";
    transaction.importBatchId = batchId;
    transaction.originalDescription =
      row.originalDescription?.trim().slice(0, 500) ||
      row.description.trim().slice(0, 500);
    transaction.importFingerprint = row.importFingerprint;
    transaction.importedAt = now;
    return transaction;
  });

  const batch: ImportBatch = {
    id: batchId,
    fileName: input.fileName.trim().slice(0, 200),
    fileType: input.fileType,
    importedAt: now,
    transactionCount: transactions.length,
    rowCount: Math.max(input.detectedCount, transactions.length),
    skippedCount: Math.max(0, input.detectedCount - transactions.length),
  };

  const categoryRules = [...snapshot.data.categoryRules];
  const categoryCatalog = currentCategoryCatalog();
  for (const incoming of input.rulesToLearn) {
    const pattern = incoming.pattern.trim().toUpperCase().slice(0, 40);
    const definition = categoryCatalog.find(
      (item) =>
        item.id === incoming.category &&
        item.kind === incoming.kind &&
        isCategoryAvailable(item),
    );
    if (!pattern || pattern.length < 2 || !definition) continue;

    const existing = categoryRules.find(
      (rule) => rule.kind === incoming.kind && rule.pattern === pattern,
    );
    if (existing) {
      existing.category = incoming.category;
      existing.updatedAt = now;
    } else {
      categoryRules.push({
        id: createId("rule"),
        pattern,
        category: incoming.category,
        kind: incoming.kind,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  commit({
    ...snapshot.data,
    transactions: [...transactions, ...snapshot.data.transactions],
    importBatches: [...snapshot.data.importBatches, batch],
    categoryRules,
  });

  return batch;
}

export function updateCategoryRule(id: string, category: string): void {
  const rule = snapshot.data.categoryRules.find((item) => item.id === id);
  if (!rule) throw new Error("Regola non trovata.");
  const definition = currentCategoryCatalog().find(
    (item) => item.id === category && item.kind === rule.kind,
  );
  if (!definition) throw new Error("Categoria non valida per questa regola.");

  commit({
    ...snapshot.data,
    categoryRules: snapshot.data.categoryRules.map((item) =>
      item.id === id
        ? { ...item, category, updatedAt: new Date().toISOString() }
        : item,
    ),
  });
}

export function deleteCategoryRule(id: string): void {
  commit({
    ...snapshot.data,
    categoryRules: snapshot.data.categoryRules.filter((item) => item.id !== id),
  });
}

export function addCustomCategory(input: CustomCategoryInput): string {
  const name = cleanCategoryName(input.name);
  if (input.type !== "income" && input.type !== "expense") {
    throw new Error("Scegli se la categoria è per entrate o spese.");
  }
  assertCategoryNameAvailable(name, input.type);

  const now = new Date().toISOString();
  const category: CustomCategory = {
    id: createId("category"),
    name,
    type: input.type,
    createdAt: now,
    updatedAt: now,
  };
  commit({
    ...snapshot.data,
    customCategories: [...snapshot.data.customCategories, category],
  });
  return category.id;
}

export function renameCustomCategory(id: string, nextName: string): void {
  const existing = snapshot.data.customCategories.find((item) => item.id === id);
  if (!existing) throw new Error("Categoria personalizzata non trovata.");
  const name = cleanCategoryName(nextName);
  assertCategoryNameAvailable(name, existing.type, id);

  const now = new Date().toISOString();
  commit({
    ...snapshot.data,
    customCategories: snapshot.data.customCategories.map((item) =>
      item.id === id ? { ...item, name, updatedAt: now } : item,
    ),
  });
}

/** Non-destructive: the category stays in storage for historical labels. */
export function archiveCustomCategory(id: string): void {
  const existing = snapshot.data.customCategories.find((item) => item.id === id);
  if (!existing) throw new Error("Categoria personalizzata non trovata.");
  if (existing.archivedAt) return;

  const now = new Date().toISOString();
  commit({
    ...snapshot.data,
    customCategories: snapshot.data.customCategories.map((item) =>
      item.id === id ? { ...item, archivedAt: now, updatedAt: now } : item,
    ),
  });
}

export function restoreCustomCategory(id: string): void {
  const existing = snapshot.data.customCategories.find((item) => item.id === id);
  if (!existing) throw new Error("Categoria personalizzata non trovata.");
  assertCategoryNameAvailable(existing.name, existing.type, id);

  const now = new Date().toISOString();
  commit({
    ...snapshot.data,
    customCategories: snapshot.data.customCategories.map((item) =>
      item.id === id
        ? { ...item, archivedAt: undefined, updatedAt: now }
        : item,
    ),
  });
}

/** Records a preference only: no transaction or rule is modified. */
export function hideDefaultCategory(id: string): void {
  const definition = CATEGORIES.find((category) => category.id === id);
  if (!definition) throw new Error("Categoria predefinita non trovata.");
  if (snapshot.data.hiddenDefaultCategories.includes(id)) return;
  commit({
    ...snapshot.data,
    hiddenDefaultCategories: [...snapshot.data.hiddenDefaultCategories, id],
  });
}

export function restoreDefaultCategory(id: string): void {
  if (!CATEGORIES.some((category) => category.id === id)) {
    throw new Error("Categoria predefinita non trovata.");
  }
  commit({
    ...snapshot.data,
    hiddenDefaultCategories: snapshot.data.hiddenDefaultCategories.filter(
      (categoryId) => categoryId !== id,
    ),
  });
}

export function learnedRulePattern(description: string): string {
  return merchantPatternFor(description);
}

/** Kept for callers that need the rule shape without importing the type. */
export type { CategoryRule };

export function setMonthlyBudget(
  month: string,
  categories: Record<string, number>,
): void {
  const cleaned = Object.fromEntries(
    Object.entries(categories).filter(
      ([, cents]) => isSafeCents(cents) && cents > 0,
    ),
  );
  const existing = snapshot.data.monthlyBudgets.find(
    (budget) => budget.month === month,
  );
  const hasValues = Object.keys(cleaned).length > 0;

  const monthlyBudgets = hasValues
    ? existing
      ? snapshot.data.monthlyBudgets.map((budget) =>
          budget.month === month
            ? { ...budget, categories: cleaned, updatedAt: new Date().toISOString() }
            : budget,
        )
      : [
          ...snapshot.data.monthlyBudgets,
          {
            id: createId("budget"),
            month,
            categories: cleaned,
            updatedAt: new Date().toISOString(),
          },
        ]
    : snapshot.data.monthlyBudgets.filter((budget) => budget.month !== month);

  commit({ ...snapshot.data, monthlyBudgets });
}

export function saveAccount(input: AccountInput): string {
  if (!input.name.trim()) throw new Error("Dai un nome al conto.");
  if (!isSafeCents(input.currentBalanceCents)) {
    throw new Error("Saldo non valido.");
  }

  const now = new Date().toISOString();
  const existing = input.id
    ? snapshot.data.accounts.find((account) => account.id === input.id)
    : undefined;
  const id = existing?.id ?? createId("account");
  const account: Account = {
    id,
    name: input.name.trim().slice(0, 80),
    type: input.type,
    currentBalanceCents: input.currentBalanceCents,
    includeInNetWorth: input.includeInNetWorth,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const accounts = existing
    ? snapshot.data.accounts.map((item) => (item.id === id ? account : item))
    : [...snapshot.data.accounts, account];

  const balanceRelevantChange =
    !existing ||
    existing.currentBalanceCents !== account.currentBalanceCents ||
    existing.type !== account.type ||
    existing.includeInNetWorth !== account.includeInNetWorth;

  let next: BalanceData = { ...snapshot.data, accounts };
  if (balanceRelevantChange) next = upsertTodaySnapshot(next);
  commit(next);
  return id;
}

export function deleteAccount(id: string): void {
  const accounts = snapshot.data.accounts.filter((account) => account.id !== id);
  const transactions = snapshot.data.transactions.map((transaction) => ({
    ...transaction,
    accountId: transaction.accountId === id ? undefined : transaction.accountId,
    toAccountId:
      transaction.toAccountId === id ? undefined : transaction.toAccountId,
  }));
  const next = upsertTodaySnapshot({
    ...snapshot.data,
    accounts,
    transactions,
  });
  commit(next);
}

export function captureSnapshot(): boolean {
  const next = upsertTodaySnapshot(snapshot.data);
  if (next === snapshot.data) return false;
  commit(next);
  return true;
}

function upsertTodaySnapshot(data: BalanceData): BalanceData {
  const totals = calculateNetWorth(data.accounts);
  if (!totals.hasIncludedAccounts) return data;

  const today = todayISO();
  const existing = data.netWorthSnapshots.find(
    (snapshotItem) => snapshotItem.date === today,
  );
  const accounts = totals.includedAccounts.map((account) => ({
    accountId: account.id,
    name: account.name,
    type: account.type,
    balanceCents: account.currentBalanceCents,
    includeInNetWorth: true,
  }));
  const unchanged =
    existing !== undefined &&
    existing.totalCents === totals.totalCents &&
    existing.liquidCents === totals.liquidCents &&
    existing.investmentsCents === totals.investmentsCents &&
    existing.accounts.length === accounts.length &&
    accounts.every((account, index) => {
      const saved = existing.accounts[index];
      return (
        saved !== undefined &&
        saved.accountId === account.accountId &&
        saved.name === account.name &&
        saved.type === account.type &&
        saved.balanceCents === account.balanceCents &&
        saved.includeInNetWorth === account.includeInNetWorth
      );
    });
  if (unchanged) return data;

  const updatedSnapshot = {
    id: existing?.id ?? createId("snapshot"),
    date: today,
    totalCents: totals.totalCents,
    liquidCents: totals.liquidCents,
    investmentsCents: totals.investmentsCents,
    accounts,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  return {
    ...data,
    netWorthSnapshots: existing
      ? data.netWorthSnapshots.map((item) =>
          item.date === today ? updatedSnapshot : item,
        )
      : [...data.netWorthSnapshots, updatedSnapshot],
  };
}

export function replaceAllData(data: BalanceData): void {
  commit({
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export function mergeImportedData(data: BalanceData): void {
  commit(mergeBalanceData(snapshot.data, data));
}

export function updateSettings(patch: Partial<Settings>): void {
  commit({
    ...snapshot.data,
    settings: { ...snapshot.data.settings, ...patch },
  });
}

export function deleteAllData(): void {
  if (storageMode === "cloud" && cloudUserId) {
    const data = createEmptyData();
    data.updatedAt = new Date().toISOString();
    commit(data);
    publish({ loadInfo: { status: "empty", data, issues: [] } });
    return;
  }

  clearAllStorage();
  const data = createEmptyData();
  data.updatedAt = new Date().toISOString();
  const emptyLoadInfo: LoadInfo = { status: "empty", data, issues: [] };
  publish(
    { hydrated: true, loadInfo: emptyLoadInfo, storageError: null },
    data,
  );
}

export function clearStorageError(): void {
  if (!snapshot.storageError) return;
  publish({ storageError: null });
}

export function updateRecoveryStatus(status: "empty"): void {
  publish({ loadInfo: { status, data: snapshot.data, issues: [] } });
}
