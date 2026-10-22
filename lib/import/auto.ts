import {
  excelDateToISODate,
  type BankImportRow,
  type ColumnMapping,
  type SheetMatrix,
} from "./bank";

/** A mapping is used without AI help above this valid-row ratio. */
export const AUTO_MAPPING_GOOD_RATIO = 0.7;
/** Below this ratio a mapping is not trustworthy enough to skip manual help. */
export const AUTO_MAPPING_ACCEPT_RATIO = 0.25;

export const AI_SAMPLE_MAX_ROWS = 30;
export const AI_SAMPLE_HEAD_ROWS = 12;
export const AI_SAMPLE_MAX_COLUMNS = 20;
export const AI_SAMPLE_MAX_CELL = 100;

export function validRowRatio(rows: BankImportRow[]): number {
  if (rows.length === 0) return 0;
  return rows.filter((row) => row.valid).length / rows.length;
}

/** Hard cap for one import: never an unbounded sequence of AI calls. */
export function plannedAiMovements(
  candidateCount: number,
  batchSize: number,
  maxBatches: number,
): number {
  if (candidateCount <= 0) return 0;
  return Math.min(candidateCount, Math.max(0, batchSize * maxBatches));
}

/** Controlled batching: fixed-size chunks, hard cap, no retries. */
export function planAiBatches<T>(
  items: T[],
  batchSize: number,
  maxBatches: number,
): T[][] {
  if (batchSize <= 0 || maxBatches <= 0) return [];
  const planned = items.slice(
    0,
    plannedAiMovements(items.length, batchSize, maxBatches),
  );
  const batches: T[][] = [];
  for (let offset = 0; offset < planned.length; offset += batchSize) {
    batches.push(planned.slice(offset, offset + batchSize));
  }
  return batches;
}

export interface AiSampleRow {
  rowNumber: number;
  cells: string[];
}

export interface AiSample {
  rowCount: number;
  columnCount: number;
  rows: AiSampleRow[];
}

function sampleIndexes(rowCount: number): number[] {
  if (rowCount === 0) return [];

  const indexes = new Set<number>();
  const head = Math.min(AI_SAMPLE_HEAD_ROWS, rowCount);
  for (let index = 0; index < head; index += 1) indexes.add(index);

  const remaining = rowCount - head;
  // Always keep the last rows: totals and "saldo" notes usually live there.
  const tail = Math.min(3, remaining);
  for (let index = 0; index < tail; index += 1) {
    indexes.add(rowCount - tail + index);
  }

  const middle = remaining - tail;
  const extra = Math.min(
    AI_SAMPLE_MAX_ROWS - head - tail,
    Math.max(0, middle),
  );
  if (extra > 0) {
    const step = middle / extra;
    for (let index = 0; index < extra; index += 1) {
      indexes.add(
        head + Math.min(middle - 1, Math.floor(index * step)),
      );
    }
  }

  return [...indexes].sort((a, b) => a - b);
}

function sampleCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return excelDateToISODate(value) ?? "";
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, AI_SAMPLE_MAX_CELL);
}

/**
 * A bounded, structured representation of the file. Never the raw file, never
 * the whole statement: the first rows (where headers usually live) plus an
 * even sample of the remaining rows.
 */
export function buildAiSample(matrix: SheetMatrix): AiSample {
  const rowCount = matrix.length;
  const fullWidth = matrix.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  );
  const columnCount = Math.min(fullWidth, AI_SAMPLE_MAX_COLUMNS);

  return {
    rowCount,
    columnCount,
    rows: sampleIndexes(rowCount).map((index) => ({
      rowNumber: index + 1,
      cells: Array.from({ length: columnCount }, (_, column) =>
        sampleCell(matrix[index]?.[column]),
      ),
    })),
  };
}

export interface MappingChoice {
  headerRowIndex: number;
  mapping: ColumnMapping;
  skipRowNumbers: number[];
  source: "local" | "ai";
}

/**
 * Picks the deterministic mapping whenever it is good enough, otherwise the
 * AI mapping only when it validates better. Manual mapping is the last resort.
 */
export function chooseMapping(options: {
  localMappingComplete: boolean;
  localMapping: ColumnMapping;
  localRatio: number;
  localHeaderRowIndex: number;
  aiMappingComplete: boolean;
  aiMapping: ColumnMapping | null;
  aiRatio: number;
  aiHeaderRowIndex: number;
  aiSkipRowNumbers: number[];
}): MappingChoice | null {
  const {
    localMappingComplete,
    localMapping,
    localRatio,
    localHeaderRowIndex,
    aiMappingComplete,
    aiMapping,
    aiRatio,
    aiHeaderRowIndex,
    aiSkipRowNumbers,
  } = options;

  if (localMappingComplete && localRatio >= AUTO_MAPPING_GOOD_RATIO) {
    return {
      headerRowIndex: localHeaderRowIndex,
      mapping: localMapping,
      skipRowNumbers: [],
      source: "local",
    };
  }

  if (
    aiMappingComplete &&
    aiMapping &&
    aiRatio >= AUTO_MAPPING_ACCEPT_RATIO &&
    aiRatio >= localRatio
  ) {
    return {
      headerRowIndex: aiHeaderRowIndex,
      mapping: aiMapping,
      skipRowNumbers: aiSkipRowNumbers,
      source: "ai",
    };
  }

  if (localMappingComplete && localRatio >= AUTO_MAPPING_ACCEPT_RATIO) {
    return {
      headerRowIndex: localHeaderRowIndex,
      mapping: localMapping,
      skipRowNumbers: [],
      source: "local",
    };
  }

  return null;
}
