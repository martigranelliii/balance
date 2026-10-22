import { beforeEach, describe, expect, it } from "vitest";
import type {
  BusinessTrip,
  BusinessTripExpense,
  PersonalBalanceItem,
  Transaction,
} from "../lib/types";
import {
  businessTripTotals,
  defaultSettlementMonth,
  formatRateInput,
  groupOpenTripsBySettlementMonth,
  groupPersonalByPerson,
  linkedIncomeForTransaction,
  linkedTripIncome,
  parseRateToMills,
  summarizeBusinessTrips,
  summarizePersonalBalance,
} from "../lib/trips";
import { getMonthSummary } from "../lib/finance";
import { createEmptyData, normalizeBalanceData } from "../lib/storage";
import { mergeBalanceData, parseBackup, serializeBackup } from "../lib/backup";
import {
  addTransaction,
  getSnapshot,
  markBusinessTripReimbursed,
  replaceAllData,
  saveBusinessTrip,
  savePersonalBalanceItem,
  settlePersonalBalanceItem,
} from "../lib/store";

function expense(
  overrides: Partial<BusinessTripExpense> = {},
): BusinessTripExpense {
  return {
    id: "expense_1",
    category: "pranzo",
    amountCents: 1000,
    ...overrides,
  };
}

function trip(overrides: Partial<BusinessTrip> = {}): BusinessTrip {
  return {
    id: "trip_1",
    date: "2026-06-15",
    title: "Fiera a Bologna",
    expenses: [
      expense(),
      expense({ id: "expense_2", category: "pedaggio", amountCents: 1860 }),
    ],
    kilometers: 150,
    ratePerKmMills: 488,
    allowanceCents: 4350,
    expectedSettlementMonth: "2026-08",
    status: "open",
    createdAt: "2026-06-15T10:00:00.000Z",
    updatedAt: "2026-06-15T10:00:00.000Z",
    ...overrides,
  };
}

function personal(
  overrides: Partial<PersonalBalanceItem> = {},
): PersonalBalanceItem {
  return {
    id: "personal_1",
    direction: "receivable",
    person: "Papà",
    description: "Regalo",
    amountCents: 3668,
    date: "2026-10-01",
    status: "open",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

function salary(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx_salary",
    date: "2026-08-27",
    type: "income",
    amountCents: 200000,
    category: "stipendio",
    description: "Stipendio agosto",
    createdAt: "2026-08-27T10:00:00.000Z",
    updatedAt: "2026-08-27T10:00:00.000Z",
    ...overrides,
  };
}

describe("business trip totals", () => {
  it("keeps expenses, km and allowance separate", () => {
    const totals = businessTripTotals(trip());
    expect(totals.expensesCents).toBe(2860);
    expect(totals.kmReimbursementCents).toBe(7320);
    expect(totals.allowanceCents).toBe(4350);
    expect(totals.totalCents).toBe(14530);
  });

  it("separates expense reimbursement from real trip earnings", () => {
    const totals = businessTripTotals(trip());
    expect(totals.expenseReimbursementCents).toBe(2860);
    expect(totals.tripEarningsCents).toBe(11670);
    expect(totals.expectedSettlementCents).toBe(14530);
    expect(totals.totalCents).toBe(totals.expectedSettlementCents);
  });

  it("subtracts only expense reimbursements from a linked salary", () => {
    const salaryTransaction = salary({ amountCents: 250000 });
    const first = trip({
      id: "trip_first",
      status: "reimbursed",
      linkedSalaryTransactionId: salaryTransaction.id,
      expenses: [expense({ amountCents: 2860 })],
    });
    const second = trip({
      id: "trip_second",
      status: "reimbursed",
      linkedSalaryTransactionId: salaryTransaction.id,
      expenses: [expense({ id: "expense_second", amountCents: 9310 })],
      kilometers: 0,
      allowanceCents: 0,
    });
    const unrelated = trip({
      id: "trip_unrelated",
      status: "reimbursed",
      linkedSalaryTransactionId: "other_salary",
      expenses: [expense({ id: "expense_other", amountCents: 99999 })],
    });

    const income = linkedIncomeForTransaction(salaryTransaction, [
      first,
      second,
      unrelated,
    ]);
    expect(income.trips).toHaveLength(2);
    expect(income.receivedCents).toBe(250000);
    expect(income.expenseReimbursementCents).toBe(12170);
    expect(income.tripEarningsCents).toBe(
      businessTripTotals(first).tripEarningsCents +
        businessTripTotals(second).tripEarningsCents,
    );
    expect(income.effectiveIncomeCents).toBe(237830);
  });

  it("lists only income transactions that have linked reimbursed trips", () => {
    const salaryTransaction = salary({ amountCents: 250000 });
    const otherIncome = salary({
      id: "tx_other",
      date: "2026-08-20",
      amountCents: 50000,
      description: "Vinted",
    });
    const linked = trip({
      status: "reimbursed",
      linkedSalaryTransactionId: salaryTransaction.id,
    });
    const unlinked = trip({
      id: "trip_unlinked",
      status: "reimbursed",
      linkedSalaryTransactionId: otherIncome.id,
    });
    const rows = linkedTripIncome(
      [salaryTransaction, otherIncome],
      [linked, unlinked],
    );
    expect(rows.map((row) => row.transaction.id)).toEqual([
      "tx_salary",
      "tx_other",
    ]);
  });

  it("predicts the salary month two months after the trip", () => {
    expect(defaultSettlementMonth("2026-06-15")).toBe("2026-08");
    expect(defaultSettlementMonth("2026-12-03")).toBe("2027-02");
  });

  it("groups open trips by expected settlement month and excludes reimbursed ones", () => {
    const openJune = trip({ id: "trip_june", expectedSettlementMonth: "2026-08" });
    const openJuly = trip({
      id: "trip_july",
      date: "2026-07-02",
      expectedSettlementMonth: "2026-09",
      allowanceCents: 0,
    });
    const reimbursed = trip({
      id: "trip_done",
      status: "reimbursed",
      expectedSettlementMonth: "2026-08",
    });
    const summary = summarizeBusinessTrips([openJune, openJuly, reimbursed]);
    expect(summary.openCount).toBe(2);
    expect(summary.reimbursedCount).toBe(1);
    expect(summary.totalCents).toBe(
      businessTripTotals(openJune).totalCents +
        businessTripTotals(openJuly).totalCents,
    );

    const groups = groupOpenTripsBySettlementMonth([
      openJune,
      openJuly,
      reimbursed,
    ]);
    expect(groups.map((group) => group.month)).toEqual(["2026-08", "2026-09"]);
    expect(groups[0].trips.map((item) => item.id)).toEqual(["trip_june"]);
  });

  it("parses and formats a three-decimal rate without floating point drift", () => {
    expect(parseRateToMills("0,488")).toBe(488);
    expect(parseRateToMills("0.488")).toBe(488);
    expect(formatRateInput(488)).toBe("0,488");
    expect(businessTripTotals(trip()).kmReimbursementCents).toBe(7320);
  });
});

describe("personal balance items", () => {
  it("sums open receivables and payables separately", () => {
    const items = [
      personal(),
      personal({ id: "personal_2", description: "Spese varie", amountCents: 14400 }),
      personal({
        id: "personal_3",
        direction: "payable",
        person: "Vinted",
        description: "Annuncio",
        amountCents: 3549,
      }),
      personal({
        id: "personal_4",
        status: "settled",
        amountCents: 99999,
      }),
    ];
    const totals = summarizePersonalBalance(items);
    expect(totals.receivableCents).toBe(18068);
    expect(totals.payableCents).toBe(3549);
    expect(totals.receivableCount).toBe(2);
    expect(totals.payableCount).toBe(1);
  });

  it("groups multiple items for the same person instead of merging them in storage", () => {
    const items = [
      personal(),
      personal({ id: "personal_2", description: "Spese varie", amountCents: 14400 }),
    ];
    const groups = groupPersonalByPerson(items, "receivable");
    expect(groups).toHaveLength(1);
    expect(groups[0].person).toBe("Papà");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].totalCents).toBe(18068);
  });
});

describe("no cash-flow contamination", () => {
  it("does not count trips or personal items as income or expenses", () => {
    const data = createEmptyData();
    const withExtra = {
      ...data,
      businessTrips: [trip()],
      personalBalanceItems: [
        personal(),
        personal({ id: "personal_2", description: "Spese varie", amountCents: 14400 }),
        personal({
          id: "personal_3",
          direction: "payable",
          person: "Vinted",
          description: "Annuncio",
          amountCents: 3549,
        }),
      ],
    };
    const empty = getMonthSummary(
      "2026-10",
      withExtra.transactions,
      withExtra.historicalMonthlySummaries,
    );
    expect(empty.incomeCents).toBe(0);
    expect(empty.expenseCents).toBe(0);

    const withBankExpense = getMonthSummary(
      "2026-10",
      [
        salary({
          id: "tx_bank",
          type: "expense",
          category: "cibo",
          amountCents: 1250,
          date: "2026-10-05",
          description: "Pranzo",
        }),
      ],
      withExtra.historicalMonthlySummaries,
    );
    expect(withBankExpense.expenseCents).toBe(1250);
    expect(withBankExpense.incomeCents).toBe(0);
  });
});

describe("store actions keep bank movements untouched", () => {
  beforeEach(() => {
    replaceAllData(createEmptyData());
  });

  it("marks a trip reimbursed without changing the linked salary transaction", () => {
    const salaryId = addTransaction({
      type: "income",
      amountCents: 200000,
      date: "2026-08-27",
      category: "stipendio",
      description: "Stipendio agosto",
    });
    const before = getSnapshot().data.transactions;
    const tripId = saveBusinessTrip({
      date: "2026-06-15",
      title: "Fiera a Bologna",
      expenses: [
        { category: "pranzo", amountCents: 1000 },
        { category: "pedaggio", amountCents: 1860 },
      ],
      kilometers: 150,
      ratePerKmMills: 488,
      allowanceCents: 4350,
    });

    markBusinessTripReimbursed(tripId, salaryId);

    const data = getSnapshot().data;
    expect(data.businessTrips).toHaveLength(1);
    expect(data.businessTrips[0].status).toBe("reimbursed");
    expect(data.businessTrips[0].linkedSalaryTransactionId).toBe(salaryId);
    expect(data.transactions).toEqual(before);
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].amountCents).toBe(200000);
  });

  it("settles a personal item without creating a transaction", () => {
    const bankId = addTransaction({
      type: "income",
      amountCents: 18068,
      date: "2026-12-20",
      category: "rimborsi",
      description: "Rimborso Papà",
    });
    const itemId = savePersonalBalanceItem({
      direction: "receivable",
      person: "Papà",
      description: "Regalo",
      amountCents: 18068,
      date: "2026-10-01",
    });
    const before = getSnapshot().data.transactions;
    settlePersonalBalanceItem(itemId, bankId);
    const data = getSnapshot().data;
    expect(data.personalBalanceItems[0].status).toBe("settled");
    expect(data.personalBalanceItems[0].linkedTransactionId).toBe(bankId);
    expect(data.transactions).toEqual(before);
    expect(data.transactions).toHaveLength(1);
  });
});

describe("backup and migration", () => {
  it("round-trips trips and personal items through the backup", () => {
    const data = {
      ...createEmptyData(),
      businessTrips: [trip()],
      personalBalanceItems: [personal()],
    };
    const parsed = parseBackup(serializeBackup(data));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.businessTripCount).toBe(1);
    expect(parsed.summary.personalBalanceCount).toBe(1);
    expect(parsed.data.businessTrips[0].id).toBe("trip_1");
    expect(parsed.data.personalBalanceItems[0].id).toBe("personal_1");
  });

  it("defaults the theme safely and keeps it across a backup round-trip", () => {
    const old = normalizeBalanceData({
      version: 1,
      transactions: [salary()],
      settings: { reflectionEnabled: true },
    });
    expect(old.data.settings.theme).toBe("classic");

    const data = { ...createEmptyData(), settings: { ...createEmptyData().settings, theme: "rose" as const } };
    const parsed = parseBackup(serializeBackup(data));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.settings.theme).toBe("rose");
  });

  it("keeps old balance.v1 data and adds empty collections", () => {
    const result = normalizeBalanceData({
      version: 1,
      transactions: [salary()],
      settings: { reflectionEnabled: true },
    });
    expect(result.data.transactions).toHaveLength(1);
    expect(result.data.businessTrips).toEqual([]);
    expect(result.data.personalBalanceItems).toEqual([]);
    expect(result.data.settings.defaultRatePerKmMills).toBe(0);
  });

  it("merges new collections by ID without duplicates", () => {
    const current = {
      ...createEmptyData(),
      businessTrips: [trip()],
      personalBalanceItems: [personal()],
    };
    const incoming = {
      ...createEmptyData(),
      businessTrips: [trip(), trip({ id: "trip_2" })],
      personalBalanceItems: [
        personal(),
        personal({ id: "personal_2", description: "Spese varie", amountCents: 14400 }),
      ],
    };
    const merged = mergeBalanceData(current, incoming);
    expect(merged.businessTrips).toHaveLength(2);
    expect(merged.personalBalanceItems).toHaveLength(2);
    const mergedAgain = mergeBalanceData(merged, incoming);
    expect(mergedAgain.businessTrips).toHaveLength(2);
    expect(mergedAgain.personalBalanceItems).toHaveLength(2);
  });

  it("ignores malformed new records while keeping valid ones", () => {
    const result = normalizeBalanceData({
      version: 1,
      businessTrips: [
        trip(),
        { id: "bad_trip", date: "15/06/2026", title: "Rotta" },
      ],
      personalBalanceItems: [
        personal(),
        { id: "bad_personal", direction: "receivable", person: "X" },
      ],
    });
    expect(result.data.businessTrips).toHaveLength(1);
    expect(result.data.personalBalanceItems).toHaveLength(1);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
