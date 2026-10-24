import { describe, expect, it } from "vitest";
import { annualCategoryDetail, categoryTotals, resolveInsightYear, transactionYears } from "../lib/insights";
import { getMonthSummary, summarizeYear } from "../lib/finance";
import { normalizeBalanceData } from "../lib/storage";
import type { Transaction, HistoricalMonthlySummary } from "../lib/types";
const transaction = (id: string, date: string, type: Transaction["type"], amountCents: number, category: string | null = "vestiti"): Transaction => ({ id, date, type, amountCents, category, createdAt: "2026-01-01", updatedAt: "2026-01-01" });
const items = [transaction("a", "2026-01-01", "expense", 1001), transaction("b", "2026-12-31", "expense", 2002), transaction("c", "2026-02-01", "expense", 5000, "custom-category"), transaction("d", "2026-02-01", "income", 9000, "rimborsi"), transaction("e", "2026-02-01", "transfer", 7000), transaction("f", "2025-12-31", "expense", 4000), transaction("g", "2027-01-01", "expense", 200), transaction("h", "2026-03-01", "expense", 100, null)];
describe("annual expense categories", () => {
  it("groups real category IDs, orders spending and excludes income/refunds and transfers", () => {
    const annual = summarizeYear("2026", items, []);
    expect(categoryTotals(annual.expenseByCategory).map(item => [item.categoryId, item.cents])).toEqual([["custom-category", 5000], ["vestiti", 3003], ["altro-spesa", 100]]);
    expect(annual.expenseCents).toBe(8103);
    expect(Object.values(annual.expenseByCategory).reduce((a, b) => a + b, 0)).toBe(annual.expenseCents);
    expect(Array.from({ length: 12 }, (_, i) => getMonthSummary(`2026-${String(i + 1).padStart(2, "0")}`, items, []).expenseCents).reduce((a, b) => a + b, 0)).toBe(annual.expenseCents);
  });
  it("derives years and selects current or latest available, preserving year changes", () => {
    const years = transactionYears(items);
    expect(years).toEqual(["2027", "2026", "2025"]);
    expect(resolveInsightYear(years, undefined, "2026")).toBe("2026");
    expect(resolveInsightYear(years, undefined, "2028")).toBe("2027");
    expect(resolveInsightYear(years, "2025", "2026")).toBe("2025");
    expect(summarizeYear("2025", items, []).expenseCents).toBe(4000);
    expect(summarizeYear("2027", items, []).expenseCents).toBe(200);
  });
  it("handles absent years and an empty account", () => {
    expect(summarizeYear("2024", items, []).expenseByCategory).toEqual({});
    expect(annualCategoryDetail("2024", "vestiti", items, []).cents).toBe(0);
    expect(transactionYears([])).toEqual([]);
    expect(resolveInsightYear([], undefined, "2026")).toBe("2026");
  });
  it("uses existing normalization to remove duplicate IDs without merging legitimate equal purchases", () => {
    const normalized = normalizeBalanceData({ transactions: [...items, items[0], { ...items[0], id: "different-purchase" }] });
    expect(summarizeYear("2026", normalized.data.transactions, []).expenseCents).toBe(9104);
  });
  it("provides exact category transactions, count, twelve-month average and top months", () => {
    const detail = annualCategoryDetail("2026", "vestiti", items, []);
    expect(detail.cents).toBe(3003);
    expect(detail.transactions.map(item => item.id)).toEqual(["b", "a"]);
    expect(detail.averageCents).toBe(250);
    expect(detail.months[0]).toEqual({ month: "2026-12", cents: 2002 });
    expect(annualCategoryDetail("2026", "altro-spesa", items, []).cents).toBe(100);
  });
  it("reuses historical fallback and never adds historical and transaction data in the same month", () => {
    const history: HistoricalMonthlySummary[] = ["01", "04"].map(month => ({ id: month, month: `2026-${month}`, incomeByCategory: {}, expenseByCategory: { vestiti: 10000 }, totalIncomeCents: 0, totalExpensesCents: 10000, savingsCents: -10000, source: "historical-import", createdAt: "2026-01-01" }));
    const detail = annualCategoryDetail("2026", "vestiti", items, history);
    expect(detail.cents).toBe(13003);
    expect(detail.historicalMonths).toBe(1);
    expect(detail.cents).toBe(summarizeYear("2026", items, history).expenseByCategory.vestiti);
  });
});
