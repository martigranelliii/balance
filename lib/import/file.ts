import { parseCsv, type SheetMatrix } from "./bank";

export const MAX_IMPORT_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_COLUMNS = 120;

export type BankFileType = "csv" | "xlsx";

export class StatementFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementFileError";
  }
}

export interface ParsedStatementFile {
  matrix: SheetMatrix;
  fileType: BankFileType;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function decodeCsv(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.some((byte) => byte === 0)) {
    throw new StatementFileError(
      "Il file non sembra un CSV. Esporta l'estratto conto in CSV o Excel.",
    );
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      throw new StatementFileError(
        "Non riesco a leggere il testo del file. Prova a esportarlo in UTF-8.",
      );
    }
  }
}

function enforceLimits(matrix: SheetMatrix): void {
  if (matrix.length > MAX_IMPORT_ROWS) {
    throw new StatementFileError(
      `Il file supera il limite di ${MAX_IMPORT_ROWS.toLocaleString("it-IT")} righe.`,
    );
  }
  const widest = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  if (widest > MAX_IMPORT_COLUMNS) {
    throw new StatementFileError(
      `Il file supera il limite di ${MAX_IMPORT_COLUMNS} colonne.`,
    );
  }
}

export async function parseStatementFile(file: File): Promise<ParsedStatementFile> {
  if (file.size === 0) {
    throw new StatementFileError("Il file è vuoto.");
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new StatementFileError(
      "Il file supera 12 MB. Esporta un intervallo più breve dall'estratto conto.",
    );
  }

  const extension = extensionOf(file.name);
  if (extension === "xls") {
    throw new StatementFileError(
      "I file .xls non sono supportati. Esporta l'estratto conto in .xlsx o CSV.",
    );
  }

  if (extension === "csv" || extension === "txt") {
    const text = decodeCsv(await file.arrayBuffer());
    const matrix = parseCsv(text);
    if (matrix.length === 0) {
      throw new StatementFileError("Il file non contiene righe leggibili.");
    }
    enforceLimits(matrix);
    return { matrix, fileType: "csv" };
  }

  if (extension === "xlsx") {
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const matrix = (await readSheet(file)) as SheetMatrix;
      if (!matrix || matrix.length === 0) {
        throw new StatementFileError(
          "Il file non contiene righe leggibili nel primo foglio.",
        );
      }
      enforceLimits(matrix);
      return { matrix, fileType: "xlsx" };
    } catch (error) {
      if (error instanceof StatementFileError) throw error;
      throw new StatementFileError(
        "Non riesco a leggere questo file Excel. Controlla che non sia protetto da password.",
      );
    }
  }

  throw new StatementFileError("Formato non supportato. Usa CSV o .xlsx.");
}
