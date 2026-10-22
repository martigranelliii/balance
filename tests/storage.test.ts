import { describe, expect, it } from "vitest";
import { normalizeBalanceData } from "../lib/storage";
import {
  createBackup,
  mergeBalanceData,
  parseBackup,
  serializeBackup,
} from "../lib/backup";
import { createEmptyData } from "../lib/storage";
import type { BalanceData, Transaction } from "../lib/types";
import { buildHistoricalSummary } from "../lib/import/historical";

function validTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx_valid",
    date: "2026-10-05",
    type: "expense",
    amountCents: 1250,
    category: "cibo",
    description: "Pranzo",
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:00:00.000Z",
    ...overrides,
  };
}

function dataWithTransaction(transaction = validTransaction()): BalanceData {
  const data = createEmptyData();
  return { ...data, transactions: [transaction] };
}

describe("malformed stored data", () => {
  it("drops broken records without throwing or losing readable ones", () => {
    const raw = {
      version: 1,
      transactions: [
        validTransaction(),
        { id: "bad_date", date: "05/10/2026", type: "expense", amountCents: 100 },
        { id: "bad_amount", date: "2026-10-05", type: "expense", amountCents: -5 },
        null,
        "nope",
      ],
      accounts: "not-an-array",
      monthlyBudgets: [
        { month: "2026-13", categories: { cibo: 9000 } },
        { id: "b1", month: "2026-10", categories: { cibo: 9000, broken: -1 } },
      ],
      netWorthSnapshots: [{ date: "invalid" }],
      historicalMonthlySummaries: [{ month: "nope" }],
      settings: { reflectionEnabled: false },
      updatedAt: "not-a-date",
    };

    const result = normalizeBalanceData(raw);
    expect(result.data.transactions).toHaveLength(1);
    expect(result.data.transactions[0].id).toBe("tx_valid");
    expect(result.data.accounts).toEqual([]);
    expect(result.data.monthlyBudgets).toHaveLength(1);
    expect(result.data.monthlyBudgets[0].categories).toEqual({ cibo: 9000 });
    expect(result.data.netWorthSnapshots).toEqual([]);
    expect(result.data.historicalMonthlySummaries).toEqual([]);
    expect(result.data.settings.reflectionEnabled).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("keeps one record when stored IDs are duplicated", () => {
    const result = normalizeBalanceData({
      version: 1,
      transactions: [validTransaction(), validTransaction()],
    });
    expect(result.data.transactions).toHaveLength(1);
    expect(result.issues.some((issue) => issue.includes("duplicato"))).toBe(true);
  });

  it("refuses a newer data version instead of guessing", () => {
    expect(() => normalizeBalanceData({ version: 99, transactions: [] })).toThrow(
      /versione più recente/i,
    );
  });

  it("tolerates missing collections", () => {
    const result = normalizeBalanceData({ version: 1 });
    expect(result.data.transactions).toEqual([]);
    expect(result.data.accounts).toEqual([]);
    expect(result.data.settings.currency).toBe("EUR");
  });
});

describe("backup and restore", () => {
  it("round-trips a valid backup", () => {
    const data = dataWithTransaction();
    const parsed = parseBackup(serializeBackup(data));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.transactionCount).toBe(1);
    expect(parsed.data.transactions[0].amountCents).toBe(1250);
  });

  it("rejects invalid JSON and invalid records before writing", () => {
    expect(parseBackup("{nope").ok).toBe(false);
    const invalid = parseBackup(
      JSON.stringify({
        app: "balance",
        version: 1,
        data: {
          version: 1,
          transactions: [
            { id: "bad", date: "not-a-date", type: "expense", amountCents: 500 },
          ],
        },
      }),
    );
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.errors.join(" ")).toMatch(/non validi/i);
  });

  it("rejects a backup from a newer app version", () => {
    const result = parseBackup(
      JSON.stringify({ app: "balance", version: 2, data: { version: 2 } }),
    );
    expect(result.ok).toBe(false);
  });

  it("merges without duplicating IDs, months or snapshot dates", () => {
    const current = dataWithTransaction();
    const incomingData: BalanceData = {
      ...createEmptyData(),
      transactions: [
        validTransaction(),
        validTransaction({ id: "tx_new", amountCents: 500 }),
      ],
      monthlyBudgets: [
        {
          id: "budget-2026-10",
          month: "2026-10",
          categories: { cibo: 9000 },
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      netWorthSnapshots: [
        {
          id: "snap_1",
          date: "2026-10-20",
          totalCents: 100000,
          liquidCents: 100000,
          investmentsCents: 0,
          accounts: [],
          createdAt: "2026-10-20T10:00:00.000Z",
        },
      ],
    };
    const merged = mergeBalanceData(current, incomingData);
    expect(merged.transactions).toHaveLength(2);
    expect(merged.monthlyBudgets).toHaveLength(1);
    expect(merged.netWorthSnapshots).toHaveLength(1);

    const mergedAgain = mergeBalanceData(merged, incomingData);
    expect(mergedAgain.transactions).toHaveLength(2);
    expect(mergedAgain.monthlyBudgets).toHaveLength(1);
    expect(mergedAgain.netWorthSnapshots).toHaveLength(1);
  });
});

describe("historical import boundary", () => {
  it("builds aggregate history without inventing transactions", () => {
    const summary = buildHistoricalSummary({
      month: "2026-08",
      incomeByCategory: { stipendio: 150000, vinted: 5000 },
      expenseByCategory: { cibo: 30000 },
    });
    expect(summary.totalIncomeCents).toBe(155000);
    expect(summary.totalExpensesCents).toBe(30000);
    expect(summary.savingsCents).toBe(125000);
    expect(summary.source).toBe("historical-import");
  });

  it("stops an import when aggregate totals disagree with categories", () => {
    expect(() =>
      buildHistoricalSummary({
        month: "2026-08",
        incomeByCategory: { stipendio: 150000 },
        totalIncomeCents: 140000,
      }),
    ).toThrow(/non coincide/i);
  });
});

describe("backup structure", () => {
  it("declares app, version and export date", () => {
    const backup = createBackup(dataWithTransaction(), new Date("2026-10-21T10:00:00.000Z"));
    expect(backup.app).toBe("balance");
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe("2026-10-21T10:00:00.000Z");
    expect(backup.totals?.transactions).toBe(1);
  });
});
