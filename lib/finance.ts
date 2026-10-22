import type {
  Account,
  BudgetRow,
  BudgetStatus,
  HistoricalMonthlySummary,
  MonthSummary,
  MonthlyBudget,
  NetWorthSnapshot,
  NetWorthTotals,
  Transaction,
  TransactionType,
} from "./types";
import { monthKeyFromDate } from "./dates";
import { clampRatio, ratio, sumCents } from "./money";

export function transactionsForMonth(
  transactions: Transaction[],
  month: string,
): Transaction[] {
  return transactions.filter((t) => monthKeyFromDate(t.date) === month);
}

export function sortTransactions(
  transactions: Transaction[],
): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function groupTransactionsByDate(
  transactions: Transaction[],
): { date: string; items: Transaction[] }[] {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of sortTransactions(transactions)) {
    const list = groups.get(transaction.date) ?? [];
    list.push(transaction);
    groups.set(transaction.date, list);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
}

function addToCategory(
  target: Record<string, number>,
  category: string,
  cents: number,
): void {
  target[category] = (target[category] ?? 0) + cents;
}

export function summarizeTransactions(
  transactions: Transaction[],
  month: string,
): MonthSummary {
  const items = transactionsForMonth(transactions, month);
  const incomeByCategory: Record<string, number> = {};
  const expenseByCategory: Record<string, number> = {};
  let incomeCents = 0;
  let expenseCents = 0;

  for (const item of items) {
    if (item.type === "transfer") continue;
    if (item.type === "income") {
      incomeCents += item.amountCents;
      addToCategory(
        incomeByCategory,
        item.category ?? "altro-entrata",
        item.amountCents,
      );
    } else {
      expenseCents += item.amountCents;
      addToCategory(
        expenseByCategory,
        item.category ?? "altro-spesa",
        item.amountCents,
      );
    }
  }

  return {
    month,
    source: items.length > 0 ? "transactions" : "empty",
    incomeCents,
    expenseCents,
    savingsCents: incomeCents - expenseCents,
    incomeByCategory,
    expenseByCategory,
    transactionCount: items.length,
  };
}

export function summarizeHistorical(
  summary: HistoricalMonthlySummary,
  month: string,
): MonthSummary {
  return {
    month,
    source: "historical",
    incomeCents: summary.totalIncomeCents,
    expenseCents: summary.totalExpensesCents,
    savingsCents: summary.savingsCents,
    incomeByCategory: { ...summary.incomeByCategory },
    expenseByCategory: { ...summary.expenseByCategory },
    transactionCount: 0,
  };
}

export function emptyMonthSummary(month: string): MonthSummary {
  return {
    month,
    source: "empty",
    incomeCents: 0,
    expenseCents: 0,
    savingsCents: 0,
    incomeByCategory: {},
    expenseByCategory: {},
    transactionCount: 0,
  };
}

/**
 * A month is described by real transactions when it has at least one income or
 * expense. Otherwise an imported historical aggregate is used. This guarantees
 * historical totals and transaction-level data are never counted together.
 */
export function getMonthSummary(
  month: string,
  transactions: Transaction[],
  historicalSummaries: HistoricalMonthlySummary[],
): MonthSummary {
  const items = transactionsForMonth(transactions, month);
  const hasIncomeOrExpense = items.some((t) => t.type !== "transfer");
  if (hasIncomeOrExpense) {
    return summarizeTransactions(transactions, month);
  }
  const historical = historicalSummaries.find((h) => h.month === month);
  if (historical) return summarizeHistorical(historical, month);
  if (items.length > 0) return summarizeTransactions(transactions, month);
  return emptyMonthSummary(month);
}

export function getBudgetForMonth(
  budgets: MonthlyBudget[],
  month: string,
): MonthlyBudget | undefined {
  return budgets.find((budget) => budget.month === month);
}

export function calculateBudgetStatus(
  budget: MonthlyBudget | undefined,
  expenseByCategory: Record<string, number>,
  categoryIds: string[],
): BudgetStatus {
  if (!budget) {
    return {
      rows: [],
      totalBudgetCents: 0,
      totalSpentCents: 0,
      totalRemainingCents: 0,
      progress: 0,
      isOver: false,
      hasBudget: false,
    };
  }

  const rows: BudgetRow[] = categoryIds
    .filter((id) => (budget.categories[id] ?? 0) > 0)
    .map((categoryId) => {
      const budgetCents = budget.categories[categoryId] ?? 0;
      const spentCents = expenseByCategory[categoryId] ?? 0;
      const remainingCents = budgetCents - spentCents;
      return {
        categoryId,
        budgetCents,
        spentCents,
        remainingCents,
        progress: ratio(spentCents, budgetCents),
        isOver: spentCents > budgetCents,
      };
    });

  const totalBudgetCents = sumCents(rows.map((row) => row.budgetCents));
  const totalSpentCents = sumCents(rows.map((row) => row.spentCents));
  const totalRemainingCents = totalBudgetCents - totalSpentCents;

  return {
    rows,
    totalBudgetCents,
    totalSpentCents,
    totalRemainingCents,
    progress: clampRatio(ratio(totalSpentCents, totalBudgetCents)),
    isOver: totalSpentCents > totalBudgetCents,
    hasBudget: rows.length > 0,
  };
}

export function spendingWithoutBudget(
  budget: MonthlyBudget | undefined,
  expenseByCategory: Record<string, number>,
  categoryIds: string[],
): { categoryId: string; spentCents: number }[] {
  return categoryIds
    .filter((id) => (budget?.categories[id] ?? 0) <= 0)
    .map((categoryId) => ({
      categoryId,
      spentCents: expenseByCategory[categoryId] ?? 0,
    }))
    .filter((row) => row.spentCents > 0);
}

export function calculateNetWorth(accounts: Account[]): NetWorthTotals {
  const includedAccounts = accounts.filter((account) => account.includeInNetWorth);
  const investmentsCents = sumCents(
    includedAccounts
      .filter((account) => account.type === "investment")
      .map((account) => account.currentBalanceCents),
  );
  const liquidCents = sumCents(
    includedAccounts
      .filter((account) => account.type !== "investment")
      .map((account) => account.currentBalanceCents),
  );
  return {
    totalCents: liquidCents + investmentsCents,
    liquidCents,
    investmentsCents,
    includedAccounts,
    hasIncludedAccounts: includedAccounts.length > 0,
  };
}

export function sortSnapshots(
  snapshots: NetWorthSnapshot[],
): NetWorthSnapshot[] {
  return [...snapshots].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

export function latestSnapshot(
  snapshots: NetWorthSnapshot[],
): NetWorthSnapshot | undefined {
  return sortSnapshots(snapshots).at(-1);
}

export function snapshotChange(
  snapshots: NetWorthSnapshot[],
): { changeCents: number; from: NetWorthSnapshot; to: NetWorthSnapshot } | null {
  const sorted = sortSnapshots(snapshots);
  if (sorted.length < 2) return null;
  const to = sorted[sorted.length - 1];
  const from = sorted[sorted.length - 2];
  return { changeCents: to.totalCents - from.totalCents, from, to };
}

export function savingsRate(summary: MonthSummary): number | null {
  if (summary.incomeCents <= 0) return null;
  return summary.savingsCents / summary.incomeCents;
}

export function largestExpenseCategory(
  summary: MonthSummary,
): { categoryId: string; cents: number; share: number } | null {
  const entries = Object.entries(summary.expenseByCategory).filter(
    ([, cents]) => cents > 0,
  );
  if (entries.length === 0 || summary.expenseCents <= 0) return null;
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const [categoryId, cents] = entries[0];
  return { categoryId, cents, share: cents / summary.expenseCents };
}

export function countByType(
  transactions: Transaction[],
): Record<TransactionType, number> {
  return transactions.reduce(
    (acc, transaction) => {
      acc[transaction.type] += 1;
      return acc;
    },
    { income: 0, expense: 0, transfer: 0 } as Record<TransactionType, number>,
  );
}

export function recentTransactions(
  transactions: Transaction[],
  limit: number,
): Transaction[] {
  return sortTransactions(transactions).slice(0, limit);
}

export function monthlySpendingHistory(
  transactions: Transaction[],
  historicalSummaries: HistoricalMonthlySummary[],
  months: string[],
): { month: string; expenseCents: number; hasData: boolean }[] {
  return months.map((month) => {
    const summary = getMonthSummary(month, transactions, historicalSummaries);
    return {
      month,
      expenseCents: summary.expenseCents,
      hasData: summary.source !== "empty",
    };
  });
}
