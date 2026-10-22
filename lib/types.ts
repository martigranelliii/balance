export const CURRENT_VERSION = 1 as const;
export const STORAGE_KEY = "balance.v1";
export const RECOVERY_KEY = "balance.v1.recovery";

export type TransactionType = "income" | "expense" | "transfer";
export type Reflection = "yes" | "neutral" | "no";
export type TransactionSource = "manual" | "bank-import";

export interface Transaction {
  id: string;
  /** Local calendar date, YYYY-MM-DD. Never a UTC timestamp. */
  date: string;
  type: TransactionType;
  /** Positive integer cents. Direction is expressed by `type`. */
  amountCents: number;
  category: string | null;
  subcategory?: string;
  description?: string;
  notes?: string;
  accountId?: string | null;
  toAccountId?: string | null;
  reflection?: Reflection;
  /** Where the transaction came from. Older records may omit this field. */
  source?: TransactionSource;
  /** Bank import traceability. Never shown as technical detail in the UI. */
  importBatchId?: string;
  originalDescription?: string;
  importFingerprint?: string;
  importedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRule {
  id: string;
  /** Normalized merchant or description fragment, uppercase. */
  pattern: string;
  category: string;
  kind: "income" | "expense";
  createdAt: string;
  updatedAt: string;
}

/**
 * User-created category. Archiving is non-destructive: the record stays here so
 * historical transactions keep their label, but it is not offered for new ones.
 */
export interface CustomCategory {
  id: string;
  name: string;
  type: "income" | "expense";
  /** ISO timestamp. When present, the category is archived. */
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  fileType: "csv" | "xlsx";
  importedAt: string;
  /** Number of transactions actually written. */
  transactionCount: number;
  /** Number of data rows found before exclusions. */
  rowCount: number;
  /** Rows skipped or left out during review. */
  skippedCount: number;
}

export interface MonthlyBudget {
  id: string;
  /** YYYY-MM */
  month: string;
  /** Expense category id -> integer cents. Categories with no budget are omitted. */
  categories: Record<string, number>;
  updatedAt: string;
}

export type BusinessTripExpenseCategory =
  | "hotel"
  | "pranzo"
  | "cena"
  | "treno"
  | "pedaggio"
  | "parcheggio"
  | "altro";

export interface BusinessTripExpense {
  id: string;
  category: BusinessTripExpenseCategory;
  /** Positive integer cents. This is an advance, not a bank transaction. */
  amountCents: number;
  description?: string;
}

export type BusinessTripStatus = "open" | "reimbursed";

export interface BusinessTrip {
  id: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  title: string;
  location?: string;
  notes?: string;
  expenses: BusinessTripExpense[];
  kilometers?: number;
  /**
   * Tariffa chilometrica in millesimi di euro per km: 488 = €0,488/km.
   * Non è un importo in centesimi, perché le tariffe reali hanno tre decimali.
   * Il rimborso calcolato resta invece in centesimi interi.
   */
  ratePerKmMills?: number;
  /** Positive integer cents. */
  allowanceCents?: number;
  /** YYYY-MM. Default: trip month + 2 months. */
  expectedSettlementMonth?: string;
  status: BusinessTripStatus;
  reimbursedAt?: string;
  linkedSalaryTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export type PersonalBalanceDirection = "receivable" | "payable";
export type PersonalBalanceStatus = "open" | "settled";

export interface PersonalBalanceItem {
  id: string;
  direction: PersonalBalanceDirection;
  person: string;
  description: string;
  /** Positive integer cents. This does not change income or expenses. */
  amountCents: number;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local calendar date, YYYY-MM-DD. */
  dueDate?: string;
  status: PersonalBalanceStatus;
  settledAt?: string;
  linkedTransactionId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "investment"
  | "wallet"
  | "other";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currentBalanceCents: number;
  includeInNetWorth: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SnapshotAccount {
  accountId: string;
  name: string;
  type: AccountType;
  balanceCents: number;
  includeInNetWorth: boolean;
}

export interface NetWorthSnapshot {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  totalCents: number;
  liquidCents: number;
  investmentsCents: number;
  accounts: SnapshotAccount[];
  createdAt: string;
}

export interface HistoricalMonthlySummary {
  id: string;
  /** YYYY-MM */
  month: string;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  totalIncomeCents: number;
  totalExpensesCents: number;
  savingsCents: number;
  source: "historical-import";
  createdAt: string;
}

export interface Settings {
  currency: "EUR";
  locale: "it-IT";
  reflectionEnabled: boolean;
  /** Default business-trip rate in millesimi di euro per km (488 = €0,488). */
  defaultRatePerKmMills: number;
}

export interface BalanceData {
  version: number;
  transactions: Transaction[];
  monthlyBudgets: MonthlyBudget[];
  accounts: Account[];
  netWorthSnapshots: NetWorthSnapshot[];
  historicalMonthlySummaries: HistoricalMonthlySummary[];
  categoryRules: CategoryRule[];
  importBatches: ImportBatch[];
  /** User categories, including archived ones. Additive and optional on load. */
  customCategories: CustomCategory[];
  /** Default category ids hidden by this user. Additive and optional on load. */
  hiddenDefaultCategories: string[];
  businessTrips: BusinessTrip[];
  personalBalanceItems: PersonalBalanceItem[];
  settings: Settings;
  updatedAt: string;
}

export type MonthSource = "transactions" | "historical" | "empty";

export interface MonthSummary {
  month: string;
  source: MonthSource;
  incomeCents: number;
  expenseCents: number;
  savingsCents: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  transactionCount: number;
}

export interface BudgetRow {
  categoryId: string;
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  progress: number;
  isOver: boolean;
}

export interface BudgetStatus {
  rows: BudgetRow[];
  totalBudgetCents: number;
  totalSpentCents: number;
  totalRemainingCents: number;
  progress: number;
  isOver: boolean;
  hasBudget: boolean;
}

export interface NetWorthTotals {
  totalCents: number;
  liquidCents: number;
  investmentsCents: number;
  includedAccounts: Account[];
  hasIncludedAccounts: boolean;
}

export interface BackupFile {
  app: "balance";
  version: number;
  exportedAt: string;
  data: BalanceData;
  totals?: {
    transactions: number;
    accounts: number;
  };
}

export interface BackupSummary {
  transactionCount: number;
  accountCount: number;
  budgetMonthCount: number;
  snapshotCount: number;
  historicalMonthCount: number;
  ruleCount: number;
  importBatchCount: number;
  customCategoryCount: number;
  hiddenCategoryCount: number;
  businessTripCount: number;
  personalBalanceCount: number;
  updatedAt: string;
}

export interface NormalizationResult {
  data: BalanceData;
  issues: string[];
}

export interface LoadResult {
  status: "empty" | "ok" | "recovered" | "corrupt";
  data: BalanceData;
  issues: string[];
  raw?: string;
}
