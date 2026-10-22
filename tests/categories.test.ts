import { beforeEach, describe, expect, it } from "vitest";
import type { BalanceData, CustomCategory, Transaction } from "../lib/types";
import {
  CATEGORIES,
  buildCategoryCatalog,
  categoriesForType,
  createCategoryCatalog,
  findCategoryByName,
  getCategoryLabel,
} from "../lib/categories";
import { createEmptyData, normalizeBalanceData } from "../lib/storage";
import { getMonthSummary } from "../lib/finance";
import { suggestCategory } from "../lib/import/categorize";
import { buildBankRows } from "../lib/import/bank";
import { mergeBalanceData, parseBackup, serializeBackup } from "../lib/backup";
import {
  addCustomCategory,
  addTransaction,
  archiveCustomCategory,
  getSnapshot,
  hideDefaultCategory,
  renameCustomCategory,
  replaceAllData,
  restoreCustomCategory,
  restoreDefaultCategory,
} from "../lib/store";

function vintedTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx_vinted",
    date: "2026-10-04",
    type: "income",
    amountCents: 50000,
    category: "vinted",
    description: "Vendita Vinted",
    createdAt: "2026-10-04T10:00:00.000Z",
    updatedAt: "2026-10-04T10:00:00.000Z",
    ...overrides,
  };
}

function custom(
  overrides: Partial<CustomCategory> = {},
): CustomCategory {
  return {
    id: "category_psicologo",
    name: "Psicologo",
    type: "expense",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

function dataWith(
  patch: Partial<BalanceData> = {},
): BalanceData {
  return { ...createEmptyData(), ...patch };
}

describe("default categories and legacy migration", () => {
  it("keeps the existing general default set", () => {
    expect(CATEGORIES.map((category) => category.id)).toEqual([
      "stipendio",
      "rimborsi",
      "vinted",
      "tutorato",
      "altro-entrata",
      "cibo",
      "trasporti",
      "vestiti",
      "viaggi",
      "benzina",
      "estetista",
      "altro-spesa",
    ]);
  });

  it("loads old balance.v1 data with all defaults active and no category prefs", () => {
    const result = normalizeBalanceData({
      version: 1,
      transactions: [vintedTransaction()],
      settings: { reflectionEnabled: true },
    });

    expect(result.data.transactions).toHaveLength(1);
    expect(result.data.customCategories).toEqual([]);
    expect(result.data.hiddenDefaultCategories).toEqual([]);
    const catalog = createCategoryCatalog(result.data);
    const income = categoriesForType("income", catalog);
    expect(income.some((category) => category.id === "vinted")).toBe(true);
    expect(getCategoryLabel("vinted", "income", catalog)).toBe("Vinted");
  });

  it("still labels an old Vinted movement after Vinted is hidden", () => {
    const result = normalizeBalanceData({
      version: 1,
      transactions: [vintedTransaction()],
      hiddenDefaultCategories: ["vinted"],
    });
    const catalog = createCategoryCatalog(result.data);

    expect(
      categoriesForType("income", catalog).some(
        (category) => category.id === "vinted",
      ),
    ).toBe(false);
    expect(getCategoryLabel("vinted", "income", catalog)).toBe("Vinted");
    expect(result.data.transactions[0].category).toBe("vinted");
    expect(
      getMonthSummary(
        "2026-10",
        result.data.transactions,
        result.data.historicalMonthlySummaries,
      ).incomeByCategory.vinted,
    ).toBe(50000);
  });

  it("normalizes invalid hidden ids and duplicate custom categories safely", () => {
    const result = normalizeBalanceData({
      version: 1,
      customCategories: [
        custom(),
        custom({ id: "category_duplicate", name: " psicologo " }),
        custom({ id: "category_vinted", name: "Vinted", type: "income" }),
        custom({ id: "cibo", name: "Cibo" }),
        {
          id: "category_bad",
          name: "Rotto",
          type: "transfer",
          createdAt: "2026-10-01T10:00:00.000Z",
          updatedAt: "2026-10-01T10:00:00.000Z",
        },
      ],
      hiddenDefaultCategories: ["vinted", "vinted", "non-esiste", 42],
    });

    expect(result.data.customCategories).toHaveLength(1);
    expect(result.data.hiddenDefaultCategories).toEqual(["vinted"]);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("hiding a default category", () => {
  beforeEach(() => {
    replaceAllData(createEmptyData());
  });

  it("does not touch existing transactions and can be restored", () => {
    replaceAllData(dataWith({ transactions: [vintedTransaction()] }));
    const before = getSnapshot().data.transactions;

    hideDefaultCategory("vinted");
    const hidden = getSnapshot().data;
    const hiddenCatalog = createCategoryCatalog(hidden);

    expect(hidden.transactions).toEqual(before);
    expect(hidden.transactions[0].category).toBe("vinted");
    expect(hidden.hiddenDefaultCategories).toEqual(["vinted"]);
    expect(
      categoriesForType("income", hiddenCatalog).some(
        (category) => category.id === "vinted",
      ),
    ).toBe(false);
    expect(getCategoryLabel("vinted", "income", hiddenCatalog)).toBe("Vinted");

    restoreDefaultCategory("vinted");
    const restored = createCategoryCatalog(getSnapshot().data);
    expect(
      categoriesForType("income", restored).some(
        (category) => category.id === "vinted",
      ),
    ).toBe(true);
  });
});

describe("custom categories", () => {
  beforeEach(() => {
    replaceAllData(createEmptyData());
  });

  it("archives without changing history and restores it", () => {
    const categoryId = addCustomCategory({
      name: "Psicologo",
      type: "expense",
    });
    const transactionId = addTransaction({
      type: "expense",
      amountCents: 8000,
      date: "2026-10-10",
      category: categoryId,
      description: "Seduta",
    });

    archiveCustomCategory(categoryId);
    const archived = getSnapshot().data;
    const archivedCatalog = createCategoryCatalog(archived);

    expect(archived.customCategories[0].archivedAt).toBeTruthy();
    expect(
      archived.transactions.find((item) => item.id === transactionId)?.category,
    ).toBe(categoryId);
    expect(
      categoriesForType("expense", archivedCatalog).some(
        (category) => category.id === categoryId,
      ),
    ).toBe(false);
    expect(getCategoryLabel(categoryId, "expense", archivedCatalog)).toBe(
      "Psicologo",
    );

    restoreCustomCategory(categoryId);
    const restoredCatalog = createCategoryCatalog(getSnapshot().data);
    expect(
      categoriesForType("expense", restoredCatalog).some(
        (category) => category.id === categoryId,
      ),
    ).toBe(true);
  });

  it("rejects case-insensitive duplicates, including hidden and archived ones", () => {
    const categoryId = addCustomCategory({
      name: "Psicologo",
      type: "expense",
    });

    expect(() =>
      addCustomCategory({ name: " psicologo ", type: "expense" }),
    ).toThrow(/esiste già/i);
    expect(() =>
      addCustomCategory({ name: "PSICOLOGO", type: "income" }),
    ).not.toThrow();

    archiveCustomCategory(categoryId);
    expect(() =>
      addCustomCategory({ name: "Psicologo", type: "expense" }),
    ).toThrow(/ripristinarla/i);

    hideDefaultCategory("vinted");
    expect(() =>
      addCustomCategory({ name: "VINTED", type: "income" }),
    ).toThrow(/ripristinarla/i);
  });

  it("renames only the custom category, not the stored transaction id", () => {
    const categoryId = addCustomCategory({
      name: "Psicologo",
      type: "expense",
    });
    const transactionId = addTransaction({
      type: "expense",
      amountCents: 8000,
      date: "2026-10-10",
      category: categoryId,
    });

    renameCustomCategory(categoryId, "Terapia");
    const data = getSnapshot().data;
    expect(data.transactions[0].id).toBe(transactionId);
    expect(data.transactions[0].category).toBe(categoryId);
    expect(
      getCategoryLabel(categoryId, "expense", createCategoryCatalog(data)),
    ).toBe("Terapia");
  });

  it("finds an archived duplicate for the restore suggestion", () => {
    const categoryId = addCustomCategory({
      name: "Ripetizioni",
      type: "income",
    });
    archiveCustomCategory(categoryId);
    const catalog = createCategoryCatalog(getSnapshot().data);
    const conflict = findCategoryByName("RIPETIZIONI", "income", catalog);

    expect(conflict?.id).toBe(categoryId);
    expect(conflict?.archived).toBe(true);
  });
});

describe("importer with category preferences", () => {
  it("does not silently assign a hidden default category", () => {
    const catalog = buildCategoryCatalog([], ["vinted"]);
    const suggested = suggestCategory(
      "income",
      "VINTED VENDITA",
      [],
      categoriesForType("income", catalog),
    );
    expect(suggested.category).toBe("altro-entrata");
    expect(suggested.source).toBe("fallback");
  });

  it("does not use a learned rule for an archived custom category", () => {
    const catalog = buildCategoryCatalog(
      [custom({ id: "category_bonus", name: "Bonus", type: "income", archivedAt: "2026-10-02T00:00:00.000Z" })],
      [],
    );
    const suggested = suggestCategory(
      "income",
      "BONUS SPECIALE",
      [
        {
          id: "rule_bonus",
          pattern: "BONUS",
          category: "category_bonus",
          kind: "income",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      categoriesForType("income", catalog),
    );
    expect(suggested.category).toBe("altro-entrata");
  });

  it("suggests only active categories in the bank review rows", () => {
    const catalog = buildCategoryCatalog(
      [custom({ id: "category_psico", name: "Psicologo", type: "expense" })],
      ["vinted"],
    );
    const rows = buildBankRows({
      matrix: [
        ["Data", "Descrizione", "Importo"],
        ["04/10/2026", "VINTED VENDITA", "+500,00"],
        ["05/10/2026", "PSICOLOGO STUDIO", "-80,00"],
      ],
      detection: {
        headerRowIndex: 0,
        mapping: { date: 0, description: 1, amount: 2, debit: null, credit: null },
      },
      existingTransactions: [],
      accounts: [],
      rules: [],
      categoryCatalog: catalog,
    });

    expect(rows[0].category).toBe("altro-entrata");
    expect(rows[0].category).not.toBe("vinted");
    expect(rows[1].category).toBe("altro-spesa");
  });
});

describe("backup preserves category preferences", () => {
  it("round-trips custom and hidden categories", () => {
    const data = dataWith({
      transactions: [vintedTransaction()],
      customCategories: [custom()],
      hiddenDefaultCategories: ["vinted"],
    });
    const parsed = parseBackup(serializeBackup(data));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.customCategoryCount).toBe(1);
    expect(parsed.summary.hiddenCategoryCount).toBe(1);
    expect(parsed.data.customCategories[0].name).toBe("Psicologo");
    expect(parsed.data.hiddenDefaultCategories).toEqual(["vinted"]);
    expect(parsed.data.transactions[0].category).toBe("vinted");
  });

  it("keeps loading old backups without the new fields", () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: "balance",
        version: 1,
        data: {
          version: 1,
          transactions: [vintedTransaction()],
          settings: { reflectionEnabled: true },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.customCategories).toEqual([]);
    expect(parsed.data.hiddenDefaultCategories).toEqual([]);
  });

  it("merges categories without duplicating ids or case-insensitive names", () => {
    const current = dataWith({ customCategories: [custom()] });
    const incoming = dataWith({
      customCategories: [
        custom(),
        custom({ id: "category_duplicate", name: " PSICOLOGO " }),
        custom({
          id: "category_ripetizioni",
          name: "Ripetizioni",
          type: "income",
        }),
      ],
      transactions: [
        vintedTransaction({
          id: "tx_mapped_category",
          type: "expense",
          category: "category_duplicate",
          description: "Seduta importata",
        }),
      ],
      monthlyBudgets: [
        {
          id: "budget_mapped",
          month: "2026-08",
          categories: { category_duplicate: 4000 },
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      historicalMonthlySummaries: [
        {
          id: "hist_mapped",
          month: "2026-08",
          incomeByCategory: {},
          expenseByCategory: { category_duplicate: 1500 },
          totalIncomeCents: 0,
          totalExpensesCents: 1500,
          savingsCents: -1500,
          source: "historical-import",
          createdAt: "2026-08-31T00:00:00.000Z",
        },
      ],
      categoryRules: [
        {
          id: "rule_mapped",
          pattern: "TERAPIA",
          category: "category_duplicate",
          kind: "expense",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      hiddenDefaultCategories: ["vinted"],
    });

    const merged = mergeBalanceData(current, incoming);
    expect(merged.customCategories).toHaveLength(2);
    expect(merged.customCategories.map((item) => item.name)).toEqual([
      "Psicologo",
      "Ripetizioni",
    ]);
    expect(merged.hiddenDefaultCategories).toEqual(["vinted"]);
    // Same logical category, different id: references follow the id on device.
    expect(
      merged.transactions.find((item) => item.id === "tx_mapped_category")
        ?.category,
    ).toBe("category_psicologo");
    expect(merged.monthlyBudgets[0].categories).toEqual({
      category_psicologo: 4000,
    });
    expect(
      merged.historicalMonthlySummaries[0].expenseByCategory,
    ).toEqual({ category_psicologo: 1500 });
    expect(merged.categoryRules[0].category).toBe("category_psicologo");

    const mergedAgain = mergeBalanceData(merged, incoming);
    expect(mergedAgain.customCategories).toHaveLength(2);
    expect(mergedAgain.hiddenDefaultCategories).toEqual(["vinted"]);
    expect(
      mergedAgain.transactions.find((item) => item.id === "tx_mapped_category")
        ?.category,
    ).toBe("category_psicologo");
  });
});
