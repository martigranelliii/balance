import { describe, expect, it } from "vitest";
import type { Account, CategoryRule, Transaction } from "../lib/types";
import {
  buildBankRows,
  createImportFingerprint,
  detectColumns,
  isImportRowReady,
  parseCsv,
  parseImportAmount,
  parseImportDate,
  summarizeReview,
  type SheetMatrix,
} from "../lib/import/bank";
import {
  deriveMerchantPattern,
  normalizeImportText,
  suggestCategory,
} from "../lib/import/categorize";
import { normalizeBalanceData } from "../lib/storage";
import { summarizeTransactions } from "../lib/finance";

const account: Account = {
  id: "acc_checking",
  name: "Conto principale",
  type: "checking",
  currentBalanceCents: 250000,
  includeInNetWorth: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const histories: Record<string, unknown> = {
  date: "2026-01-01T00:00:00.000Z",
};

function existing(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx_existing",
    date: "2026-10-18",
    type: "expense",
    amountCents: 3240,
    category: "cibo",
    description: "ESSELUNGA 1234",
    createdAt: String(histories.date),
    updatedAt: String(histories.date),
    ...overrides,
  };
}

function rule(overrides: Partial<CategoryRule> = {}): CategoryRule {
  return {
    id: "rule_1",
    pattern: "ESSELUNGA",
    category: "cibo",
    kind: "expense",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const commonMatrix: SheetMatrix = [
  ["Data operazione", "Descrizione", "Importo"],
  ["18/10/2026", "BONIFICO STIPENDIO ACME", "+1.500,00"],
  ["17/10/2026", "ESSELUNGA 1234", "-32,40"],
  ["16/10/2026", "TRENORD 8891", "-5,20"],
  ["15/10/2026", "GIROCONTO CONTO RISPARMIO", "-500,00"],
];

describe("statement CSV parsing", () => {
  it("detects semicolons, quoted fields and line breaks", () => {
    const rows = parseCsv(
      'Data;Descrizione;Importo\r\n18/10/2026;"ESSELUNGA\nMILANO";-32,40\r\n',
    );
    expect(rows).toEqual([
      ["Data", "Descrizione", "Importo"],
      ["18/10/2026", "ESSELUNGA\nMILANO", "-32,40"],
    ]);
  });

  it("ignores fully empty rows and unquotes doubled quotes", () => {
    const rows = parseCsv('Data,Descrizione,Importo\n\n18/10/2026,"BAR ""CENTRALE""",-5,00');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe('BAR "CENTRALE"');
  });
});

describe("European money and bank dates", () => {
  it("parses Italian and international formats into integer cents", () => {
    expect(parseImportAmount("12,50")).toBe(1250);
    expect(parseImportAmount("€ 12,50")).toBe(1250);
    expect(parseImportAmount("1.234,56")).toBe(123456);
    expect(parseImportAmount("+1.500,00")).toBe(150000);
    expect(parseImportAmount("-12,50")).toBe(-1250);
    expect(parseImportAmount("(12,50)")).toBe(-1250);
    expect(parseImportAmount("1,234.56")).toBe(123456);
    expect(parseImportAmount(32.4)).toBe(3240);
  });

  it("rejects ambiguous or malformed amounts", () => {
    expect(parseImportAmount("1,234")).toBeNull();
    expect(parseImportAmount("12,345")).toBeNull();
    expect(parseImportAmount("abc")).toBeNull();
    expect(parseImportAmount("12,50 € extra")).toBeNull();
  });

  it("normalizes dates without UTC conversion", () => {
    expect(parseImportDate("18/10/2026")).toBe("2026-10-18");
    expect(parseImportDate("18-10-2026")).toBe("2026-10-18");
    expect(parseImportDate("2026-10-18T23:30:00Z")).toBe("2026-10-18");
    expect(parseImportDate("10/21/2026")).toBe("2026-10-21");
    expect(parseImportDate(new Date(Date.UTC(2026, 9, 18)))).toBe("2026-10-18");
    expect(parseImportDate(46313)).toBe("2026-10-18");
    expect(parseImportDate("31/02/2026")).toBeNull();
    expect(parseImportDate("non una data")).toBeNull();
  });
});

describe("column detection", () => {
  it("detects date, description and amount columns", () => {
    const detection = detectColumns(commonMatrix);
    expect(detection.confidence).toBe("high");
    expect(detection.mapping.date).toBe(0);
    expect(detection.mapping.description).toBe(1);
    expect(detection.mapping.amount).toBe(2);
  });

  it("offers generic columns for a headerless file", () => {
    const matrix: SheetMatrix = [
      ["18/10/2026", "ESSELUNGA", "-32,40"],
      ["17/10/2026", "TRENORD", "-5,20"],
    ];
    const detection = detectColumns(matrix);
    expect(detection.headerRowIndex).toBe(-1);
    expect(detection.confidence).toBe("low");
    expect(detection.headers).toEqual(["Colonna A", "Colonna B", "Colonna C"]);
    const rows = buildBankRows({
      matrix,
      detection: {
        headerRowIndex: detection.headerRowIndex,
        mapping: {
          date: 0,
          description: 1,
          amount: 2,
          debit: null,
          credit: null,
        },
      },
      existingTransactions: [],
      accounts: [],
      rules: [],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-10-18", category: "cibo" });
  });

  it("prefers the operation date over a value date", () => {
    const matrix: SheetMatrix = [
      ["Data operazione", "Data valuta", "Descrizione", "Importo"],
      ["18/10/2026", "19/10/2026", "ESSELUNGA", "-32,40"],
    ];
    const detection = detectColumns(matrix);
    expect(detection.mapping.date).toBe(0);
    expect(detection.confidence).toBe("high");
  });

  it("uses debit and credit columns when both exist", () => {
    const matrix: SheetMatrix = [
      ["Data", "Causale", "Dare", "Avere"],
      ["18/10/2026", "ESSELUNGA", "32,40", ""],
    ];
    const detection = detectColumns(matrix);
    expect(detection.mapping.amount).toBeNull();
    expect(detection.mapping.debit).toBe(2);
    expect(detection.mapping.credit).toBe(3);
  });

  it("flags ambiguous date columns instead of guessing", () => {
    const matrix: SheetMatrix = [
      ["Data", "Date", "Descrizione", "Importo"],
      ["18/10/2026", "18/10/2026", "ESSELUNGA", "-32,40"],
    ];
    const detection = detectColumns(matrix);
    expect(detection.confidence).toBe("low");
    expect(detection.issues.join(" ")).toMatch(/più colonne possibili per la data/i);
  });
});

describe("row normalization", () => {
  it("classifies salary, food, transport and possible transfers", () => {
    const detection = detectColumns(commonMatrix);
    const rows = buildBankRows({
      matrix: commonMatrix,
      detection,
      existingTransactions: [],
      accounts: [account],
      rules: [],
    });
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      date: "2026-10-18",
      type: "income",
      amountCents: 150000,
      category: "stipendio",
    });
    expect(rows[1]).toMatchObject({
      type: "expense",
      amountCents: 3240,
      category: "cibo",
    });
    expect(rows[2].category).toBe("trasporti");
    expect(rows[3]).toMatchObject({
      type: "transfer",
      category: null,
      possibleTransfer: true,
      include: false,
    });
  });

  it("normalizes Excel-style rows with debit/credit columns", () => {
    const matrix: SheetMatrix = [
      ["Data operazione", "Descrizione", "Dare", "Avere"],
      [new Date(Date.UTC(2026, 9, 18)), "ESSELUNGA 1234", "32,40", null],
      [new Date(Date.UTC(2026, 9, 17)), "BONIFICO STIPENDIO", null, 1500],
    ];
    const detection = detectColumns(matrix);
    const rows = buildBankRows({
      matrix,
      detection,
      existingTransactions: [],
      accounts: [],
      rules: [],
    });
    expect(rows[0]).toMatchObject({
      date: "2026-10-18",
      type: "expense",
      amountCents: 3240,
    });
    expect(rows[1]).toMatchObject({
      date: "2026-10-17",
      type: "income",
      amountCents: 150000,
    });
  });

  it("marks malformed rows and does not make them ready", () => {
    const matrix: SheetMatrix = [
      ["Data", "Descrizione", "Importo"],
      ["non una data", "", "abc"],
    ];
    const detection = detectColumns(matrix);
    const rows = buildBankRows({
      matrix,
      detection,
      existingTransactions: [],
      accounts: [],
      rules: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].valid).toBe(false);
    expect(rows[0].include).toBe(false);
    expect(rows[0].issues.length).toBeGreaterThan(1);
    expect(isImportRowReady(rows[0])).toBe(false);
    expect(summarizeReview(rows).needsReview).toBe(1);
  });

  it("keeps a debit and credit row out of the import when both are filled", () => {
    const matrix: SheetMatrix = [
      ["Data", "Descrizione", "Dare", "Avere"],
      ["18/10/2026", "ESSELUNGA", "32,40", "32,40"],
    ];
    const detection = detectColumns(matrix);
    const rows = buildBankRows({
      matrix,
      detection,
      existingTransactions: [],
      accounts: [],
      rules: [],
    });
    expect(rows[0].issues.join(" ")).toMatch(/entrambi compilati/i);
    expect(rows[0].include).toBe(false);
    expect(isImportRowReady({ ...rows[0], include: true })).toBe(false);
  });
});

describe("category suggestions and learned rules", () => {
  it("uses ATM MILANO for transit without treating cash withdrawals as travel", () => {
    expect(suggestCategory("expense", "ATM MILANO", []).category).toBe("trasporti");
    expect(suggestCategory("expense", "PRELIEVO ATM", []).category).toBe("altro-spesa");
  });

  it("understands sign-sensitive Vinted descriptions", () => {
    expect(suggestCategory("income", "VINTED VENDITA", []).category).toBe("vinted");
    expect(suggestCategory("expense", "VINTED ACQUISTO", []).category).toBe(
      "altro-spesa",
    );
  });

  it("applies a local learned rule before built-in patterns", () => {
    const suggestion = suggestCategory("expense", "ESSELUNGA 9999", [
      rule({ category: "trasporti" }),
    ]);
    expect(suggestion).toMatchObject({
      category: "trasporti",
      source: "learned",
      ruleId: "rule_1",
    });
  });

  it("derives a stable merchant pattern from noisy descriptions", () => {
    expect(normalizeImportText("Pagamento POS Esselunga 1234")).toBe(
      "PAGAMENTO POS ESSELUNGA 1234",
    );
    expect(deriveMerchantPattern("Pagamento POS Esselunga 1234")).toBe("ESSELUNGA");
  });
});

describe("duplicate protection", () => {
  it("flags an existing transaction as a possible duplicate", () => {
    const detection = detectColumns(commonMatrix);
    const rows = buildBankRows({
      matrix: commonMatrix,
      detection,
      existingTransactions: [existing({ date: "2026-10-17" })],
      accounts: [],
      rules: [],
    });
    expect(rows[1].duplicate).toBe(true);
    expect(rows[1].include).toBe(false);
    expect(summarizeReview(rows).duplicates).toBe(1);
  });

  it("keeps two identical rows in one file distinct", () => {
    const matrix: SheetMatrix = [
      ["Data", "Descrizione", "Importo"],
      ["18/10/2026", "CAFFE", "-1,20"],
      ["18/10/2026", "CAFFE", "-1,20"],
    ];
    const detection = detectColumns(matrix);
    const rows = buildBankRows({
      matrix,
      detection,
      existingTransactions: [],
      accounts: [],
      rules: [],
    });
    expect(rows[0].occurrenceIndex).toBe(0);
    expect(rows[1].occurrenceIndex).toBe(1);
    expect(rows[0].importFingerprint).not.toBe(rows[1].importFingerprint);
    expect(rows[0].duplicate).toBe(false);
    expect(rows[1].duplicate).toBe(false);
  });

  it("creates the same fingerprint for the same imported row", () => {
    const input = {
      date: "2026-10-18",
      type: "expense" as const,
      amountCents: 3240,
      description: "ESSELUNGA 1234",
    };
    expect(createImportFingerprint(input, 0)).toBe(
      createImportFingerprint(input, 0),
    );
    expect(createImportFingerprint(input, 0)).not.toBe(
      createImportFingerprint(input, 1),
    );
  });
});

describe("transfers stay outside income and expense", () => {
  it("does not count imported transfers in monthly summaries", () => {
    const detection = detectColumns(commonMatrix);
    const rows = buildBankRows({
      matrix: commonMatrix,
      detection,
      existingTransactions: [],
      accounts: [account],
      rules: [],
    });
    const transactions: Transaction[] = rows
      .filter((row) => row.type !== "transfer")
      .map((row, index) => ({
        id: `tx_${index}`,
        date: row.date!,
        type: row.type,
        amountCents: row.amountCents,
        category: row.category,
        description: row.description,
        createdAt: "2026-10-18T10:00:00.000Z",
        updatedAt: "2026-10-18T10:00:00.000Z",
      }));
    const summary = summarizeTransactions(transactions, "2026-10");
    expect(summary.expenseCents).toBe(3240 + 520);
    expect(summary.incomeCents).toBe(150000);
  });
});

describe("backward-compatible storage additions", () => {
  it("loads older data without import collections", () => {
    const result = normalizeBalanceData({
      version: 1,
      transactions: [existing()],
    });
    expect(result.data.categoryRules).toEqual([]);
    expect(result.data.importBatches).toEqual([]);
  });

  it("keeps import metadata and normalized rules on reload", () => {
    const result = normalizeBalanceData({
      version: 1,
      transactions: [
        existing({
          source: "bank-import",
          importBatchId: "import_1",
          originalDescription: "ESSELUNGA 1234",
          importFingerprint: "fp_12345678",
          importedAt: "2026-10-18T10:00:00.000Z",
        }),
      ],
      categoryRules: [rule()],
      importBatches: [
        {
          id: "import_1",
          fileName: "estratto.csv",
          fileType: "csv",
          importedAt: "2026-10-18T10:00:00.000Z",
          transactionCount: 1,
          rowCount: 1,
          skippedCount: 0,
        },
      ],
    });
    expect(result.data.transactions[0].source).toBe("bank-import");
    expect(result.data.transactions[0].importFingerprint).toBe("fp_12345678");
    expect(result.data.categoryRules).toHaveLength(1);
    expect(result.data.importBatches[0].fileName).toBe("estratto.csv");
  });
});
