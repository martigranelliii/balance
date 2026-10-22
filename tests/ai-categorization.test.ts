import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_MAX_MOVEMENTS,
  AI_SYSTEM_INSTRUCTION,
  AiInputError,
  AiResponseError,
  buildAiResponseSchema,
  parseAiMovementsInput,
  parseAiSuggestions,
  sanitizeAiDescription,
  type AiCategories,
  type AiMovementInput,
} from "../lib/import/ai";
import {
  AiServiceError,
  categorizeMovementsWithAi,
} from "../lib/import/ai-service";
import {
  consumeAiRateLimit,
  resetAiRateLimits,
} from "../lib/import/ai-rate-limit";
import {
  applyAiSuggestions,
  buildBankRows,
  detectColumns,
  isAiCandidate,
  type BankImportRow,
} from "../lib/import/bank";
import { buildCategoryCatalog } from "../lib/categories";
import type { CategoryRule } from "../lib/types";
import { POST } from "../app/api/import/categorize/route";

const catalog = buildCategoryCatalog();

const categories: AiCategories = {
  income: [
    { id: "stipendio", label: "Stipendio" },
    { id: "rimborsi", label: "Rimborsi" },
  ],
  expense: [
    { id: "cibo", label: "Cibo" },
    { id: "altro-spesa", label: "Altro" },
  ],
};

const movement: AiMovementInput = {
  ref: "bank-row-2",
  description: "ESSELUNGA 1234",
  direction: "expense",
};

function bankRow(overrides: Partial<BankImportRow> = {}): BankImportRow {
  return {
    id: "bank-row-2",
    rowNumber: 2,
    rawDate: "18/10/2026",
    rawDescription: "ESSELUNGA 1234",
    date: "2026-10-18",
    description: "ESSELUNGA 1234",
    originalDescription: "ESSELUNGA 1234",
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

function sourceFiles(dir: string): string[] {
  const absolute = path.resolve(process.cwd(), dir);
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (relative === path.join("app", "api")) return [];
        return sourceFiles(relative);
      }
      return /\.(?:ts|tsx)$/.test(entry.name) ? [relative] : [];
    });
}

describe("AI request privacy and validation", () => {
  it("removes identifiers, contact data, dates and long references", () => {
    const sanitized = sanitizeAiDescription(
      "BONIFICO DA SIG. MARIO ROSSI IT60X0542811101000000123456 " +
        "ESSELUNGA 1234 12/10/2026 mario.rossi@example.com " +
        "4111111111111111 +39 333 123 4567 https://example.com/pay",
    );

    expect(sanitized).toContain("ESSELUNGA");
    expect(sanitized).toContain("[IBAN]");
    expect(sanitized).toContain("[EMAIL]");
    expect(sanitized).toContain("[URL]");
    expect(sanitized).toContain("[NOME]");
    expect(sanitized).not.toContain("MARIO ROSSI");
    expect(sanitized).not.toContain("IT60X0542811101000000123456");
    expect(sanitized).not.toContain("mario.rossi@example.com");
    expect(sanitized).not.toContain("4111111111111111");
    expect(sanitized).not.toContain("12/10/2026");
    expect(sanitized).not.toContain("333 123 4567");
    expect(sanitized.length).toBeLessThanOrEqual(180);
  });

  it("limits movements per request and rejects malformed payloads", () => {
    expect(() => parseAiMovementsInput({ movements: [] })).toThrow(AiInputError);
    expect(() =>
      parseAiMovementsInput({
        movements: Array.from({ length: AI_MAX_MOVEMENTS + 1 }, (_, index) => ({
          ref: `r${index}`,
          description: "NEGOZIO",
          direction: "expense",
        })),
      }),
    ).toThrowError(/massimo/i);
    expect(() =>
      parseAiMovementsInput({
        movements: [{ ref: "r1", description: "X", direction: "transfer" }],
      }),
    ).toThrow(AiInputError);
    expect(() =>
      parseAiMovementsInput({
        movements: [
          { ref: "r1", description: "X", direction: "expense" },
          { ref: "r1", description: "Y", direction: "expense" },
        ],
      }),
    ).toThrow(AiInputError);
    expect(parseAiMovementsInput({ movements: [movement] })).toEqual([movement]);
  });

  it("builds a schema with only the user's available category ids", () => {
    const schema = buildAiResponseSchema(categories) as {
      properties: {
        suggestions: {
          items: { properties: { categoryId: { enum: string[] } } };
        };
      };
    };
    const enumValues = schema.properties.suggestions.items.properties.categoryId.enum;

    expect(enumValues).toEqual(["stipendio", "rimborsi", "cibo", "altro-spesa"]);
    expect(enumValues).not.toContain("inventata");
  });

  it("rejects invalid structured output and invented categories", () => {
    expect(() => parseAiSuggestions("non-json", categories, [movement])).toThrow(
      AiResponseError,
    );
    expect(() => parseAiSuggestions("{}", categories, [movement])).toThrow(
      AiResponseError,
    );

    const valid = parseAiSuggestions(
      JSON.stringify({
        suggestions: [
          {
            ref: "bank-row-2",
            merchant: "Esselunga",
            categoryId: "cibo",
            cleanDescription: "Esselunga",
            possibleTransfer: false,
            confidence: 140,
          },
          {
            ref: "bank-row-2",
            merchant: "Duplicato",
            categoryId: "cibo",
            cleanDescription: "Duplicato",
            possibleTransfer: false,
            confidence: 50,
          },
          {
            ref: "bank-row-2",
            merchant: "Inventato",
            categoryId: "inventata",
            cleanDescription: "Inventato",
            possibleTransfer: false,
            confidence: 90,
          },
          {
            ref: "bank-row-2",
            merchant: "Direzione errata",
            categoryId: "stipendio",
            cleanDescription: "Direzione errata",
            possibleTransfer: false,
            confidence: 80,
          },
        ],
      }),
      categories,
      [movement],
    );

    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({
      ref: "bank-row-2",
      categoryId: "cibo",
      confidence: 100,
    });
  });
});

describe("AI service fallbacks", () => {
  it("sends applied personal rules only as context for the AI", async () => {
    let captured = "";

    await categorizeMovementsWithAi({
      categories,
      movements: [movement],
      rules: [
        {
          pattern: "BERSHKA",
          categoryId: "cibo",
          kind: "expense",
        },
      ],
      generate: async (request) => {
        captured = request.prompt;
        return JSON.stringify({
          suggestions: [
            {
              ref: "bank-row-2",
              merchant: "Esselunga",
              categoryId: "cibo",
              cleanDescription: "Esselunga",
              possibleTransfer: false,
              confidence: 91,
            },
          ],
        });
      },
    });

    expect(captured).toContain("REGOLE_PERSONALI");
    expect(captured).toContain("BERSHKA");
    expect(captured).not.toContain("amountCents");
  });

  it("sanitizes descriptions before calling the generator", async () => {
    let captured = "";
    let systemInstruction = "";
    let schema: Record<string, unknown> = {};

    await categorizeMovementsWithAi({
      categories,
      movements: [
        {
          ...movement,
          description:
            "ESSELUNGA 4111111111111111 mario.rossi@example.com 12/10/2026",
        },
      ],
      generate: async (request) => {
        captured = request.prompt;
        systemInstruction = request.systemInstruction;
        schema = request.schema;
        return JSON.stringify({
          suggestions: [
            {
              ref: "bank-row-2",
              merchant: "Esselunga",
              categoryId: "cibo",
              cleanDescription: "Esselunga",
              possibleTransfer: false,
              confidence: 91,
            },
          ],
        });
      },
    });

    expect(captured).toContain("ESSELUNGA");
    expect(captured).toContain("[RIFERIMENTO]");
    expect(captured).toContain("[EMAIL]");
    expect(captured).not.toContain("4111111111111111");
    expect(captured).not.toContain("mario.rossi@example.com");
    expect(captured).not.toContain("12/10/2026");
    expect(systemInstruction).toBe(AI_SYSTEM_INSTRUCTION);
    expect(schema).toHaveProperty("properties.suggestions");
  });

  it("returns a typed error when the generator is offline", async () => {
    await expect(
      categorizeMovementsWithAi({
        categories,
        movements: [movement],
        generate: async () => {
          throw new Error("network offline");
        },
      }),
    ).rejects.toMatchObject({ code: "generation_failed" });
  });

  it("returns a typed error for an invalid structured response", async () => {
    await expect(
      categorizeMovementsWithAi({
        categories,
        movements: [movement],
        generate: async () => "<html>not json</html>",
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("does not retry and preserves a timeout error from the generator", async () => {
    let calls = 0;
    await expect(
      categorizeMovementsWithAi({
        categories,
        movements: [movement],
        generate: async () => {
          calls += 1;
          throw new AiServiceError("timeout", "timeout");
        },
      }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(calls).toBe(1);
  });

  it("preserves a rate-limit error and stops after one call", async () => {
    let calls = 0;
    await expect(
      categorizeMovementsWithAi({
        categories,
        movements: [movement],
        generate: async () => {
          calls += 1;
          throw new AiServiceError("rate_limited", "quota");
        },
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(calls).toBe(1);
  });
});

describe("AI row selection and application", () => {
  const matrix = [
    ["Data operazione", "Descrizione", "Importo"],
    ["18/10/2026", "ESSELUNGA 1234", "-32,40"],
    ["17/10/2026", "NEGOZIO SCONOSCIUTO", "-10,00"],
    ["16/10/2026", "TRENORD 8891", "-5,20"],
    ["15/10/2026", "GIROCONTO RISPARMIO", "-500,00"],
  ];

  function rowsFor(rules: CategoryRule[] = []) {
    const detection = detectColumns(matrix);
    return buildBankRows({
      matrix,
      detection,
      existingTransactions: [],
      accounts: [],
      rules,
      categoryCatalog: catalog,
    });
  }

  it("never sends rows already classified by personal rules or patterns", () => {
    const rows = rowsFor([
      {
        id: "rule_1",
        pattern: "ESSELUNGA",
        category: "cibo",
        kind: "expense",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);

    expect(rows[0].suggestionSource).toBe("learned");
    expect(isAiCandidate(rows[0], catalog)).toBe(false);
    expect(rows[2].suggestionSource).toBe("pattern");
    expect(isAiCandidate(rows[2], catalog)).toBe(false);
    expect(rows[1].suggestionSource).toBe("fallback");
    expect(isAiCandidate(rows[1], catalog)).toBe(true);
    expect(rows[3].type).toBe("transfer");
    expect(isAiCandidate(rows[3], catalog)).toBe(false);
  });

  it("does not analyze duplicates, excluded rows or rows already analyzed", () => {
    const duplicate = bankRow({ duplicate: true, include: false });
    const excluded = bankRow({ include: false });
    const analyzed = bankRow({
      aiSuggestion: {
        ref: "bank-row-2",
        merchant: "Esselunga",
        categoryId: "cibo",
        cleanDescription: "Esselunga",
        possibleTransfer: false,
        confidence: 90,
      },
    });
    const corrected = bankRow({ categoryEdited: true });

    expect(isAiCandidate(duplicate, catalog)).toBe(false);
    expect(isAiCandidate(excluded, catalog)).toBe(false);
    expect(isAiCandidate(analyzed, catalog)).toBe(false);
    expect(isAiCandidate(corrected, catalog)).toBe(false);
  });

  it("changes only the category and AI metadata, never deterministic fields", () => {
    const row = bankRow();
    const [updated] = applyAiSuggestions(
      [row],
      [
        {
          ref: "bank-row-2",
          merchant: "Esselunga",
          categoryId: "cibo",
          cleanDescription: "Esselunga Milano",
          possibleTransfer: false,
          confidence: 88,
        },
      ],
      catalog,
    );

    expect(updated.category).toBe("cibo");
    expect(updated.aiSuggestion?.confidence).toBe(88);
    expect(updated.date).toBe(row.date);
    expect(updated.amountCents).toBe(row.amountCents);
    expect(updated.type).toBe(row.type);
    expect(updated.description).toBe(row.description);
    expect(updated.originalDescription).toBe(row.originalDescription);
    expect(updated.importFingerprint).toBe(row.importFingerprint);
    expect(updated.duplicate).toBe(row.duplicate);
    expect(updated.include).toBe(row.include);
    expect(updated.accountId).toBe(row.accountId);
  });

  it("ignores invented categories and duplicate rows", () => {
    const row = bankRow();
    const [unchanged] = applyAiSuggestions(
      [row],
      [
        {
          ref: "bank-row-2",
          merchant: "Inventato",
          categoryId: "inventata",
          cleanDescription: "Inventato",
          possibleTransfer: false,
          confidence: 99,
        },
      ],
      catalog,
    );
    expect(unchanged).toEqual(row);

    const duplicate = bankRow({ duplicate: true });
    const [duplicateUnchanged] = applyAiSuggestions(
      [duplicate],
      [
        {
          ref: "bank-row-2",
          merchant: "Esselunga",
          categoryId: "cibo",
          cleanDescription: "Esselunga",
          possibleTransfer: false,
          confidence: 99,
        },
      ],
      catalog,
    );
    expect(duplicateUnchanged).toEqual(duplicate);
  });

  it("keeps the parser and import flow working without AI", () => {
    const rows = rowsFor();
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.aiSuggestion === undefined)).toBe(true);
    expect(rows[0].importFingerprint).toBeTruthy();
  });
});

describe("AI endpoint and rate limit", () => {
  beforeEach(() => {
    resetAiRateLimits();
  });

  it("requires authentication before using Gemini", async () => {
    const response = await POST(
      new Request("http://localhost/api/import/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movements: [movement] }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "unauthorized",
    });
  });

  it("limits requests per user in a fixed window", () => {
    const start = 1_000_000;
    for (let index = 0; index < 8; index += 1) {
      expect(consumeAiRateLimit("user-1", start).allowed).toBe(true);
    }
    const blocked = consumeAiRateLimit("user-1", start);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(consumeAiRateLimit("user-2", start).allowed).toBe(true);
    expect(consumeAiRateLimit("user-1", start + 5 * 60_000).allowed).toBe(true);
  });
});

describe("server-only AI configuration", () => {
  it("never exposes the Gemini key to client source files", () => {
    const files = [
      ...sourceFiles("components"),
      ...sourceFiles("lib"),
      ...sourceFiles("app"),
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("GEMINI_API_KEY");
      expect(source, file).not.toContain("NEXT_PUBLIC_GEMINI");
    }

    const clientSource = fs.readFileSync(
      path.resolve(process.cwd(), "lib/import/ai-client.ts"),
      "utf8",
    );
    expect(clientSource).not.toContain("@google/genai");
    expect(clientSource).not.toContain("ai-service");
    expect(clientSource).toContain("/api/import/categorize");
  });

  it("keeps the key out of git and documents it without a value", () => {
    const envExample = fs.readFileSync(
      path.resolve(process.cwd(), ".env.local.example"),
      "utf8",
    );
    expect(envExample).toContain("GEMINI_API_KEY=");
    expect(envExample).not.toMatch(/GEMINI_API_KEY=.+/);

    const gitignore = fs.readFileSync(
      path.resolve(process.cwd(), ".gitignore"),
      "utf8",
    );
    expect(gitignore).toContain(".env*");
    expect(gitignore).toContain("!.env.local.example");
  });

  it("does not save anything from the AI action", () => {
    const component = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "components/import/ImportStatementSheet.tsx",
      ),
      "utf8",
    );
    const start = component.indexOf("async function analyzeRowsWithAi");
    const end = component.indexOf("function changeType");
    const aiBlock = component.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(aiBlock).not.toContain("importBankTransactions");
    expect(aiBlock).not.toContain("saveCloudBalance");
    expect(aiBlock).not.toContain(".upsert(");
  });

  it("uses the recommended server SDK and never a public key variable", () => {
    const route = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "app/api/import/categorize/route.ts",
      ),
      "utf8",
    );
    const gemini = fs.readFileSync(
      path.resolve(process.cwd(), "lib/import/gemini.ts"),
      "utf8",
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(gemini).toContain("@google/genai");
    expect(gemini).toContain("interactions.create");
    expect(route).toContain("GEMINI_API_KEY");
    expect(route).not.toContain("NEXT_PUBLIC_GEMINI");
    expect(packageJson.dependencies?.["@google/genai"]).toBeTruthy();
  });
});
