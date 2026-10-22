import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_INTERPRET_MAX_ROWS,
  AiInterpretInputError,
  AiInterpretResponseError,
  buildInterpretResponseSchema,
  interpretStatementWithAi,
  parseAiInterpretInput,
  parseAiInterpretation,
  sanitizeAiCell,
  validateInterpretedMapping,
  type AiInterpretInput,
  type AiInterpretRowInput,
} from "../lib/import/ai-interpret";
import {
  AUTO_MAPPING_ACCEPT_RATIO,
  AUTO_MAPPING_GOOD_RATIO,
  buildAiSample,
  chooseMapping,
  planAiBatches,
  plannedAiMovements,
  validRowRatio,
} from "../lib/import/auto";
import {
  buildBankRows,
  detectColumns,
  parseCsv,
  type BankImportRow,
  type ColumnMapping,
} from "../lib/import/bank";
import { resetAiRateLimits } from "../lib/import/ai-rate-limit";
import { POST as interpretPost } from "../app/api/import/interpret/route";

const { readSheetMock } = vi.hoisted(() => ({
  readSheetMock: vi.fn(),
}));

vi.mock("read-excel-file/browser", () => ({
  readSheet: readSheetMock,
}));

const amountMapping: ColumnMapping = {
  date: 0,
  description: 1,
  amount: 2,
  debit: null,
  credit: null,
};

const creditDebitMapping: ColumnMapping = {
  date: 0,
  description: 1,
  amount: null,
  debit: 2,
  credit: 3,
};

function row(rowNumber: number, cells: string[]): AiInterpretRowInput {
  return { rowNumber, cells };
}

function interpretInput(rows: AiInterpretRowInput[]): AiInterpretInput {
  return {
    fileType: "csv",
    rowCount: rows.length,
    columnCount: Math.max(...rows.map((entry) => entry.cells.length)),
    rows,
  };
}

function validProposal(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    headerRowNumber: 1,
    amountMode: "amount",
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
    debitColumn: -1,
    creditColumn: -1,
    dateKind: "operation",
    nonMovementRows: [1, 6],
    confidence: 92,
    ...overrides,
  });
}

const standardRows: AiInterpretRowInput[] = [
  row(1, ["Data", "Descrizione", "Importo"]),
  row(2, ["18/10/2026", "ESSELUNGA", "-32,40"]),
  row(3, ["17/10/2026", "FARMACIA", "-12,00"]),
  row(4, ["16/10/2026", "STIPENDIO", "1.500,00"]),
  row(5, ["15/10/2026", "TRENORD", "-5,20"]),
  row(6, ["", "Saldo finale", "2.000,00"]),
];

function bankRow(overrides: Partial<BankImportRow> = {}): BankImportRow {
  return {
    id: "bank-row-2",
    rowNumber: 2,
    rawDate: "18/10/2026",
    rawDescription: "ESSELUNGA",
    date: "2026-10-18",
    description: "ESSELUNGA",
    originalDescription: "ESSELUNGA",
    amountCents: 3240,
    type: "expense",
    suggestedType: "expense",
    category: "altro-spesa",
    suggestedCategory: "altro-spesa",
    suggestionSource: "fallback",
    issues: [],
    duplicate: false,
    possibleTransfer: false,
    include: true,
    valid: true,
    importFingerprint: "fingerprint",
    occurrenceIndex: 0,
    ...overrides,
  };
}

describe("structured statement interpretation", () => {
  it("accepts a header that is not on the first row", async () => {
    const input = interpretInput([
      row(1, ["Estratto conto ottobre 2026", "", ""]),
      row(2, ["", "", ""]),
      row(3, ["Data", "Descrizione", "Importo"]),
      row(4, ["18/10/2026", "ESSELUNGA", "-32,40"]),
      row(5, ["17/10/2026", "FARMACIA", "-12,00"]),
      row(6, ["16/10/2026", "TRENORD", "-5,20"]),
    ]);

    const result = await interpretStatementWithAi({
      input,
      generate: async () =>
        validProposal({ headerRowNumber: 3, nonMovementRows: [1, 2, 3] }),
    });

    expect(result.mapping).toEqual(amountMapping);
    expect(result.headerRowNumber).toBe(3);
    expect(result.dateKind).toBe("operation");
    expect(result.confidence).toBe(92);
    expect(result.nonMovementRows).toEqual([1, 2, 3]);
  });

  it("accepts separate debit and credit columns", async () => {
    const input = interpretInput([
      row(1, ["Data", "Descrizione", "Dare", "Avere"]),
      row(2, ["18/10/2026", "ESSELUNGA", "32,40", ""]),
      row(3, ["17/10/2026", "STIPENDIO", "", "1.500,00"]),
      row(4, ["16/10/2026", "TRENORD", "5,20", ""]),
    ]);

    const result = await interpretStatementWithAi({
      input,
      generate: async () =>
        validProposal({
          headerRowNumber: 1,
          amountMode: "debit-credit",
          amountColumn: -1,
          debitColumn: 2,
          creditColumn: 3,
          nonMovementRows: [1],
        }),
    });

    expect(result.mapping).toEqual(creditDebitMapping);
    expect(result.amountMode).toBe("debit-credit");
  });

  it("rejects a proposal whose columns do not parse as dates and amounts", async () => {
    const input = interpretInput(standardRows);
    const result = await interpretStatementWithAi({
      input,
      generate: async () =>
        validProposal({
          headerRowNumber: 1,
          dateColumn: 2,
          descriptionColumn: 0,
          amountColumn: 1,
        }),
    });

    expect(result.mapping).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("returns null instead of throwing for an incomplete mapping", () => {
    const result = parseAiInterpretation(
      validProposal({ amountColumn: -1 }),
      interpretInput(standardRows),
    );
    expect(result.mapping).toBeNull();
  });

  it("rejects malformed structured output", () => {
    expect(() =>
      parseAiInterpretation("not-json", interpretInput(standardRows)),
    ).toThrow(AiInterpretResponseError);
    expect(() =>
      parseAiInterpretation(
        JSON.stringify({ headerRowNumber: 1 }),
        interpretInput(standardRows),
      ),
    ).toThrow(AiInterpretResponseError);
    expect(() =>
      parseAiInterpretation(
        validProposal({ dateColumn: 99 }),
        interpretInput(standardRows),
      ),
    ).toThrow(AiInterpretResponseError);
  });

  it("validates the mapping on the sample with the deterministic parser", () => {
    expect(
      validateInterpretedMapping(amountMapping, 1, standardRows),
    ).toBe(true);
    expect(
      validateInterpretedMapping(
        { ...amountMapping, date: 1, description: 0 },
        1,
        standardRows,
      ),
    ).toBe(false);
  });

  it("bounds the sample sent by the browser", () => {
    expect(() =>
      parseAiInterpretInput({
        fileType: "csv",
        rowCount: 100,
        columnCount: 3,
        rows: Array.from({ length: AI_INTERPRET_MAX_ROWS + 1 }, (_, index) =>
          row(index + 1, ["18/10/2026", "NEGOZIO", "-1,00"]),
        ),
      }),
    ).toThrow(AiInterpretInputError);

    expect(() =>
      parseAiInterpretInput({
        fileType: "csv",
        rowCount: 2,
        columnCount: 3,
        rows: [row(1, []), row(1, [])],
      }),
    ).toThrow(AiInterpretInputError);

    expect(() =>
      parseAiInterpretInput({
        fileType: "pdf",
        rowCount: 2,
        columnCount: 3,
        rows: [row(1, [])],
      }),
    ).toThrow(AiInterpretInputError);
  });

  it("builds a schema that contains no financial values", () => {
    const schema = buildInterpretResponseSchema({
      rowCount: 10,
      columnCount: 5,
    }) as { properties: Record<string, unknown> };
    const keys = Object.keys(schema.properties);

    expect(keys).toContain("dateColumn");
    expect(keys).toContain("descriptionColumn");
    expect(keys).not.toContain("amountCents");
    expect(keys).not.toContain("date");
    expect(keys).not.toContain("balance");
  });

  it("sanitizes identifiers but preserves dates and amounts", () => {
    expect(
      sanitizeAiCell(
        "BONIFICO MARIO ROSSI IT60X0542811101000000123456 " +
          "mario.rossi@example.com 4111111111111111",
      ),
    ).not.toContain("IT60X0542811101000000123456");
    expect(
      sanitizeAiCell(
        "BONIFICO MARIO ROSSI IT60X0542811101000000123456 " +
          "mario.rossi@example.com 4111111111111111",
      ),
    ).not.toContain("mario.rossi@example.com");
    expect(sanitizeAiCell("18/10/2026")).toBe("18/10/2026");
    expect(sanitizeAiCell("-1.234,56")).toBe("-1.234,56");
    expect(sanitizeAiCell("12345678")).not.toBe("12345678");
    expect(sanitizeAiCell("4111 1111 1111 1111")).not.toContain(
      "4111 1111 1111 1111",
    );
  });

  it("sends sanitized rows and no identifiers to Gemini", async () => {
    let prompt = "";
    const input = interpretInput([
      row(1, ["Data", "Descrizione", "Importo"]),
      row(2, [
        "18/10/2026",
        "BONIFICO IT60X0542811101000000123456 mario.rossi@example.com",
        "-32,40",
      ]),
      row(3, ["17/10/2026", "FARMACIA", "-12,00"]),
      row(4, ["16/10/2026", "TRENORD", "-5,20"]),
      row(5, ["", "Saldo finale", "2.000,00"]),
    ]);

    await interpretStatementWithAi({
      input,
      generate: async (request) => {
        prompt = request.prompt;
        return validProposal({ nonMovementRows: [1, 5] });
      },
    });

    expect(prompt).toContain("18/10/2026");
    expect(prompt).toContain("-32,40");
    expect(prompt).not.toContain("IT60X0542811101000000123456");
    expect(prompt).not.toContain("mario.rossi@example.com");
    expect(prompt).not.toContain("2.000,00");
  });

  it("does not bypass the import when Gemini is unavailable", async () => {
    const input = interpretInput(standardRows);
    await expect(
      interpretStatementWithAi({
        input,
        generate: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow("offline");
  });
});

describe("automatic mapping and batching", () => {
  it("uses a good deterministic mapping without calling AI", () => {
    const choice = chooseMapping({
      localMappingComplete: true,
      localMapping: amountMapping,
      localRatio: AUTO_MAPPING_GOOD_RATIO,
      localHeaderRowIndex: 0,
      aiMappingComplete: true,
      aiMapping: creditDebitMapping,
      aiRatio: 1,
      aiHeaderRowIndex: 3,
      aiSkipRowNumbers: [1],
    });

    expect(choice).toMatchObject({
      source: "local",
      headerRowIndex: 0,
      mapping: amountMapping,
    });
  });

  it("prefers a validated AI mapping when the local one is weak", () => {
    const choice = chooseMapping({
      localMappingComplete: true,
      localMapping: amountMapping,
      localRatio: 0.2,
      localHeaderRowIndex: 0,
      aiMappingComplete: true,
      aiMapping: creditDebitMapping,
      aiRatio: 0.9,
      aiHeaderRowIndex: 3,
      aiSkipRowNumbers: [1, 2],
    });

    expect(choice).toMatchObject({
      source: "ai",
      headerRowIndex: 3,
      mapping: creditDebitMapping,
      skipRowNumbers: [1, 2],
    });
  });

  it("keeps an acceptable local mapping instead of blocking on a few rows", () => {
    const choice = chooseMapping({
      localMappingComplete: true,
      localMapping: amountMapping,
      localRatio: AUTO_MAPPING_ACCEPT_RATIO,
      localHeaderRowIndex: 0,
      aiMappingComplete: false,
      aiMapping: null,
      aiRatio: 0,
      aiHeaderRowIndex: -1,
      aiSkipRowNumbers: [],
    });

    expect(choice).toMatchObject({ source: "local" });
  });

  it("asks for manual mapping only when nothing is usable", () => {
    const choice = chooseMapping({
      localMappingComplete: true,
      localMapping: amountMapping,
      localRatio: 0.1,
      localHeaderRowIndex: 0,
      aiMappingComplete: false,
      aiMapping: null,
      aiRatio: 0,
      aiHeaderRowIndex: -1,
      aiSkipRowNumbers: [],
    });

    expect(choice).toBeNull();
  });

  it("caps AI work per import", () => {
    expect(plannedAiMovements(0, 25, 6)).toBe(0);
    expect(plannedAiMovements(40, 25, 6)).toBe(40);
    expect(plannedAiMovements(200, 25, 6)).toBe(150);
  });

  it("splits AI work into hard-capped sequential batches", () => {
    expect(planAiBatches([], 25, 6)).toEqual([]);
    expect(
      planAiBatches(
        Array.from({ length: 40 }, (_, index) => index),
        25,
        6,
      ).map((batch) => batch.length),
    ).toEqual([25, 15]);

    const capped = planAiBatches(
      Array.from({ length: 200 }, (_, index) => index),
      25,
      6,
    );
    expect(capped).toHaveLength(6);
    expect(capped.reduce((count, batch) => count + batch.length, 0)).toBe(150);
  });

  it("computes the valid-row ratio used to choose a mapping", () => {
    expect(validRowRatio([])).toBe(0);
    expect(
      validRowRatio([
        bankRow({ valid: true }),
        bankRow({ valid: false }),
        bankRow({ valid: true }),
        bankRow({ valid: true }),
      ]),
    ).toBe(0.75);
  });

  it("builds a bounded sample that keeps headers, dates and amounts", () => {
    const matrix = Array.from({ length: 200 }, (_, index) =>
      index === 0
        ? ["Data", "Descrizione", "Importo"]
        : [`${(index % 28) + 1}/10/2026`, `NEGOZIO ${index}`, "-12,50"],
    );
    const sample = buildAiSample(matrix);

    expect(sample.rowCount).toBe(200);
    expect(sample.columnCount).toBe(3);
    expect(sample.rows.length).toBeLessThanOrEqual(30);
    expect(sample.rows[0].cells).toEqual(["Data", "Descrizione", "Importo"]);
    expect(
      sample.rows.some((entry) => /^\d{1,2}\/10\/2026$/.test(entry.cells[0])),
    ).toBe(true);
    expect(
      sample.rows.every((entry) =>
        entry.cells.every((cell) => cell.length <= 100),
      ),
    ).toBe(true);
  });
});

describe("statement import fallbacks", () => {
  beforeEach(() => {
    readSheetMock.mockReset();
    resetAiRateLimits();
  });

  it("parses a standard CSV without AI", () => {
    const matrix = parseCsv(
      "Data;Descrizione;Importo\n18/10/2026;ESSELUNGA;-32,40\n17/10/2026;FARMACIA;-12,00\n",
    );
    const detection = detectColumns(matrix);
    const rows = buildBankRows({
      matrix,
      detection,
      existingTransactions: [],
      accounts: [],
      rules: [],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ category: "cibo", valid: true });
    expect(rows[1]).toMatchObject({ category: "salute", valid: true });
  });

  it("parses a standard XLSX through the existing parser", async () => {
    readSheetMock.mockResolvedValue([
      ["Data", "Descrizione", "Importo"],
      ["18/10/2026", "ESSELUNGA", "-32,40"],
      ["17/10/2026", "FARMACIA", "-12,00"],
    ]);
    const { parseStatementFile } = await import("../lib/import/file");
    const file = {
      name: "estratto.xlsx",
      size: 1024,
      arrayBuffer: async () => new ArrayBuffer(1024),
    } as File;

    const parsed = await parseStatementFile(file);
    const detection = detectColumns(parsed.matrix);

    expect(parsed.fileType).toBe("xlsx");
    expect(detection.mapping).toEqual(amountMapping);
    expect(readSheetMock).toHaveBeenCalledTimes(1);
  });

  it("still imports when AI interpretation is not available", async () => {
    const detection = detectColumns(
      parseCsv("Data;Descrizione;Importo\n18/10/2026;ESSELUNGA;-32,40\n"),
    );
    const rows = buildBankRows({
      matrix: parseCsv(
        "Data;Descrizione;Importo\n18/10/2026;ESSELUNGA;-32,40\n",
      ),
      detection,
      existingTransactions: [],
      accounts: [],
      rules: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].aiSuggestion).toBeUndefined();
  });

  it("never drops a valid movement because AI marked it as non-movement", () => {
    const matrix = [
      ["Data", "Descrizione", "Importo"],
      ["18/10/2026", "ESSELUNGA", "-32,40"],
      ["", "Saldo finale", "2.000,00"],
    ];
    const detection = detectColumns(matrix);
    const rows = buildBankRows({
      matrix,
      detection,
      existingTransactions: [],
      accounts: [],
      rules: [],
      skipRowNumbers: [2, 3],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rowNumber: 2, description: "ESSELUNGA" });
  });

  it("does not let the interpretation endpoint run without authentication", async () => {
    const response = await interpretPost(
      new Request("http://localhost/api/import/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileType: "csv",
          rowCount: 1,
          columnCount: 1,
          rows: [row(1, ["Data"])],
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "unauthorized",
    });
  });
});
