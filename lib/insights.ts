import type {
  Account,
  HistoricalMonthlySummary,
  MonthSummary,
  MonthlyBudget,
  NetWorthSnapshot,
  Reflection,
  Transaction,
} from "./types";
import {
  getMonthSummary,
  latestSnapshot,
  largestExpenseCategory,
  calculateBudgetStatus,
  savingsRate,
  snapshotChange,
  monthlySpendingHistory,
} from "./finance";
import {
  allCategoriesForType,
  getCategoryLabel,
  type CategoryCatalog,
} from "./categories";
import { formatMoney, formatPercent, sumCents } from "./money";
import {
  formatShortDate,
  monthName,
  previousMonth,
  recentMonths,
} from "./dates";

export interface InsightCard {
  id: string;
  eyebrow: string;
  body: string;
  value?: string;
  tone?: "default" | "accent";
}

export interface InsightsResult {
  summary: MonthSummary;
  previous: MonthSummary;
  savingsRate: number | null;
  cards: InsightCard[];
  hasData: boolean;
}

interface InsightsInput {
  month: string;
  transactions: Transaction[];
  historicalSummaries: HistoricalMonthlySummary[];
  budgets: MonthlyBudget[];
  accounts: Account[];
  snapshots: NetWorthSnapshot[];
  categoryCatalog?: CategoryCatalog;
}

function reflectionStats(
  transactions: Transaction[],
  month: string,
): { total: number; no: number } {
  const items = transactions.filter(
    (t) =>
      t.type === "expense" &&
      t.date.startsWith(month) &&
      t.reflection !== undefined,
  );
  return {
    total: items.length,
    no: items.filter((t) => t.reflection === ("no" satisfies Reflection)).length,
  };
}

export function buildInsights(input: InsightsInput): InsightsResult {
  const {
    month,
    transactions,
    historicalSummaries,
    budgets,
    accounts,
    snapshots,
    categoryCatalog,
  } = input;

  const summary = getMonthSummary(month, transactions, historicalSummaries);
  const prevMonth = previousMonth(month);
  const previous = getMonthSummary(
    prevMonth,
    transactions,
    historicalSummaries,
  );
  const hasData = summary.source !== "empty";
  const cards: InsightCard[] = [];

  if (!hasData) {
    return {
      summary,
      previous,
      savingsRate: null,
      cards,
      hasData,
    };
  }

  const prevName = monthName(prevMonth);
  const currentName = monthName(month);

  if (previous.source !== "empty") {
    const difference = summary.expenseCents - previous.expenseCents;
    if (difference === 0) {
      cards.push({
        id: "spending-comparison",
        eyebrow: "Confronto spese",
        body: `Hai speso la stessa cifra di ${prevName}.`,
      });
    } else {
      cards.push({
        id: "spending-comparison",
        eyebrow: "Confronto spese",
        body: `Hai speso ${formatMoney(Math.abs(difference))} ${
          difference > 0 ? "in più" : "in meno"
        } rispetto a ${prevName}.`,
        tone: difference < 0 ? "accent" : "default",
      });
    }
  }

  const top = largestExpenseCategory(summary);
  if (top) {
    const previousCategorySpend =
      previous.expenseByCategory[top.categoryId] ?? 0;
    const previousText =
      previous.source !== "empty"
        ? ` A ${prevName} erano ${formatMoney(previousCategorySpend)}.`
        : "";
    cards.push({
      id: "top-category",
      eyebrow: "Categoria principale",
      body: `${getCategoryLabel(top.categoryId, "expense", categoryCatalog)} è la voce più presente: ${formatMoney(
        top.cents,
      )}, il ${formatPercent(top.share)} delle spese.${previousText}`,
    });
  }

  const budget = budgets.find((item) => item.month === month);
  const budgetStatus = calculateBudgetStatus(
    budget,
    summary.expenseByCategory,
    allCategoriesForType("expense", categoryCatalog).map(
      (category) => category.id,
    ),
  );
  if (budgetStatus.hasBudget) {
    cards.push({
      id: "budget",
      eyebrow: "Budget",
      body: budgetStatus.isOver
        ? `Hai superato il budget di ${formatMoney(Math.abs(budgetStatus.totalRemainingCents))}.`
        : `Rimangono ${formatMoney(budgetStatus.totalRemainingCents)} su ${formatMoney(
            budgetStatus.totalBudgetCents,
          )}.`,
      value: formatPercent(budgetStatus.progress),
      tone: budgetStatus.isOver ? "default" : "accent",
    });
  }

  const change = snapshotChange(snapshots);
  if (change) {
    const direction =
      change.changeCents === 0
        ? "è rimasto invariato"
        : change.changeCents > 0
          ? `è cresciuto di ${formatMoney(change.changeCents)}`
          : `è diminuito di ${formatMoney(Math.abs(change.changeCents))}`;
    cards.push({
      id: "net-worth",
      eyebrow: "Patrimonio",
      body: `Dall'ultimo aggiornamento del ${formatShortDate(
        change.from.date,
      )} il patrimonio ${direction}.`,
      tone: change.changeCents > 0 ? "accent" : "default",
    });
  }

  const averageMonths = recentMonths(prevMonth, 6);
  const spendingHistory = monthlySpendingHistory(
    transactions,
    historicalSummaries,
    averageMonths,
  ).filter((item) => item.hasData);
  if (spendingHistory.length >= 2) {
    const average = Math.round(
      sumCents(spendingHistory.map((item) => item.expenseCents)) /
        spendingHistory.length,
    );
    cards.push({
      id: "average-spending",
      eyebrow: "Media delle spese",
      body: `Nei ${spendingHistory.length} mesi registrati prima di ${currentName} hai speso in media ${formatMoney(
        average,
      )} al mese.`,
      value: formatMoney(average),
    });
  }

  const vintedIncome = summary.incomeByCategory.vinted ?? 0;
  if (vintedIncome > 0) {
    cards.push({
      id: "vinted",
      eyebrow: "Vinted",
      body: `Questo mese da Vinted: ${formatMoney(vintedIncome)}.`,
      tone: "accent",
    });
  }

  const clothing = summary.expenseByCategory.vestiti ?? 0;
  if (clothing > 0) {
    const previousClothing = previous.expenseByCategory.vestiti ?? 0;
    cards.push({
      id: "clothing",
      eyebrow: "Vestiti",
      body:
        previous.source !== "empty"
          ? `${formatMoney(clothing)} questo mese, ${formatMoney(
              previousClothing,
            )} a ${prevName}.`
          : `${formatMoney(clothing)} questo mese.`,
    });
  }

  const travel = summary.expenseByCategory.viaggi ?? 0;
  if (travel > 0) {
    cards.push({
      id: "travel",
      eyebrow: "Viaggi",
      body: `${formatMoney(travel)} questo mese.`,
    });
  }

  const reflections = reflectionStats(transactions, month);
  if (reflections.total >= 2 && reflections.no > 0) {
    cards.push({
      id: "reflection",
      eyebrow: "Le tue riflessioni",
      body: `Di ${reflections.total} spese con una riflessione, ${reflections.no} ${
        reflections.no === 1 ? "è segnata" : "sono segnate"
      } come “non ne è valsa la pena”.`,
    });
  }

  return {
    summary,
    previous,
    savingsRate: savingsRate(summary),
    cards,
    hasData,
  };
}

export function insightIntro(
  month: string,
  hasData: boolean,
  cards: InsightCard[],
): string {
  if (!hasData) {
    return "Nessun movimento in questo mese.";
  }
  if (cards.length === 0) {
    return `I dati di ${monthName(month)} ci sono, ma servono altri movimenti per aggiungere osservazioni.`;
  }
  return `Riepilogo di ${monthName(month)}, basato sui movimenti registrati.`;
}

export function latestSnapshotInfo(snapshots: NetWorthSnapshot[]) {
  const snapshot = latestSnapshot(snapshots);
  return snapshot
    ? `Ultima fotografia: ${formatShortDate(snapshot.date, true)}`
    : null;
}
