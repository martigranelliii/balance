import { describe, expect, it } from "vitest";
import type {
  Account,
  HistoricalMonthlySummary,
  MonthlyBudget,
  Transaction,
} from "../lib/types";
import {
  calculateBudgetStatus,
  calculateNetWorth,
  getMonthSummary,
  savingsRate,
  snapshotSeries,
  summarizeTransactions,
  summarizeYear,
} from "../lib/finance";
import {
  formatMoney,
  parseAmountToCents,
  sumCents,
} from "../lib/money";
import {
  addMonths,
  currentMonthKey,
  daysInMonth,
  isISODate,
  monthKeyFromDate,
  toISODate,
} from "../lib/dates";
import { createEmptyData } from "../lib/storage";
import {
  captureSnapshot,
  getSnapshot,
  replaceAllData,
  updateSettings,
} from "../lib/store";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "tx_1",
    date: "2026-10-05",
    type: "expense",
    amountCents: 1250,
    category: "cibo",
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:00:00.000Z",
    ...overrides,
  };
}

function account(overrides: Partial<Account>): Account {
  return {
    id: "acc_1",
    name: "Conto",
    type: "checking",
    currentBalanceCents: 100000,
    includeInNetWorth: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function getSnapshotSnapshots() {
  return getSnapshot().data.netWorthSnapshots;
}

const historical: HistoricalMonthlySummary = {
  id: "historical-2026-09",
  month: "2026-09",
  incomeByCategory: { stipendio: 150000 },
  expenseByCategory: { cibo: 40000 },
  totalIncomeCents: 150000,
  totalExpensesCents: 40000,
  savingsCents: 110000,
  source: "historical-import",
  createdAt: "2026-10-01T00:00:00.000Z",
};

describe("monthly summaries", () => {
  it("sums income by category", () => {
    const summary = summarizeTransactions(
      [
        tx({ id: "a", type: "income", category: "stipendio", amountCents: 150000 }),
        tx({ id: "b", type: "income", category: "vinted", amountCents: 2500 }),
      ],
      "2026-10",
    );
    expect(summary.incomeCents).toBe(152500);
    expect(summary.incomeByCategory).toEqual({ stipendio: 150000, vinted: 2500 });
    expect(summary.expenseCents).toBe(0);
  });

  it("sums expenses by category", () => {
    const summary = summarizeTransactions(
      [
        tx({ id: "a", amountCents: 1250, category: "cibo" }),
        tx({ id: "b", amountCents: 220, category: "trasporti" }),
        tx({ id: "c", amountCents: 3000, category: "cibo" }),
      ],
      "2026-10",
    );
    expect(summary.expenseCents).toBe(4470);
    expect(summary.expenseByCategory).toEqual({ cibo: 4250, trasporti: 220 });
  });

  it("never counts transfers as income or expenses", () => {
    const summary = summarizeTransactions(
      [
        tx({ id: "a", type: "income", category: "stipendio", amountCents: 100000 }),
        tx({ id: "b", amountCents: 2500, category: "cibo" }),
        tx({
          id: "c",
          type: "transfer",
          category: null,
          amountCents: 40000,
          accountId: "bank",
          toAccountId: "investments",
        }),
      ],
      "2026-10",
    );
    expect(summary.incomeCents).toBe(100000);
    expect(summary.expenseCents).toBe(2500);
    expect(summary.transactionCount).toBe(3);
  });

  it("calculates savings as income minus expenses", () => {
    const summary = summarizeTransactions(
      [
        tx({ id: "a", type: "income", category: "stipendio", amountCents: 150000 }),
        tx({ id: "b", amountCents: 42000, category: "cibo" }),
      ],
      "2026-10",
    );
    expect(summary.savingsCents).toBe(108000);
  });

  it("excludes transactions from other months", () => {
    const summary = summarizeTransactions(
      [
        tx({ id: "a", date: "2026-10-31", amountCents: 1000 }),
        tx({ id: "b", date: "2026-11-01", amountCents: 2000 }),
      ],
      "2026-10",
    );
    expect(summary.expenseCents).toBe(1000);
    expect(summary.transactionCount).toBe(1);
  });
});

describe("budgets", () => {
  const budget: MonthlyBudget = {
    id: "budget-2026-10",
    month: "2026-10",
    categories: { cibo: 9000, vestiti: 3000, trasporti: 5000 },
    updatedAt: "2026-10-01T00:00:00.000Z",
  };

  it("computes spent, remaining and progress per category", () => {
    const status = calculateBudgetStatus(
      budget,
      { cibo: 6300, vestiti: 2800, trasporti: 1400 },
      ["cibo", "vestiti", "trasporti"],
    );
    expect(status.rows[0]).toMatchObject({
      categoryId: "cibo",
      budgetCents: 9000,
      spentCents: 6300,
      remainingCents: 2700,
      isOver: false,
    });
    expect(status.rows[0].progress).toBeCloseTo(0.7);
    expect(status.totalBudgetCents).toBe(17000);
    expect(status.totalSpentCents).toBe(10500);
    expect(status.totalRemainingCents).toBe(6500);
    expect(status.isOver).toBe(false);
  });

  it("reports over-budget without losing the real remaining amount", () => {
    const status = calculateBudgetStatus(
      budget,
      { cibo: 12000, vestiti: 0, trasporti: 0 },
      ["cibo", "vestiti", "trasporti"],
    );
    expect(status.rows[0].remainingCents).toBe(-3000);
    expect(status.rows[0].isOver).toBe(true);
    // The total still has room because the other budgeted categories are
    // untouched; only the category itself is over.
    expect(status.totalRemainingCents).toBe(5000);
    expect(status.isOver).toBe(false);
  });

  it("has a clear empty budget state", () => {
    const status = calculateBudgetStatus(undefined, {}, ["cibo"]);
    expect(status.hasBudget).toBe(false);
    expect(status.rows).toEqual([]);
  });
});

describe("integer cents", () => {
  it("parses Italian and English amounts without floating point drift", () => {
    expect(parseAmountToCents("12,50")).toBe(1250);
    expect(parseAmountToCents("12.50")).toBe(1250);
    expect(parseAmountToCents("€ 1.234,56")).toBe(123456);
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents("0,10")).toBe(10);
    expect(parseAmountToCents("12,505")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("")).toBeNull();
  });

  it("adds cents deterministically", () => {
    expect(sumCents([10, 20, 30])).toBe(60);
    expect(sumCents([0.1 as number, 0.2 as number])).toBe(0);
    expect(10 + 20).toBe(30);
  });

  it("formats money for display", () => {
    expect(formatMoney(1250)).toBe("€12,50");
    expect(formatMoney(-1250)).toBe("−€12,50");
    expect(formatMoney(123456)).toBe("€1.234,56");
  });
});

describe("month boundaries and dates", () => {
  it("stores local calendar dates, not UTC-shifted dates", () => {
    const lateEvening = new Date(2026, 9, 31, 23, 30);
    const earlyMorning = new Date(2026, 10, 1, 0, 15);
    expect(toISODate(lateEvening)).toBe("2026-10-31");
    expect(toISODate(earlyMorning)).toBe("2026-11-01");
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2024-02-29")).toBe(true);
  });

  it("navigates across year boundaries", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(daysInMonth("2024-02")).toBe(29);
    expect(monthKeyFromDate("2026-10-31")).toBe("2026-10");
    expect(currentMonthKey(new Date(2026, 9, 21))).toBe("2026-10");
  });
});

describe("net worth and savings rate", () => {
  it("derives liquid and investment totals from included accounts", () => {
    const totals = calculateNetWorth([
      account({ id: "bank", type: "checking", currentBalanceCents: 50000 }),
      account({ id: "inv", type: "investment", currentBalanceCents: 100000 }),
      account({
        id: "hidden",
        type: "savings",
        currentBalanceCents: 30000,
        includeInNetWorth: false,
      }),
    ]);
    expect(totals.liquidCents).toBe(50000);
    expect(totals.investmentsCents).toBe(100000);
    expect(totals.totalCents).toBe(150000);
    expect(totals.includedAccounts).toHaveLength(2);
    expect(totals.hasIncludedAccounts).toBe(true);
  });

  it("splits positive assets from negative liabilities", () => {
    const totals = calculateNetWorth([
      account({ id: "bank", currentBalanceCents: 50000 }),
      account({ id: "card", currentBalanceCents: -12500 }),
      account({ id: "inv", type: "investment", currentBalanceCents: 100000 }),
    ]);
    expect(totals.assetsCents).toBe(150000);
    expect(totals.liabilitiesCents).toBe(12500);
    expect(totals.totalCents).toBe(137500);
  });

  it("keeps one deterministic point per snapshot day without deleting records", () => {
    const snapshots = [
      {
        id: "s1",
        date: "2026-10-20",
        totalCents: 100000,
        liquidCents: 100000,
        investmentsCents: 0,
        accounts: [],
        createdAt: "2026-10-20T08:00:00.000Z",
      },
      {
        id: "s2",
        date: "2026-10-20",
        totalCents: 110000,
        liquidCents: 110000,
        investmentsCents: 0,
        accounts: [],
        createdAt: "2026-10-20T18:00:00.000Z",
      },
      {
        id: "s3",
        date: "2026-10-21",
        totalCents: 120000,
        liquidCents: 120000,
        investmentsCents: 0,
        accounts: [],
        createdAt: "2026-10-21T08:00:00.000Z",
      },
    ];
    const series = snapshotSeries(snapshots);
    expect(series).toHaveLength(2);
    expect(series[0].id).toBe("s2");
    expect(series[1].id).toBe("s3");
    expect(snapshots).toHaveLength(3);
  });

  it("handles the empty net-worth state", () => {
    const totals = calculateNetWorth([]);
    expect(totals.totalCents).toBe(0);
    expect(totals.hasIncludedAccounts).toBe(false);
  });

  it("does not create history without accounts and deduplicates today's snapshot", () => {
    replaceAllData(createEmptyData());
    expect(captureSnapshot()).toBe(false);
    expect(getSnapshotSnapshots()).toHaveLength(0);

    replaceAllData({
      ...createEmptyData(),
      accounts: [
        account({ id: "bank", currentBalanceCents: 50000 }),
        account({ id: "card", currentBalanceCents: -12500 }),
      ],
    });
    expect(captureSnapshot()).toBe(true);
    expect(captureSnapshot()).toBe(false);

    const snapshots = getSnapshotSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].totalCents).toBe(37500);
    expect(snapshots[0].accounts).toHaveLength(2);
    expect(snapshots[0].accounts.map((item) => item.accountId)).toEqual([
      "bank",
      "card",
    ]);
  });

  it("keeps the chosen theme in the persisted settings", () => {
    replaceAllData(createEmptyData());
    updateSettings({ theme: "sage" });
    expect(getSnapshot().data.settings.theme).toBe("sage");
    expect(getSnapshot().data.settings.currency).toBe("EUR");
  });

  it("calculates savings rate only when income exists", () => {
    const summary = summarizeTransactions(
      [
        tx({ id: "a", type: "income", category: "stipendio", amountCents: 200000 }),
        tx({ id: "b", amountCents: 150000, category: "cibo" }),
      ],
      "2026-10",
    );
    expect(savingsRate(summary)).toBe(0.25);
    expect(savingsRate(getMonthSummary("2026-10", [], []))).toBeNull();
  });
});

describe("historical summaries", () => {
  it("uses historical aggregates when a month has no real income/expense", () => {
    const summary = getMonthSummary("2026-09", [], [historical]);
    expect(summary.source).toBe("historical");
    expect(summary.incomeCents).toBe(150000);
    expect(summary.expenseCents).toBe(40000);
    expect(summary.savingsCents).toBe(110000);
  });

  it("does not double count historical and transaction data", () => {
    const summary = getMonthSummary(
      "2026-09",
      [
        tx({
          id: "real",
          date: "2026-09-12",
          type: "income",
          category: "stipendio",
          amountCents: 100000,
        }),
      ],
      [historical],
    );
    expect(summary.source).toBe("transactions");
    expect(summary.incomeCents).toBe(100000);
    expect(summary.expenseCents).toBe(0);
  });
});

describe("annual summaries", () => {
  it("sums net savings for every month in the year", () => {
    const annual = summarizeYear(
      "2026",
      [
        tx({
          id: "jan-income",
          date: "2026-01-03",
          type: "income",
          category: "stipendio",
          amountCents: 200000,
        }),
        tx({ id: "jan-expense", date: "2026-01-04", amountCents: 50000 }),
        tx({
          id: "feb-income",
          date: "2026-02-03",
          type: "income",
          category: "stipendio",
          amountCents: 150000,
        }),
        tx({ id: "feb-expense", date: "2026-02-04", amountCents: 90000 }),
        tx({
          id: "previous-year",
          date: "2025-12-31",
          type: "income",
          category: "stipendio",
          amountCents: 999999,
        }),
        tx({
          id: "next-year",
          date: "2027-01-01",
          type: "income",
          category: "stipendio",
          amountCents: 888888,
        }),
      ],
      [],
    );

    expect(annual.incomeCents).toBe(350000);
    expect(annual.expenseCents).toBe(140000);
    expect(annual.savingsCents).toBe(210000);
    expect(annual.incomeByCategory).toEqual({ stipendio: 350000 });
    expect(annual.expenseByCategory).toEqual({ cibo: 140000 });
    expect(annual.monthsWithData).toEqual(["2026-01", "2026-02"]);
  });

  it("includes historical months and excludes transfers", () => {
    const annual = summarizeYear(
      "2026",
      [
        tx({
          id: "jan-income",
          date: "2026-01-05",
          type: "income",
          category: "stipendio",
          amountCents: 100000,
        }),
        tx({ id: "jan-expense", date: "2026-01-06", amountCents: 30000 }),
        tx({
          id: "transfer",
          date: "2026-01-07",
          type: "transfer",
          category: null,
          amountCents: 40000,
          accountId: "bank",
          toAccountId: "investments",
        }),
      ],
      [historical],
    );

    expect(annual.incomeCents).toBe(250000);
    expect(annual.expenseCents).toBe(70000);
    expect(annual.savingsCents).toBe(180000);
    expect(annual.incomeByCategory).toEqual({ stipendio: 250000 });
    expect(annual.expenseByCategory).toEqual({ cibo: 70000 });
    expect(annual.monthsWithData).toEqual(["2026-01", "2026-09"]);
  });

  it("returns an empty year when there is no data", () => {
    expect(summarizeYear("2024", [], [])).toEqual({
      year: "2024",
      incomeCents: 0,
      expenseCents: 0,
      savingsCents: 0,
      incomeByCategory: {},
      expenseByCategory: {},
      monthsWithData: [],
    });
  });
});
