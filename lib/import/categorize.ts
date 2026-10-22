import type { CategoryRule, TransactionType } from "../types";
import {
  CATEGORIES,
  type CategoryCatalog,
  type CategoryDefinition,
} from "../categories";

export interface CategorySuggestion {
  category: string | null;
  source: "learned" | "pattern" | "fallback" | "none";
  ruleId?: string;
}

const NOISE_TOKENS = new Set([
  "ADDEBITO",
  "ACCREDITO",
  "ACQUISTO",
  "BONIFICO",
  "CARTA",
  "CONTACTLESS",
  "DARE",
  "AVERE",
  "DETTAGLIO",
  "DISP",
  "DISPONIBILE",
  "INCASSO",
  "OPERAZIONE",
  "PAGAMENTO",
  "POS",
  "PRESSO",
  "SEPA",
  "SPESA",
  "TRANSACTION",
  "VISA",
  "MASTERCARD",
  "MAESTRO",
  "BANCOMAT",
]);

const EXPENSE_PATTERNS: Array<{ pattern: string; category: string }> = [
  { pattern: "ESSELUNGA", category: "cibo" },
  { pattern: "CARREFOUR", category: "cibo" },
  { pattern: "CONAD", category: "cibo" },
  { pattern: "COOP", category: "cibo" },
  { pattern: "LIDL", category: "cibo" },
  { pattern: "PENNY", category: "cibo" },
  { pattern: "EUROSPIN", category: "cibo" },
  { pattern: "DESPAR", category: "cibo" },
  { pattern: "IPER", category: "cibo" },
  { pattern: "PAM", category: "cibo" },
  { pattern: "TRENORD", category: "trasporti" },
  { pattern: "TRENITALIA", category: "trasporti" },
  { pattern: "ITALO", category: "trasporti" },
  { pattern: "ATM MILANO", category: "trasporti" },
  { pattern: "METRO", category: "trasporti" },
  { pattern: "AUTOBUS", category: "trasporti" },
  { pattern: "TRAM", category: "trasporti" },
  { pattern: "TPER", category: "trasporti" },
  { pattern: "GTT", category: "trasporti" },
  { pattern: "UBER", category: "trasporti" },
  { pattern: "TAXI", category: "trasporti" },
  { pattern: " ENI", category: "benzina" },
  { pattern: "Q8", category: "benzina" },
  { pattern: "ESSO", category: "benzina" },
  { pattern: "TAMOIL", category: "benzina" },
  { pattern: "SHELL", category: "benzina" },
  { pattern: "TOTALERG", category: "benzina" },
  { pattern: "ZARA", category: "vestiti" },
  { pattern: "H M", category: "vestiti" },
  { pattern: "UNIQLO", category: "vestiti" },
  { pattern: "MANGO", category: "vestiti" },
  { pattern: "SHEIN", category: "vestiti" },
  { pattern: "DECATHLON", category: "vestiti" },
  { pattern: "ESTETISTA", category: "estetista" },
  { pattern: "PARRUCCHIERE", category: "estetista" },
  { pattern: "BARBIERE", category: "estetista" },
  { pattern: "BOOKING", category: "viaggi" },
  { pattern: "AIRBNB", category: "viaggi" },
  { pattern: "RYANAIR", category: "viaggi" },
  { pattern: "HOTEL", category: "viaggi" },
];

const SALARY_PATTERNS = [
  "STIPENDIO",
  "SALARIO",
  "PAYROLL",
  "EMOLUMENTI",
  "RETRIBUZIONE",
  "BUSTA PAGA",
];

const INCOME_PATTERNS: Array<{ pattern: string; category: string }> = [
  { pattern: "VINTED", category: "vinted" },
  { pattern: "RIMBORSO", category: "rimborsi" },
  { pattern: "REFUND", category: "rimborsi" },
  { pattern: "STORNO", category: "rimborsi" },
  { pattern: "TUTORATO", category: "tutorato" },
  { pattern: "RIPETIZIONI", category: "tutorato" },
];

/** Uppercase, strip accents/punctuation and collapse whitespace. */
export function normalizeImportText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * The first meaningful token is intentionally used as the learned pattern.
 * It keeps "ESSELUNGA 1234" and "PAGAMENTO POS ESSELUNGA" on the same rule.
 */
export function deriveMerchantPattern(description: string): string {
  const normalized = normalizeImportText(description);
  const tokens = normalized.split(" ").filter((token) => {
    if (token.length < 3) return false;
    if (/^\d+$/.test(token)) return false;
    if (NOISE_TOKENS.has(token)) return false;
    return true;
  });
  return (tokens[0] ?? normalized).slice(0, 40);
}

function hasPattern(haystack: string, pattern: string): boolean {
  const words = new Set(haystack.split(" "));
  return pattern
    .split(" ")
    .filter(Boolean)
    .every((part) => words.has(part));
}

export function hasSalarySignal(description: string): boolean {
  const normalized = normalizeImportText(description);
  return SALARY_PATTERNS.some((pattern) => hasPattern(normalized, pattern));
}

/**
 * `availableCategories` contains only active categories for the user. A hidden
 * default or archived custom category is never returned: in that case the
 * importer falls back to an active category (or leaves the row without one).
 */
export function suggestCategory(
  type: Extract<TransactionType, "income" | "expense">,
  description: string,
  rules: CategoryRule[] = [],
  availableCategories?: CategoryDefinition[],
): CategorySuggestion {
  const available =
    availableCategories ??
    CATEGORIES.filter((category) => category.kind === type);
  const availableIds = new Set(available.map((category) => category.id));
  const normalized = normalizeImportText(description);

  const learned = rules
    .filter((rule) => rule.kind === type)
    .filter((rule) => hasPattern(normalized, rule.pattern))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .find((rule) => availableIds.has(rule.category));
  if (learned) {
    return { category: learned.category, source: "learned", ruleId: learned.id };
  }

  if (
    type === "income" &&
    availableIds.has("stipendio") &&
    hasSalarySignal(description)
  ) {
    return { category: "stipendio", source: "pattern" };
  }

  const patterns = type === "expense" ? EXPENSE_PATTERNS : INCOME_PATTERNS;
  const match = patterns.find(
    ({ pattern, category }) =>
      availableIds.has(category) &&
      (pattern.startsWith(" ")
        ? normalized.includes(pattern)
        : hasPattern(normalized, pattern)),
  );
  if (match) {
    return { category: match.category, source: "pattern" };
  }

  const preferredId = type === "expense" ? "altro-spesa" : "altro-entrata";
  const fallback =
    available.find((category) => category.id === preferredId) ?? available[0];
  return {
    category: fallback?.id ?? null,
    source: fallback ? "fallback" : "none",
  };
}

export function isExpenseCategory(
  categoryId: string,
  catalog: CategoryCatalog = CATEGORIES,
): boolean {
  return catalog.some(
    (category) => category.id === categoryId && category.kind === "expense",
  );
}

export function isIncomeCategory(
  categoryId: string,
  catalog: CategoryCatalog = CATEGORIES,
): boolean {
  return catalog.some(
    (category) => category.id === categoryId && category.kind === "income",
  );
}
