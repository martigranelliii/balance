import type {
  Account,
  CategoryRule,
  Transaction,
  TransactionType,
} from "../types";
import { isISODate } from "../dates";
import { isSafeCents } from "../money";
import {
  deriveMerchantPattern,
  hasSalarySignal,
  normalizeImportText,
  suggestCategory,
  type CategorySuggestion,
} from "./categorize";
import {
  categoriesForType,
  type CategoryCatalog,
} from "../categories";

export type SheetCell = string | number | boolean | Date | null | undefined;
export type SheetMatrix = SheetCell[][];

export interface ColumnMapping {
  date: number | null;
  description: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
}

export type ColumnRole = "date" | "description" | "amount" | "debit" | "credit";

export interface ColumnCandidate {
  index: number;
  label: string;
  score: number;
}

export interface ColumnDetection {
  headerRowIndex: number;
  headers: string[];
  mapping: ColumnMapping;
  confidence: "high" | "low";
  issues: string[];
  candidates: Record<ColumnRole, ColumnCandidate[]>;
}

export interface BankImportRow {
  id: string;
  rowNumber: number;
  rawDate: string;
  rawDescription: string;
  date: string | null;
  description: string;
  originalDescription: string;
  amountCents: number;
  type: TransactionType;
  suggestedType: TransactionType;
  category: string | null;
  suggestedCategory: string | null;
  suggestionSource: CategorySuggestion["source"];
  issues: string[];
  duplicate: boolean;
  possibleTransfer: boolean;
  accountId?: string;
  toAccountId?: string;
  include: boolean;
  valid: boolean;
  importFingerprint: string;
  occurrenceIndex: number;
}

export interface BuildRowsInput {
  matrix: SheetMatrix;
  detection: Pick<ColumnDetection, "headerRowIndex" | "mapping">;
  existingTransactions: Transaction[];
  accounts: Account[];
  rules: CategoryRule[];
  /** Full catalog including hidden/archived; suggestions use only active ones. */
  categoryCatalog?: CategoryCatalog;
}

export interface ReviewSummary {
  detected: number;
  ready: number;
  duplicates: number;
  possibleTransfers: number;
  needsReview: number;
}

export const DUPLICATE_ISSUE = "Questo movimento sembra già presente.";

const EMPTY_MAPPING: ColumnMapping = {
  date: null,
  description: null,
  amount: null,
  debit: null,
  credit: null,
};

const DATE_ALIASES: Record<string, number> = {
  dataoperazione: 14,
  dataoper: 14,
  transactiondate: 14,
  datacontabile: 12,
  dataregistrazione: 10,
  data: 10,
  date: 10,
  datamovimento: 10,
  bookingdate: 12,
  valuedate: 5,
  datavaluta: 5,
  valuta: 4,
};

const DESCRIPTION_ALIASES: Record<string, number> = {
  descrizione: 14,
  descrizioneoperazione: 14,
  causale: 14,
  transactiondescription: 14,
  description: 12,
  merchant: 12,
  dettagli: 10,
  dettaglio: 10,
  operazione: 8,
  memo: 8,
  narrative: 8,
  testo: 6,
  desc: 8,
};

const AMOUNT_ALIASES: Record<string, number> = {
  importo: 14,
  importoeuro: 14,
  importoeur: 14,
  amount: 12,
  transactionamount: 14,
  valore: 8,
  totale: 6,
  value: 7,
};

const DEBIT_ALIASES: Record<string, number> = {
  dare: 16,
  importodare: 16,
  debit: 14,
  addebito: 12,
  addebiti: 12,
  uscita: 10,
  uscite: 10,
  pagamenti: 8,
  spese: 5,
};

const CREDIT_ALIASES: Record<string, number> = {
  avere: 16,
  importoavere: 16,
  credit: 14,
  accredito: 12,
  accrediti: 12,
  entrata: 10,
  entrate: 10,
  incassi: 8,
};

/**
 * read-excel-file returns Excel dates as UTC midnight. Reading them with local
 * getters shifts the calendar day for users west of UTC, so always use UTC here.
 */
export function excelDateToISODate(value: Date): string | null {
  if (Number.isNaN(value.getTime())) return null;
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  return isISODate(date) ? date : null;
}

function cellText(value: SheetCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return excelDateToISODate(value) ?? "";
  return String(value).replace(/\s+/g, " ").trim();
}

function headerKey(value: SheetCell): string {
  return normalizeImportText(cellText(value)).toLowerCase().replace(/\s+/g, "");
}

function scoreAliases(key: string, aliases: Record<string, number>): number {
  if (!key) return 0;
  if (aliases[key] !== undefined) return aliases[key];
  let best = 0;
  for (const [alias, score] of Object.entries(aliases)) {
    if (alias.length < 3) continue;
    if (key.includes(alias)) best = Math.max(best, score - 2);
  }
  return best;
}

function matrixWidth(matrix: SheetMatrix): number {
  return matrix.slice(0, Math.min(matrix.length, 50)).reduce(
    (max, row) => Math.max(max, row.length),
    0,
  );
}

function getColumnCandidates(
  headers: SheetCell[],
  role: ColumnRole,
): ColumnCandidate[] {
  const aliases =
    role === "date"
      ? DATE_ALIASES
      : role === "description"
        ? DESCRIPTION_ALIASES
        : role === "amount"
          ? AMOUNT_ALIASES
          : role === "debit"
            ? DEBIT_ALIASES
            : CREDIT_ALIASES;

  return headers
    .map((header, index) => ({
      index,
      label: cellText(header) || columnLabel(index),
      score: scoreAliases(headerKey(header), aliases),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function candidateAt(candidates: ColumnCandidate[], rank = 0): number | null {
  return candidates[rank]?.index ?? null;
}

function rowHasHeaderSignals(
  row: SheetCell[],
): { score: number; date: boolean; description: boolean; money: boolean } {
  const date = getColumnCandidates(row, "date").length > 0;
  const description = getColumnCandidates(row, "description").length > 0;
  const amount = getColumnCandidates(row, "amount").length > 0;
  const debit = getColumnCandidates(row, "debit").length > 0;
  const credit = getColumnCandidates(row, "credit").length > 0;
  const money = amount || (debit && credit);
  return {
    score:
      (date ? 30 : 0) +
      (description ? 30 : 0) +
      (money ? 30 : 0) +
      (amount ? 3 : 0) +
      (debit ? 2 : 0) +
      (credit ? 2 : 0),
    date,
    description,
    money,
  };
}

export function detectColumns(matrix: SheetMatrix): ColumnDetection {
  if (matrix.length === 0) {
    return {
      headerRowIndex: -1,
      headers: [],
      mapping: EMPTY_MAPPING,
      confidence: "low",
      issues: ["Il file non contiene righe."],
      candidates: { date: [], description: [], amount: [], debit: [], credit: [] },
    };
  }

  let headerRowIndex = 0;
  let bestScore = -1;
  let bestComplete = false;
  const limit = Math.min(matrix.length, 25);
  for (let index = 0; index < limit; index += 1) {
    const signals = rowHasHeaderSignals(matrix[index] ?? []);
    if (signals.score <= 0) continue;
    const complete = signals.date && signals.description && signals.money;
    if (
      (complete && !bestComplete) ||
      (complete === bestComplete && signals.score > bestScore)
    ) {
      headerRowIndex = index;
      bestScore = signals.score;
      bestComplete = complete;
    }
  }

  if (bestScore < 0) headerRowIndex = -1;

  const headers =
    headerRowIndex >= 0
      ? (matrix[headerRowIndex] ?? [])
      : Array.from({ length: matrixWidth(matrix) }, (_, index) =>
          columnLabel(index),
        );
  const candidates = {
    date: getColumnCandidates(headers, "date"),
    description: getColumnCandidates(headers, "description"),
    amount: getColumnCandidates(headers, "amount"),
    debit: getColumnCandidates(headers, "debit"),
    credit: getColumnCandidates(headers, "credit"),
  };

  const hasDebitCredit =
    candidates.debit.length > 0 && candidates.credit.length > 0;
  const mapping: ColumnMapping = {
    date: candidateAt(candidates.date),
    description: candidateAt(candidates.description),
    amount: hasDebitCredit ? null : candidateAt(candidates.amount),
    debit: hasDebitCredit ? candidateAt(candidates.debit) : null,
    credit: hasDebitCredit ? candidateAt(candidates.credit) : null,
  };

  const issues: string[] = [];
  if (mapping.date === null) {
    issues.push("Non riesco a riconoscere la colonna della data.");
  }
  if (mapping.description === null) {
    issues.push("Non riesco a riconoscere la colonna della descrizione.");
  }
  if (
    mapping.amount === null &&
    (mapping.debit === null || mapping.credit === null)
  ) {
    issues.push("Non riesco a riconoscere la colonna dell'importo.");
  }

  if (
    candidates.date.length > 1 &&
    candidates.date[0].score === candidates.date[1].score
  ) {
    issues.push("Ci sono più colonne possibili per la data.");
  }
  if (
    candidates.description.length > 1 &&
    candidates.description[0].score === candidates.description[1].score
  ) {
    issues.push("Ci sono più colonne possibili per la descrizione.");
  }
  if (
    mapping.date !== null &&
    mapping.description !== null &&
    mapping.date === mapping.description
  ) {
    issues.push("Data e descrizione puntano alla stessa colonna.");
  }

  const complete =
    mapping.date !== null &&
    mapping.description !== null &&
    (mapping.amount !== null ||
      (mapping.debit !== null && mapping.credit !== null));

  return {
    headerRowIndex,
    headers: headers.map((value, index) => cellText(value) || columnLabel(index)),
    mapping,
    confidence: complete && issues.length === 0 ? "high" : "low",
    issues,
    candidates,
  };
}

export function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return `Colonna ${label}`;
}

export function isMappingComplete(mapping: ColumnMapping): boolean {
  if (mapping.date === null || mapping.description === null) return false;
  if (mapping.date === mapping.description) return false;
  if (mapping.amount !== null) return true;
  return mapping.debit !== null && mapping.credit !== null;
}

export function mappingMode(
  mapping: ColumnMapping,
): "amount" | "debit-credit" {
  if (mapping.amount !== null) return "amount";
  if (mapping.debit !== null || mapping.credit !== null) return "debit-credit";
  return "amount";
}

export function parseCsv(text: string, delimiter?: string): SheetMatrix {
  const source = text.replace(/^\uFEFF/, "");
  if (!source.trim()) return [];

  const separator = delimiter ?? detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === separator) {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 8).join("\n");
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let index = 0; index < sample.length; index += 1) {
      const character = sample[index];
      if (character === '"') {
        if (inQuotes && sample[index + 1] === '"') index += 1;
        else inQuotes = !inQuotes;
      } else if (!inQuotes && character === candidate) {
        count += 1;
      }
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseImportDate(value: SheetCell): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return excelDateToISODate(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1 || value > 2958465) return null;
    return excelDateToISODate(
      new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000),
    );
  }

  const raw = cellText(value).replace(/^\uFEFF/, "");
  if (!raw) return null;

  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    return isISODate(date) ? date : null;
  }

  match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (match) {
    let day = Number(match[1]);
    let month = Number(match[2]);
    const year = Number(match[3]);
    if (month > 12 && day <= 12) {
      const swap = day;
      day = month;
      month = swap;
    }
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isISODate(date) ? date : null;
  }

  return null;
}

export function parseImportAmount(value: SheetCell): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const cents = Math.round(value * 100);
    if (!isSafeCents(cents)) return null;
    if (Math.abs(value * 100 - cents) > 0.0001) return null;
    return cents;
  }

  let text = cellText(value);
  if (!text) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/\s/g, "").replace(/[€$£]/g, "").replace(/EUR/gi, "");
  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (text.startsWith("+")) text = text.slice(1);
  if (text.startsWith("-") || text.startsWith("−")) {
    negative = true;
    text = text.slice(1);
  }
  if (!text || !/^[\d.,]+$/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let integerPart = text;
  let fractionPart = "";

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalIndex = Math.max(lastComma, lastDot);
    const separator = text[decimalIndex];
    integerPart = text.slice(0, decimalIndex);
    fractionPart = text.slice(decimalIndex + 1);
    if (fractionPart.length < 1 || fractionPart.length > 2) return null;
    const groupingSeparator = separator === "," ? "." : ",";
    integerPart = integerPart.replace(
      new RegExp(`\\${groupingSeparator}`, "g"),
      "",
    );
  } else if (lastComma !== -1) {
    const pieces = text.split(",");
    if (pieces.length > 2) {
      if (!/^\d{1,3}(,\d{3})+$/.test(text)) return null;
      integerPart = pieces.join("");
    } else if (pieces[1].length === 1 || pieces[1].length === 2) {
      integerPart = pieces[0];
      fractionPart = pieces[1];
    } else if (pieces[1].length === 3) {
      // "1,234" is ambiguous between US grouping and an invalid 3-decimal euro
      // amount. Reject it rather than silently changing the value.
      return null;
    } else {
      return null;
    }
  } else if (lastDot !== -1) {
    const pieces = text.split(".");
    if (pieces.length > 2) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(text)) return null;
      integerPart = pieces.join("");
    } else if (pieces[1].length === 1 || pieces[1].length === 2) {
      integerPart = pieces[0];
      fractionPart = pieces[1];
    } else if (pieces[1].length === 3) {
      integerPart = pieces.join("");
    } else {
      return null;
    }
  }

  if (!integerPart) integerPart = "0";
  if (!/^\d+$/.test(integerPart)) return null;
  if (fractionPart && !/^\d+$/.test(fractionPart)) return null;

  const whole = Number(integerPart);
  if (!Number.isSafeInteger(whole)) return null;
  const fraction = Number((fractionPart + "00").slice(0, 2));
  const cents = whole * 100 + fraction;
  if (!isSafeCents(cents)) return null;
  return negative ? -cents : cents;
}

function hasValue(value: SheetCell): boolean {
  return cellText(value) !== "";
}

function getMappedCell(row: SheetCell[], index: number | null): SheetCell {
  return index === null ? null : row[index];
}

function possibleTransfer(description: string, accounts: Account[]): boolean {
  const normalized = normalizeImportText(description);
  if (!normalized || hasSalarySignal(normalized)) return false;

  if (
    ["GIROCONTO", "GIRO CONTO", "TRASFERIMENTO", "TRANSFER"].some((pattern) =>
      normalized.includes(pattern),
    )
  ) {
    return true;
  }

  if (normalized.includes("BONIFICO")) {
    return accounts.some((account) => {
      const accountKey = normalizeImportText(account.name);
      return accountKey.length >= 3 && normalized.includes(accountKey);
    });
  }

  return false;
}

function transactionDescription(value: SheetCell): string {
  return cellText(value).slice(0, 280);
}

function fingerprintDescription(value: string): string {
  return normalizeImportText(value);
}

export function importSignature(input: {
  date: string;
  type: TransactionType;
  amountCents: number;
  description: string;
  accountId?: string | null;
}): string {
  return [
    input.date,
    input.type,
    input.amountCents,
    fingerprintDescription(input.description),
    input.accountId ?? "",
  ].join("|");
}

function hashFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fp_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createImportFingerprint(
  input: {
    date: string;
    type: TransactionType;
    amountCents: number;
    description: string;
    accountId?: string | null;
  },
  occurrenceIndex = 0,
): string {
  return hashFingerprint(`${importSignature(input)}|${occurrenceIndex}`);
}

function isDuplicateOfExisting(
  row: {
    date: string;
    type: TransactionType;
    amountCents: number;
    description: string;
    accountId?: string;
  },
  existingTransactions: Transaction[],
): boolean {
  return existingTransactions.some((transaction) => {
    if (transaction.date !== row.date) return false;
    if (transaction.type !== row.type) return false;
    if (transaction.amountCents !== row.amountCents) return false;
    if (
      fingerprintDescription(transaction.description ?? "") !==
      fingerprintDescription(row.description)
    ) {
      return false;
    }
    if (
      transaction.accountId &&
      row.accountId &&
      transaction.accountId !== row.accountId
    ) {
      return false;
    }
    return true;
  });
}

export function buildBankRows(input: BuildRowsInput): BankImportRow[] {
  const {
    matrix,
    detection,
    existingTransactions,
    accounts,
    rules,
    categoryCatalog,
  } = input;
  const mapping = detection.mapping;
  if (!isMappingComplete(mapping)) {
    return [];
  }

  const rows: BankImportRow[] = [];
  const start = Math.max(0, detection.headerRowIndex + 1);

  for (let rowIndex = start; rowIndex < matrix.length; rowIndex += 1) {
    const rawRow = matrix[rowIndex] ?? [];
    const rawDate = getMappedCell(rawRow, mapping.date);
    const rawDescription = getMappedCell(rawRow, mapping.description);
    const dateText = cellText(rawDate);
    const descriptionText = cellText(rawDescription);

    if (!rawRow.some((cell) => hasValue(cell))) continue;
    if (!dateText && !descriptionText && !hasValue(rawDescription)) {
      const hasMoney =
        hasValue(getMappedCell(rawRow, mapping.amount)) ||
        hasValue(getMappedCell(rawRow, mapping.debit)) ||
        hasValue(getMappedCell(rawRow, mapping.credit));
      if (!hasMoney) continue;
    }

    const issues: string[] = [];
    const date = parseImportDate(rawDate);
    if (!date) issues.push("Data non valida o non riconosciuta.");

    let signedCents: number | null = null;
    if (mapping.amount !== null) {
      signedCents = parseImportAmount(getMappedCell(rawRow, mapping.amount));
    } else {
      const debit = parseImportAmount(getMappedCell(rawRow, mapping.debit));
      const credit = parseImportAmount(getMappedCell(rawRow, mapping.credit));
      if (debit !== null && credit !== null && debit !== 0 && credit !== 0) {
        issues.push("Dare e avere sono entrambi compilati.");
        signedCents = credit - debit;
      } else if (credit !== null && credit !== 0) {
        signedCents = Math.abs(credit);
      } else if (debit !== null && debit !== 0) {
        signedCents = -Math.abs(debit);
      } else if (debit !== null || credit !== null) {
        issues.push("Importo zero.");
      }
    }

    if (signedCents === null) {
      issues.push("Importo non valido o non riconosciuto.");
    } else if (signedCents === 0) {
      issues.push("Importo zero.");
    }

    if (!descriptionText) issues.push("Descrizione mancante.");
    if (signedCents !== null && Math.abs(signedCents) > Number.MAX_SAFE_INTEGER) {
      issues.push("Importo troppo grande.");
    }

    const amountCents = signedCents === null ? 0 : Math.abs(signedCents);
    const baseValid =
      Boolean(date) &&
      Boolean(descriptionText) &&
      amountCents > 0 &&
      isSafeCents(amountCents);

    const isTransfer = possibleTransfer(descriptionText, accounts);
    let type: TransactionType = isTransfer
      ? "transfer"
      : signedCents !== null && signedCents > 0
        ? "income"
        : "expense";

    const suggestion =
      type === "transfer"
        ? { category: null, source: "none" as const }
        : suggestCategory(
            type,
            descriptionText,
            rules,
            categoriesForType(type, categoryCatalog),
          );

    const valid = baseValid;
    rows.push({
      id: `bank-row-${rowIndex + 1}`,
      rowNumber: rowIndex + 1,
      rawDate: dateText,
      rawDescription: descriptionText,
      date,
      description: transactionDescription(rawDescription),
      originalDescription: descriptionText.slice(0, 500),
      amountCents,
      type,
      suggestedType: type,
      category: suggestion.category,
      suggestedCategory: suggestion.category,
      suggestionSource: suggestion.source,
      issues,
      duplicate: false,
      possibleTransfer: isTransfer,
      include: baseValid && issues.length === 0 && !isTransfer,
      valid: baseValid,
      importFingerprint: "",
      occurrenceIndex: 0,
    });
  }

  const occurrences = new Map<string, number>();
  for (const row of rows) {
    if (!row.date || row.amountCents <= 0) continue;
    const signature = importSignature({
      date: row.date,
      type: row.type,
      amountCents: row.amountCents,
      description: row.description,
      accountId: row.accountId,
    });
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);
    row.occurrenceIndex = occurrence;
    row.importFingerprint = createImportFingerprint(
      {
        date: row.date,
        type: row.type,
        amountCents: row.amountCents,
        description: row.description,
        accountId: row.accountId,
      },
      occurrence,
    );
    row.duplicate = isDuplicateOfExisting(
      {
        date: row.date,
        type: row.type,
        amountCents: row.amountCents,
        description: row.description,
        accountId: row.accountId,
      },
      existingTransactions,
    );
    if (row.duplicate) {
      row.include = false;
      row.issues.push(DUPLICATE_ISSUE);
    }
  }

  return rows;
}

export function isImportRowReady(row: BankImportRow): boolean {
  if (!row.include || !row.valid || !row.date || !row.description) return false;
  if (row.issues.some((issue) => issue !== DUPLICATE_ISSUE)) return false;
  if (row.amountCents <= 0) return false;
  if (row.type === "transfer") {
    return (
      Boolean(row.accountId) &&
      Boolean(row.toAccountId) &&
      row.accountId !== row.toAccountId
    );
  }
  return Boolean(row.category);
}

export function summarizeReview(rows: BankImportRow[]): ReviewSummary {
  return {
    detected: rows.length,
    ready: rows.filter(isImportRowReady).length,
    duplicates: rows.filter((row) => row.duplicate).length,
    possibleTransfers: rows.filter((row) => row.possibleTransfer).length,
    needsReview: rows.filter(
      (row) =>
        !row.duplicate &&
        (row.issues.length > 0 || (row.include && !isImportRowReady(row))),
    ).length,
  };
}

export function suggestedCategoryFor(
  type: Extract<TransactionType, "income" | "expense">,
  description: string,
  rules: CategoryRule[],
  categoryCatalog?: CategoryCatalog,
): CategorySuggestion {
  return suggestCategory(
    type,
    description,
    rules,
    categoriesForType(type, categoryCatalog),
  );
}

export function merchantPatternFor(description: string): string {
  return deriveMerchantPattern(description);
}
