import type {
  BusinessTrip,
  BusinessTripExpenseCategory,
  PersonalBalanceDirection,
  PersonalBalanceItem,
  Transaction,
} from "./types";
import { addMonths, monthKeyFromDate } from "./dates";
import { isSafeCents, sumCents } from "./money";

export const BUSINESS_TRIP_EXPENSE_LABELS: Record<
  BusinessTripExpenseCategory,
  string
> = {
  hotel: "Hotel",
  pranzo: "Pranzo",
  cena: "Cena",
  treno: "Treno",
  pedaggio: "Pedaggio",
  parcheggio: "Parcheggio",
  altro: "Altro",
};

export const BUSINESS_TRIP_EXPENSE_CATEGORIES = Object.keys(
  BUSINESS_TRIP_EXPENSE_LABELS,
) as BusinessTripExpenseCategory[];

export interface BusinessTripTotals {
  /** Documented advances only: these are a reimbursement, not income. */
  expenseReimbursementCents: number;
  /** Kilometres plus allowance: this is additional real income. */
  tripEarningsCents: number;
  /** expenseReimbursement + tripEarnings. */
  expectedSettlementCents: number;
  /** Backward-compatible aliases. */
  expensesCents: number;
  kmReimbursementCents: number;
  allowanceCents: number;
  totalCents: number;
}

export interface BusinessTripSummary extends BusinessTripTotals {
  openCount: number;
  reimbursedCount: number;
}

export interface BusinessTripMonthGroup extends BusinessTripTotals {
  month: string;
  trips: BusinessTrip[];
}

export interface LinkedTripIncome {
  transaction: Transaction;
  trips: BusinessTrip[];
  receivedCents: number;
  expenseReimbursementCents: number;
  tripEarningsCents: number;
  expectedSettlementCents: number;
  /** Received amount minus documented advances only. */
  effectiveIncomeCents: number;
}

export interface PersonalBalanceTotals {
  receivableCents: number;
  payableCents: number;
  receivableCount: number;
  payableCount: number;
}

export interface PersonalPersonGroup {
  person: string;
  items: PersonalBalanceItem[];
  totalCents: number;
}

function nonNegativeInteger(value: unknown): number {
  return isSafeCents(value) && value > 0 ? value : 0;
}

export function businessTripExpenseCents(trip: BusinessTrip): number {
  return sumCents(trip.expenses.map((expense) => expense.amountCents));
}

/**
 * The rate is stored in millesimi di euro per km so a real-world rate such as
 * €0,488 keeps its precision. The result is rounded once, in integer cents.
 */
export function businessTripKmReimbursementCents(trip: BusinessTrip): number {
  const kilometers = trip.kilometers;
  const rate = trip.ratePerKmMills;
  if (
    typeof kilometers !== "number" ||
    !Number.isFinite(kilometers) ||
    kilometers <= 0 ||
    !isSafeCents(rate) ||
    rate <= 0
  ) {
    return 0;
  }
  const cents = Math.round((kilometers * rate) / 10);
  return isSafeCents(cents) ? cents : 0;
}

export function businessTripTotals(trip: BusinessTrip): BusinessTripTotals {
  const expensesCents = businessTripExpenseCents(trip);
  const kmReimbursementCents = businessTripKmReimbursementCents(trip);
  const allowanceCents = nonNegativeInteger(trip.allowanceCents);
  const tripEarningsCents = kmReimbursementCents + allowanceCents;
  const expectedSettlementCents = expensesCents + tripEarningsCents;
  return {
    expenseReimbursementCents: expensesCents,
    tripEarningsCents,
    expectedSettlementCents,
    expensesCents,
    kmReimbursementCents,
    allowanceCents,
    totalCents: expectedSettlementCents,
  };
}

export function summarizeBusinessTrips(
  trips: BusinessTrip[],
): BusinessTripSummary {
  const openTrips = trips.filter((trip) => trip.status === "open");
  const totals = openTrips.map(businessTripTotals);
  return {
    expenseReimbursementCents: sumCents(
      totals.map((item) => item.expenseReimbursementCents),
    ),
    tripEarningsCents: sumCents(
      totals.map((item) => item.tripEarningsCents),
    ),
    expectedSettlementCents: sumCents(
      totals.map((item) => item.expectedSettlementCents),
    ),
    expensesCents: sumCents(totals.map((item) => item.expensesCents)),
    kmReimbursementCents: sumCents(
      totals.map((item) => item.kmReimbursementCents),
    ),
    allowanceCents: sumCents(totals.map((item) => item.allowanceCents)),
    totalCents: sumCents(totals.map((item) => item.totalCents)),
    openCount: openTrips.length,
    reimbursedCount: trips.filter((trip) => trip.status === "reimbursed")
      .length,
  };
}

export function defaultSettlementMonth(date: string): string {
  return addMonths(monthKeyFromDate(date), 2);
}

export function sortBusinessTrips(trips: BusinessTrip[]): BusinessTrip[] {
  return [...trips].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function openBusinessTrips(trips: BusinessTrip[]): BusinessTrip[] {
  return sortBusinessTrips(trips.filter((trip) => trip.status === "open"));
}

export function reimbursedBusinessTrips(trips: BusinessTrip[]): BusinessTrip[] {
  return [...trips]
    .filter((trip) => trip.status === "reimbursed")
    .sort((a, b) => {
      const aDate = a.reimbursedAt ?? a.updatedAt;
      const bDate = b.reimbursedAt ?? b.updatedAt;
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return a.date < b.date ? 1 : -1;
    });
}

export function groupOpenTripsBySettlementMonth(
  trips: BusinessTrip[],
): BusinessTripMonthGroup[] {
  const groups = new Map<string, BusinessTrip[]>();
  for (const trip of openBusinessTrips(trips)) {
    const month =
      trip.expectedSettlementMonth ?? defaultSettlementMonth(trip.date);
    const list = groups.get(month) ?? [];
    list.push(trip);
    groups.set(month, list);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthTrips]) => {
      const totals = monthTrips.map(businessTripTotals);
      return {
        month,
        trips: monthTrips,
        expenseReimbursementCents: sumCents(
          totals.map((item) => item.expenseReimbursementCents),
        ),
        tripEarningsCents: sumCents(
          totals.map((item) => item.tripEarningsCents),
        ),
        expectedSettlementCents: sumCents(
          totals.map((item) => item.expectedSettlementCents),
        ),
        expensesCents: sumCents(totals.map((item) => item.expensesCents)),
        kmReimbursementCents: sumCents(
          totals.map((item) => item.kmReimbursementCents),
        ),
        allowanceCents: sumCents(totals.map((item) => item.allowanceCents)),
        totalCents: sumCents(totals.map((item) => item.totalCents)),
      };
    });
}

/**
 * The bank transaction stays exactly as received. Only documented advances
 * reduce effective income; kilometres and allowance remain real earnings.
 */
export function linkedIncomeForTransaction(
  transaction: Transaction,
  trips: BusinessTrip[],
): LinkedTripIncome {
  const linkedTrips = trips.filter(
    (trip) =>
      trip.status === "reimbursed" &&
      trip.linkedSalaryTransactionId === transaction.id,
  );
  const totals = linkedTrips.map(businessTripTotals);
  const expenseReimbursementCents = sumCents(
    totals.map((item) => item.expenseReimbursementCents),
  );
  return {
    transaction,
    trips: linkedTrips,
    receivedCents: transaction.amountCents,
    expenseReimbursementCents,
    tripEarningsCents: sumCents(totals.map((item) => item.tripEarningsCents)),
    expectedSettlementCents: sumCents(
      totals.map((item) => item.expectedSettlementCents),
    ),
    effectiveIncomeCents: transaction.amountCents - expenseReimbursementCents,
  };
}

/** All income movements with at least one reimbursed trip linked to them. */
export function linkedTripIncome(
  transactions: Transaction[],
  trips: BusinessTrip[],
): LinkedTripIncome[] {
  return transactions
    .filter(
      (transaction) =>
        transaction.type === "income" &&
        trips.some(
          (trip) =>
            trip.status === "reimbursed" &&
            trip.linkedSalaryTransactionId === transaction.id,
        ),
    )
    .map((transaction) => linkedIncomeForTransaction(transaction, trips))
    .sort((a, b) => {
      if (a.transaction.date !== b.transaction.date) {
        return a.transaction.date < b.transaction.date ? 1 : -1;
      }
      return a.transaction.createdAt < b.transaction.createdAt ? 1 : -1;
    });
}

export function summarizePersonalBalance(
  items: PersonalBalanceItem[],
): PersonalBalanceTotals {
  const open = items.filter((item) => item.status === "open");
  const receivable = open.filter((item) => item.direction === "receivable");
  const payable = open.filter((item) => item.direction === "payable");
  return {
    receivableCents: sumCents(receivable.map((item) => item.amountCents)),
    payableCents: sumCents(payable.map((item) => item.amountCents)),
    receivableCount: receivable.length,
    payableCount: payable.length,
  };
}

export function groupPersonalByPerson(
  items: PersonalBalanceItem[],
  direction: PersonalBalanceDirection,
): PersonalPersonGroup[] {
  const groups = new Map<string, PersonalBalanceItem[]>();
  for (const item of items) {
    if (item.direction !== direction || item.status !== "open") continue;
    const key = item.person.trim().toLocaleLowerCase("it-IT");
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return Array.from(groups.values())
    .map((personItems) => {
      const sorted = [...personItems].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
      return {
        person: sorted[0].person,
        items: sorted,
        totalCents: sumCents(sorted.map((item) => item.amountCents)),
      };
    })
    .sort((a, b) => a.person.localeCompare(b.person, "it-IT"));
}

export function settledPersonalItems(
  items: PersonalBalanceItem[],
): PersonalBalanceItem[] {
  return items
    .filter((item) => item.status === "settled")
    .sort((a, b) => {
      const aDate = a.settledAt ?? a.updatedAt;
      const bDate = b.settledAt ?? b.updatedAt;
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return a.date < b.date ? 1 : -1;
    });
}

/** Parses a non-negative decimal used for kilometres or rates. */
export function parseDecimalNumber(input: string): number | null {
  if (typeof input !== "string") return null;
  const value = input.trim().replace(/[€\s\u00a0\u202f']/g, "");
  if (!value) return null;

  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  let integerPart = value;
  let fractionPart = "";

  if (comma !== -1 && dot !== -1) {
    const decimalIndex = Math.max(comma, dot);
    integerPart = value.slice(0, decimalIndex).replace(/[.,]/g, "");
    fractionPart = value.slice(decimalIndex + 1);
    if (fractionPart.includes(",") || fractionPart.includes(".")) return null;
  } else if (comma !== -1) {
    const pieces = value.split(",");
    if (pieces.length > 2) return null;
    integerPart = pieces[0];
    fractionPart = pieces[1] ?? "";
  } else if (dot !== -1) {
    const pieces = value.split(".");
    if (pieces.length > 2) return null;
    integerPart = pieces[0];
    fractionPart = pieces[1] ?? "";
  }

  if (!integerPart) integerPart = "0";
  if (!/^\d+$/.test(integerPart)) return null;
  if (fractionPart && !/^\d+$/.test(fractionPart)) return null;
  if (fractionPart.length > 3) return null;

  const parsed = Number(`${integerPart}.${fractionPart || "0"}`);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** €0,488/km ↔ 488. Values are millesimi di euro, not integer cents. */
export function parseRateToMills(input: string): number | null {
  const value = parseDecimalNumber(input);
  if (value === null) return null;
  const mills = Math.round(value * 1000);
  return isSafeCents(mills) ? mills : null;
}

export function formatRateInput(mills: number | undefined): string {
  const safe = isSafeCents(mills) && mills >= 0 ? mills : 0;
  const whole = Math.floor(safe / 1000);
  const fraction = String(safe % 1000).padStart(3, "0");
  const trimmed = fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${whole},${trimmed}`;
}

export function formatRatePerKm(mills: number | undefined): string {
  return `€${formatRateInput(mills)}`;
}

export function formatKilometersInput(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return String(value).replace(".", ",");
}

export function formatKilometers(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 3,
  }).format(value);
}
