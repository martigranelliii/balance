import type { HistoricalMonthlySummary } from "../types";
import { isMonthKey } from "../dates";
import { isSafeCents, sumCents } from "../money";

/**
 * Isolated boundary for the future Excel migration.
 *
 * A parser for the real workbook is intentionally not implemented yet: the
 * user's file is not part of this project, and guessing its layout would risk
 * creating wrong financial history. A dedicated importer can call this helper
 * after reading the workbook. No fake history is ever seeded.
 */
export interface HistoricalImportRow {
  /** YYYY-MM */
  month: string;
  incomeByCategory?: Record<string, number>;
  expenseByCategory?: Record<string, number>;
  /** Optional aggregate totals, already converted to integer cents. */
  totalIncomeCents?: number;
  totalExpensesCents?: number;
}

function validateMap(
  map: Record<string, number> | undefined,
  field: string,
): Record<string, number> {
  if (!map) return {};
  const result: Record<string, number> = {};
  for (const [category, cents] of Object.entries(map)) {
    if (!category.trim()) {
      throw new Error(`${field}: categoria vuota.`);
    }
    if (!isSafeCents(cents) || cents < 0) {
      throw new Error(`${field}: importo non valido per ${category}.`);
    }
    result[category.trim()] = cents;
  }
  return result;
}

export function buildHistoricalSummary(
  row: HistoricalImportRow,
  createdAt: string = new Date().toISOString(),
): HistoricalMonthlySummary {
  if (!isMonthKey(row.month)) {
    throw new Error("Mese storico non valido: atteso YYYY-MM.");
  }

  const incomeByCategory = validateMap(row.incomeByCategory, "Entrate");
  const expenseByCategory = validateMap(row.expenseByCategory, "Spese");
  const derivedIncome = sumCents(Object.values(incomeByCategory));
  const derivedExpenses = sumCents(Object.values(expenseByCategory));

  if (
    row.totalIncomeCents !== undefined &&
    (!isSafeCents(row.totalIncomeCents) || row.totalIncomeCents < 0)
  ) {
    throw new Error("Totale entrate non valido.");
  }
  if (
    row.totalExpensesCents !== undefined &&
    (!isSafeCents(row.totalExpensesCents) || row.totalExpensesCents < 0)
  ) {
    throw new Error("Totale spese non valido.");
  }

  if (
    row.totalIncomeCents !== undefined &&
    Object.keys(incomeByCategory).length > 0 &&
    row.totalIncomeCents !== derivedIncome
  ) {
    throw new Error(
      "Il totale delle entrate non coincide con le categorie: importazione interrotta.",
    );
  }
  if (
    row.totalExpensesCents !== undefined &&
    Object.keys(expenseByCategory).length > 0 &&
    row.totalExpensesCents !== derivedExpenses
  ) {
    throw new Error(
      "Il totale delle spese non coincide con le categorie: importazione interrotta.",
    );
  }

  const totalIncomeCents = row.totalIncomeCents ?? derivedIncome;
  const totalExpensesCents = row.totalExpensesCents ?? derivedExpenses;

  return {
    id: `historical-${row.month}`,
    month: row.month,
    incomeByCategory,
    expenseByCategory,
    totalIncomeCents,
    totalExpensesCents,
    savingsCents: totalIncomeCents - totalExpensesCents,
    source: "historical-import",
    createdAt,
  };
}
