"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Account, BalanceData } from "@/lib/types";
import {
  applyAiSuggestions,
  buildBankRows,
  columnLabel,
  detectColumns,
  DUPLICATE_ISSUE,
  isAiCandidate,
  isImportRowReady,
  isMappingComplete,
  mappingMode as getMappingMode,
  excelDateToISODate,
  merchantPatternFor,
  suggestedCategoryFor,
  summarizeReview,
  type BankImportRow,
  type ColumnDetection,
  type ColumnMapping,
  type SheetMatrix,
} from "@/lib/import/bank";
import {
  AI_MAX_AUTO_BATCHES,
  AI_MAX_MOVEMENTS,
  type AiSuggestion,
} from "@/lib/import/ai";
import {
  requestAiInterpretation,
  requestAiSuggestions,
} from "@/lib/import/ai-client";
import {
  AUTO_MAPPING_GOOD_RATIO,
  buildAiSample,
  chooseMapping,
  planAiBatches,
  validRowRatio,
  type MappingChoice,
} from "@/lib/import/auto";
import {
  parseStatementFile,
  type BankFileType,
} from "@/lib/import/file";
import {
  categoriesForType,
  createCategoryCatalog,
  getCategoryLabel,
  type CategoryCatalog,
} from "@/lib/categories";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import { formatMoney, formatSignedMoney } from "@/lib/money";
import { importBankTransactions } from "@/lib/store";
import { Sheet } from "../ui/Sheet";
import { Icon } from "../ui/Icon";

type Stage = "upload" | "reading" | "organizing" | "mapping" | "review";

interface ImportStatementSheetProps {
  data: BalanceData;
  onClose: () => void;
  onImported: (count: number) => void;
}

interface FileInfo {
  name: string;
  type: BankFileType;
}

const EMPTY_MAPPING: ColumnMapping = {
  date: null,
  description: null,
  amount: null,
  debit: null,
  credit: null,
};

const TYPE_OPTIONS = [
  { value: "expense", label: "Spesa" },
  { value: "income", label: "Entrata" },
  { value: "transfer", label: "Trasferimento" },
] as const;

function joinNotes(...notes: Array<string | null | undefined>): string | null {
  const text = notes.filter((note): note is string => Boolean(note)).join(" ");
  return text || null;
}

export function ImportStatementSheet({
  data,
  onClose,
  onImported,
}: ImportStatementSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<SheetMatrix | null>(null);
  const [detection, setDetection] = useState<ColumnDetection | null>(null);
  const [draftMapping, setDraftMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [draftMode, setDraftMode] = useState<"amount" | "debit-credit">("amount");
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [rows, setRows] = useState<BankImportRow[]>([]);
  const [visibleCount, setVisibleCount] = useState(50);
  const [rememberRules, setRememberRules] = useState(true);
  const [importing, setImporting] = useState(false);
  const [analysisNote, setAnalysisNote] = useState<string | null>(null);
  const analysisRunRef = useRef(0);

  const categoryCatalog = useMemo(
    () => createCategoryCatalog(data),
    [data],
  );
  const summary = useMemo(() => summarizeReview(rows), [rows]);
  const readyRows = useMemo(() => rows.filter(isImportRowReady), [rows]);
  const visibleRows = rows.slice(0, visibleCount);

  useEffect(() => {
    contentRef.current?.parentElement?.scrollTo({ top: 0, behavior: "auto" });
  }, [stage]);

  function resetToUpload() {
    analysisRunRef.current += 1;
    setStage("upload");
    setError(null);
    setMatrix(null);
    setDetection(null);
    setRows([]);
    setFileInfo(null);
    setVisibleCount(50);
    setAnalysisNote(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function buildRowsFor(
    nextMatrix: SheetMatrix,
    headerRowIndex: number,
    mapping: ColumnMapping,
    skipRowNumbers: number[] = [],
  ): BankImportRow[] {
    return buildBankRows({
      matrix: nextMatrix,
      detection: { headerRowIndex, mapping },
      existingTransactions: data.transactions,
      accounts: data.accounts,
      rules: data.categoryRules,
      categoryCatalog,
      skipRowNumbers,
    });
  }

  function beginReview(
    nextMatrix: SheetMatrix,
    choice: MappingChoice,
    initialNote: string | null,
    run: number,
  ) {
    const nextRows = buildRowsFor(
      nextMatrix,
      choice.headerRowIndex,
      choice.mapping,
      choice.skipRowNumbers,
    );

    if (nextRows.length === 0) {
      setError("Il file non contiene movimenti importabili.");
      setStage("upload");
      return;
    }

    setRows(nextRows);
    setVisibleCount(50);
    setStage("organizing");
    setError(null);
    setAnalysisNote(initialNote);
    void finishReview(nextRows, initialNote, run);
  }

  async function finishReview(
    baseRows: BankImportRow[],
    initialNote: string | null,
    run: number,
  ) {
    let result: { rows: BankImportRow[]; note: string | null };
    try {
      result = await analyzeRowsWithAi(baseRows);
    } catch {
      result = {
        rows: baseRows,
        note:
          "AI non disponibile in questo momento: ho usato le regole e le categorie di Balance.",
      };
    }
    if (analysisRunRef.current !== run) return;
    setRows(result.rows);
    setAnalysisNote(joinNotes(initialNote, result.note));
    setStage("review");
  }

  async function handleFile(file: File) {
    const run = analysisRunRef.current + 1;
    analysisRunRef.current = run;
    setError(null);
    setStage("reading");
    setAnalysisNote(null);
    setRows([]);
    setMatrix(null);
    setDetection(null);

    try {
      const parsed = await parseStatementFile(file);
      if (analysisRunRef.current !== run) return;

      const nextDetection = detectColumns(parsed.matrix);
      setMatrix(parsed.matrix);
      setDetection(nextDetection);
      setFileInfo({ name: file.name, type: parsed.fileType });

      const localMappingComplete = isMappingComplete(nextDetection.mapping);
      const localRows = localMappingComplete
        ? buildRowsFor(
            parsed.matrix,
            nextDetection.headerRowIndex,
            nextDetection.mapping,
          )
        : [];
      const localRatio = validRowRatio(localRows);

      let aiNote: string | null = null;
      let aiMapping: ColumnMapping | null = null;
      let aiHeaderRowIndex = -1;
      let aiSkipRowNumbers: number[] = [];
      let aiRatio = 0;

      if (
        !localMappingComplete ||
        localRatio < AUTO_MAPPING_GOOD_RATIO
      ) {
        setStage("organizing");
        try {
          const sample = buildAiSample(parsed.matrix);
          const interpretation = await requestAiInterpretation({
            fileType: parsed.fileType,
            rowCount: sample.rowCount,
            columnCount: sample.columnCount,
            rows: sample.rows,
            detection: {
              headerRowNumber:
                nextDetection.headerRowIndex >= 0
                  ? nextDetection.headerRowIndex + 1
                  : 0,
              mapping: nextDetection.mapping,
            },
          });
          if (analysisRunRef.current !== run) return;

          if (interpretation.mapping) {
            aiMapping = interpretation.mapping;
            aiHeaderRowIndex =
              interpretation.headerRowNumber > 0
                ? interpretation.headerRowNumber - 1
                : -1;
            aiSkipRowNumbers = interpretation.nonMovementRows;
            const aiRows = buildRowsFor(
              parsed.matrix,
              aiHeaderRowIndex,
              aiMapping,
              aiSkipRowNumbers,
            );
            aiRatio = validRowRatio(aiRows);
          }
        } catch {
          if (analysisRunRef.current !== run) return;
          aiNote =
            "Lettura automatica della struttura non disponibile: uso il riconoscimento di Balance.";
        }
      }

      const choice = chooseMapping({
        localMappingComplete,
        localMapping: nextDetection.mapping,
        localRatio,
        localHeaderRowIndex: nextDetection.headerRowIndex,
        aiMappingComplete: aiMapping !== null,
        aiMapping,
        aiRatio,
        aiHeaderRowIndex,
        aiSkipRowNumbers,
      });

      if (!choice) {
        setDraftMapping(nextDetection.mapping);
        setDraftMode(getMappingMode(nextDetection.mapping));
        setStage("mapping");
        setAnalysisNote(
          joinNotes(
            aiNote,
            "Non riesco a riconoscere le colonne in automatico. Sceglile tu: è l'unico passaggio manuale.",
          ),
        );
        return;
      }

      beginReview(parsed.matrix, choice, aiNote, run);
    } catch (caught) {
      if (analysisRunRef.current !== run) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Non riesco a leggere il file. Controlla il formato.",
      );
      setStage("upload");
    }
  }

  function useMapping() {
    if (!matrix || !detection || !isMappingComplete(draftMapping)) return;
    const run = analysisRunRef.current + 1;
    analysisRunRef.current = run;
    beginReview(
      matrix,
      {
        headerRowIndex: detection.headerRowIndex,
        mapping: draftMapping,
        skipRowNumbers: [],
        source: "local",
      },
      null,
      run,
    );
  }

  function updateRow(id: string, patch: Partial<BankImportRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  /**
   * Runs automatically after parsing. Only uncertain rows are sent, in small
   * sequential batches; any failure stops the AI pass and keeps the
   * deterministic suggestions, so the import is never blocked.
   */
  async function analyzeRowsWithAi(baseRows: BankImportRow[]): Promise<{
    rows: BankImportRow[];
    note: string | null;
  }> {
    const candidates = baseRows.filter((row) =>
      isAiCandidate(row, categoryCatalog),
    );
    if (candidates.length === 0) return { rows: baseRows, note: null };

    const batches = planAiBatches(
      candidates,
      AI_MAX_MOVEMENTS,
      AI_MAX_AUTO_BATCHES,
    );
    const plannedCount = batches.reduce(
      (count, batch) => count + batch.length,
      0,
    );
    const suggestions: AiSuggestion[] = [];
    let failed = false;

    for (const batch of batches) {
      try {
        const result = await requestAiSuggestions(
          batch.map((row) => ({
            ref: row.id,
            description: row.description,
            direction: row.type === "income" ? "income" : "expense",
          })),
        );
        suggestions.push(...result.suggestions);
      } catch {
        failed = true;
        break;
      }
    }

    const nextRows =
      suggestions.length > 0
        ? applyAiSuggestions(baseRows, suggestions, categoryCatalog)
        : baseRows;
    const applied = nextRows.filter((row) => row.aiSuggestion).length;

    let note: string | null = null;
    if (failed) {
      note =
        applied > 0
          ? `AI applicata a ${applied} movimenti. Per gli altri ho usato le regole e le categorie di Balance.`
          : "AI non disponibile in questo momento: ho usato le regole e le categorie di Balance.";
    } else if (applied > 0) {
      note = `AI ha proposto ${applied} categorie. Puoi modificarle prima di importare.`;
    } else {
      note =
        "L'AI non ha proposto categorie utilizzabili: ho mantenuto le categorie di Balance.";
    }

    if (plannedCount < candidates.length) {
      note = joinNotes(
        note,
        `Analisi AI limitata ai primi ${plannedCount} movimenti incerti; gli altri mantengono la categoria suggerita.`,
      );
    }

    return { rows: nextRows, note };
  }

  function changeType(row: BankImportRow, type: BankImportRow["type"]) {
    if (type === row.type) return;
    if (type === "transfer") {
      updateRow(row.id, {
        type,
        category: null,
        include: row.valid,
        toAccountId: row.toAccountId,
        aiSuggestion: undefined,
        categoryEdited: true,
      });
      return;
    }

    const suggestion =
      row.category &&
      categoriesForType(type, categoryCatalog).some(
        (item) => item.id === row.category,
      )
        ? row.category
        : suggestedCategoryFor(
            type,
            row.description,
            data.categoryRules,
            categoryCatalog,
          ).category;

    updateRow(row.id, {
      type,
      category: suggestion,
      accountId: row.accountId,
      toAccountId: undefined,
      include: row.include || row.possibleTransfer,
      aiSuggestion: undefined,
      categoryEdited: true,
    });
  }

  function rememberCorrections(): Array<{
    pattern: string;
    category: string;
    kind: "income" | "expense";
  }> {
    if (!rememberRules) return [];
    const seen = new Set<string>();
    const rules: Array<{
      pattern: string;
      category: string;
      kind: "income" | "expense";
    }> = [];

    for (const row of readyRows) {
      if (row.type === "transfer" || !row.category) continue;
      if (row.category === row.suggestedCategory) continue;
      const pattern = merchantPatternFor(row.description);
      const key = `${row.type}:${pattern}`;
      if (pattern.length < 2 || seen.has(key)) continue;
      seen.add(key);
      rules.push({ pattern, category: row.category, kind: row.type });
    }
    return rules;
  }

  function runImport() {
    if (!fileInfo || readyRows.length === 0 || importing) return;
    setImporting(true);
    setError(null);
    try {
      const batch = importBankTransactions({
        fileName: fileInfo.name,
        fileType: fileInfo.type,
        rows: readyRows.map((row) => ({
          date: row.date!,
          type: row.type,
          amountCents: row.amountCents,
          category: row.category,
          description: row.description,
          originalDescription: row.originalDescription,
          accountId: row.accountId,
          toAccountId: row.toAccountId,
          importFingerprint: row.importFingerprint,
        })),
        detectedCount: rows.length,
        rulesToLearn: rememberCorrections(),
      });
      onImported(batch.transactionCount);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "L'importazione non è riuscita. I dati esistenti non sono stati modificati.",
      );
      setImporting(false);
    }
  }

  return (
    <Sheet
      title="Importa estratto conto"
      subtitle={
        fileInfo
          ? `${fileInfo.name} · ${fileInfo.type.toUpperCase()}`
          : "CSV o Excel. Analisi automatica, conferma prima di salvare."
      }
      onClose={onClose}
      size="wide"
    >
      <div ref={contentRef}>
      {error ? (
        <div className="import-error" role="alert">
          <Icon name="info" size={18} />
          <p>{error}</p>
        </div>
      ) : null}

      {stage === "upload" ? (
        <div className="import-upload">
          <div className="import-upload-copy">
            <h3>File dell’estratto conto</h3>
            <p>
              Esporta il file dalla tua banca. Balance legge il contenuto su
              questo dispositivo e riconosce i movimenti in automatico.
            </p>
          </div>

          <label className="import-drop">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <span className="import-drop-icon">
              <Icon name="upload" size={22} />
            </span>
            <span>
              <strong>Scegli un file CSV o Excel</strong>
              <small>Massimo 12 MB e 5.000 righe. I file .xls non sono supportati.</small>
            </span>
          </label>

          <div className="import-upload-notes">
            <p>
              Per interpretare il file invio al server solo un campione di righe
              ripulite: niente IBAN, carte, email o saldi.
            </p>
            <p>Le categorie sono proposte automaticamente e restano modificabili.</p>
            <p>Nessun movimento viene salvato prima della tua conferma.</p>
          </div>
        </div>
      ) : null}

      {stage === "reading" ? (
        <div className="import-reading" role="status" aria-live="polite">
          <span className="import-spinner" aria-hidden="true" />
          <h3>Sto leggendo l’estratto conto…</h3>
          <p>Riconosco righe, date e importi sul dispositivo.</p>
        </div>
      ) : null}

      {stage === "organizing" ? (
        <div className="import-reading" role="status" aria-live="polite">
          <span className="import-spinner" aria-hidden="true" />
          <h3>Sto organizzando i movimenti…</h3>
          <p>
            Applico le tue regole e, solo se serve, chiedo aiuto alla AI. Puoi
            importare anche se la AI non è disponibile.
          </p>
        </div>
      ) : null}

      {stage === "mapping" && matrix && detection ? (
        <div className="import-mapping">
          <div className="import-section-heading">
            <div>
              <h3>Scegli le colonne</h3>
              <p>
                Il file non è interpretabile in automatico. Indica dove si
                trovano data, descrizione e importo.
              </p>
            </div>
          </div>

          {detection.issues.length > 0 ? (
            <ul className="import-issues">
              {detection.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}

          <div className="import-mode" role="group" aria-label="Tipo di importo">
            <button
              type="button"
              className={`segmented-item${draftMode === "amount" ? " is-active" : ""}`}
              onClick={() => {
                setDraftMode("amount");
                setDraftMapping((current) => ({
                  ...current,
                  amount:
                    current.amount ??
                    detection.candidates.amount[0]?.index ??
                    null,
                  debit: null,
                  credit: null,
                }));
              }}
              aria-pressed={draftMode === "amount"}
            >
              Importo unico
            </button>
            <button
              type="button"
              className={`segmented-item${draftMode === "debit-credit" ? " is-active" : ""}`}
              onClick={() => {
                setDraftMode("debit-credit");
                setDraftMapping((current) => ({
                  ...current,
                  amount: null,
                  debit:
                    current.debit ??
                    detection.candidates.debit[0]?.index ??
                    null,
                  credit:
                    current.credit ??
                    detection.candidates.credit[0]?.index ??
                    null,
                }));
              }}
              aria-pressed={draftMode === "debit-credit"}
            >
              Dare e avere
            </button>
          </div>

          <div className="import-mapping-grid">
            <ColumnSelect
              label="Data"
              value={draftMapping.date}
              headers={detection.headers}
              onChange={(value) =>
                setDraftMapping((current) => ({ ...current, date: value }))
              }
            />
            <ColumnSelect
              label="Descrizione"
              value={draftMapping.description}
              headers={detection.headers}
              onChange={(value) =>
                setDraftMapping((current) => ({ ...current, description: value }))
              }
            />
            {draftMode === "amount" ? (
              <ColumnSelect
                label="Importo"
                value={draftMapping.amount}
                headers={detection.headers}
                onChange={(value) =>
                  setDraftMapping((current) => ({ ...current, amount: value }))
                }
              />
            ) : (
              <>
                <ColumnSelect
                  label="Dare (uscite)"
                  value={draftMapping.debit}
                  headers={detection.headers}
                  onChange={(value) =>
                    setDraftMapping((current) => ({ ...current, debit: value }))
                  }
                />
                <ColumnSelect
                  label="Avere (entrate)"
                  value={draftMapping.credit}
                  headers={detection.headers}
                  onChange={(value) =>
                    setDraftMapping((current) => ({ ...current, credit: value }))
                  }
                />
              </>
            )}
          </div>

          <MappingPreview
            matrix={matrix}
            detection={detection}
            mapping={draftMapping}
          />

          <div className="import-actions">
            <button type="button" className="button button--ghost" onClick={resetToUpload}>
              Scegli un altro file
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={useMapping}
              disabled={!isMappingComplete(draftMapping)}
            >
              Usa queste colonne
            </button>
          </div>
        </div>
      ) : null}

      {stage === "review" ? (
        <div className="import-review">
          <div className="import-review-summary" aria-label="Riepilogo importazione">
            <div>
              <strong>{summary.detected}</strong>
              <span>movimenti trovati</span>
            </div>
            <div>
              <strong>{summary.ready}</strong>
              <span>pronti</span>
            </div>
            <div className={summary.duplicates > 0 ? "has-alert" : ""}>
              <strong>{summary.duplicates}</strong>
              <span>possibili duplicati</span>
            </div>
            <div>
              <strong>{summary.possibleTransfers}</strong>
              <span>possibili trasferimenti</span>
            </div>
            <div className={summary.needsReview > 0 ? "has-alert" : ""}>
              <strong>{summary.needsReview}</strong>
              <span>da controllare</span>
            </div>
          </div>

          {analysisNote ? (
            <p className="import-ai-notice" role="status">
              {analysisNote}
            </p>
          ) : null}

          <div className="import-review-head">
            <div>
              <h3>Pronto da importare</h3>
              <p>
                Togli la spunta a ciò che non vuoi importare. Le categorie sono
                modificabili.
              </p>
            </div>
            <button type="button" className="text-link" onClick={resetToUpload}>
              Cambia file
            </button>
          </div>

          {summary.needsReview > 0 ? (
            <p className="import-note">
              {summary.needsReview === 1
                ? "1 riga ha bisogno di essere controllata."
                : `${summary.needsReview} righe hanno bisogno di essere controllate.`}
            </p>
          ) : null}

          {summary.duplicates > 0 ? (
            <p className="import-note">
              I possibili duplicati sono esclusi. Se uno è corretto, includilo
              manualmente.
            </p>
          ) : null}

          <div className="import-rows">
            {visibleRows.map((row) => (
              <ImportReviewRow
                key={row.id}
                row={row}
                accounts={data.accounts}
                catalog={categoryCatalog}
                onChange={(patch) => updateRow(row.id, patch)}
                onChangeType={(type) => changeType(row, type)}
              />
            ))}
          </div>

          {visibleCount < rows.length ? (
            <button
              type="button"
              className="button button--soft import-more"
              onClick={() => setVisibleCount((count) => count + 50)}
            >
              Mostra altri {Math.min(50, rows.length - visibleCount)} movimenti
            </button>
          ) : null}

          <label className="checkbox-field import-remember">
            <input
              type="checkbox"
              checked={rememberRules}
              onChange={(event) => setRememberRules(event.target.checked)}
            />
            <span>
              Ricorda le categorie corrette
              <small>Le regole restano nel tuo account.</small>
            </span>
          </label>

          <div className="import-footer">
            <button
              type="button"
              className="button button--primary import-submit"
              onClick={runImport}
              disabled={readyRows.length === 0 || importing}
            >
              <Icon name="upload" size={17} />
              {importing ? "Importazione in corso…" : "Importa movimenti"}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={onClose}
              disabled={importing}
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </Sheet>
  );
}

function ColumnSelect({
  label,
  value,
  headers,
  onChange,
}: {
  label: string;
  value: number | null;
  headers: string[];
  onChange: (value: number | null) => void;
}) {
  const count = Math.max(headers.length, value !== null ? value + 1 : 0);
  const options = Array.from({ length: count }, (_, index) => ({
    index,
    label: headers[index] || columnLabel(index),
  }));

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        className="select-input"
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
      >
        <option value="">Scegli colonna</option>
        {options.map((option) => (
          <option key={option.index} value={option.index}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MappingPreview({
  matrix,
  detection,
  mapping,
}: {
  matrix: SheetMatrix;
  detection: ColumnDetection;
  mapping: ColumnMapping;
}) {
  const headerIndex = Math.max(0, detection.headerRowIndex);
  const preview = matrix.slice(0, Math.min(matrix.length, headerIndex + 6));
  const columnCount = Math.min(
    20,
    preview.reduce((max, row) => Math.max(max, row.length), 0),
  );
  const mapped = new Set(
    [mapping.date, mapping.description, mapping.amount, mapping.debit, mapping.credit].filter(
      (value): value is number => value !== null,
    ),
  );

  return (
    <div className="import-preview">
      <h3>Anteprima</h3>
      <div className="import-preview-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              {Array.from({ length: columnCount }, (_, index) => (
                <th
                  key={index}
                  scope="col"
                  className={mapped.has(index) ? "is-mapped" : undefined}
                >
                  {detection.headers[index] || columnLabel(index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={
                  rowIndex === detection.headerRowIndex ? "is-header-row" : undefined
                }
              >
                <th scope="row">{rowIndex + 1}</th>
                {Array.from({ length: columnCount }, (_, index) => (
                  <td key={index}>{cellPreview(row[index])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Le colonne selezionate sono evidenziate. La riga di intestazione è in grassetto.</p>
    </div>
  );
}

function cellPreview(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const date = excelDateToISODate(value);
    return date ? formatLongDate(date) : "";
  }
  return String(value);
}

function ImportReviewRow({
  row,
  accounts,
  catalog,
  onChange,
  onChangeType,
}: {
  row: BankImportRow;
  accounts: Account[];
  catalog: CategoryCatalog;
  onChange: (patch: Partial<BankImportRow>) => void;
  onChangeType: (type: BankImportRow["type"]) => void;
}) {
  const activeCategories =
    row.type === "transfer" ? [] : categoriesForType(row.type, catalog);
  const selectedCategory =
    row.category && !activeCategories.some((item) => item.id === row.category)
      ? catalog.find((item) => item.id === row.category)
      : undefined;
  const categories = selectedCategory
    ? [...activeCategories, selectedCategory]
    : activeCategories;
  const missingCategory = row.type !== "transfer" && !row.category;
  const transferAccountsMissing =
    row.type === "transfer" && (!row.accountId || !row.toAccountId);
  const needsMoreAccounts = row.type === "transfer" && accounts.length < 2;
  const reasons: string[] = [];
  if (row.duplicate) reasons.push(DUPLICATE_ISSUE);
  reasons.push(...row.issues);
  if (missingCategory) reasons.push("Scegli una categoria.");
  if (transferAccountsMissing) reasons.push("Scegli i due conti.");
  if (row.type === "transfer" && row.accountId === row.toAccountId) {
    reasons.push("I due conti devono essere diversi.");
  }

  const blocked = !row.valid || row.issues.some((issue) => issue !== DUPLICATE_ISSUE);
  const amount =
    row.type === "income"
      ? formatSignedMoney(row.amountCents)
      : row.type === "expense"
        ? formatSignedMoney(-row.amountCents)
        : formatMoney(row.amountCents);
  const aiCategoryLabel =
    row.aiSuggestion && row.type !== "transfer"
      ? getCategoryLabel(
          row.aiSuggestion.categoryId,
          row.type === "income" ? "income" : "expense",
          catalog,
        )
      : null;

  return (
    <article
      className={[
        "import-row",
        row.duplicate ? "is-duplicate" : "",
        row.include ? "" : "is-excluded",
        reasons.length > 0 ? "is-needs-review" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="import-row-main">
        <label className="import-checkbox">
          <input
            type="checkbox"
            checked={row.include}
            disabled={blocked}
            onChange={(event) => onChange({ include: event.target.checked })}
            aria-label={`Includi il movimento del ${row.date ? formatShortDate(row.date, true) : row.rawDate || "data non valida"}`}
          />
        </label>

        <div className="import-row-copy">
          <div className="import-row-date">
            {row.date ? formatShortDate(row.date, true) : row.rawDate || "Data non riconosciuta"}
            <span>Riga {row.rowNumber}</span>
          </div>
          <h4>
            {row.aiSuggestion?.cleanDescription ||
              row.description ||
              "Descrizione mancante"}
          </h4>
          <div className="import-row-amount">{amount}</div>
        </div>
      </div>

      <div className="import-row-badges">
        {row.duplicate ? <span className="badge badge--alert">Possibile duplicato</span> : null}
        {row.type === "transfer" && row.possibleTransfer ? (
          <span className="badge badge--transfer">Possibile trasferimento</span>
        ) : null}
        {row.suggestionSource === "learned" ? (
          <span className="badge">Regola appresa</span>
        ) : row.suggestionSource === "pattern" ? (
          <span className="badge">Categoria suggerita</span>
        ) : null}
        {row.aiSuggestion ? (
          <span className="badge badge--ai">
            ✨ AI
            {row.aiSuggestion.confidence < 85
              ? ` ${row.aiSuggestion.confidence}%`
              : ""}
          </span>
        ) : null}
        {row.aiSuggestion?.possibleTransfer ? (
          <span className="badge badge--transfer">
            AI: possibile trasferimento
          </span>
        ) : null}
      </div>

      <div className="import-row-editor">
        <label className="field">
          <span className="field-label">Tipo</span>
          <select
            className="select-input"
            value={row.type}
            disabled={blocked}
            onChange={(event) =>
              onChangeType(event.target.value as BankImportRow["type"])
            }
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {row.type !== "transfer" ? (
          <label className="field">
            <span className="field-label">Categoria</span>
            <select
              className="select-input"
              value={row.category ?? ""}
              disabled={blocked}
              onChange={(event) =>
                onChange({
                  category: event.target.value || null,
                  aiSuggestion: undefined,
                  categoryEdited: true,
                })
              }
            >
              <option value="">Scegli categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Dal conto</span>
              <select
                className="select-input"
                value={row.accountId ?? ""}
                onChange={(event) =>
                  onChange({ accountId: event.target.value || undefined })
                }
              >
                <option value="">Scegli conto</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Al conto</span>
              <select
                className="select-input"
                value={row.toAccountId ?? ""}
                onChange={(event) =>
                  onChange({ toAccountId: event.target.value || undefined })
                }
              >
                <option value="">Scegli conto</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {row.aiSuggestion && row.type !== "transfer" ? (
        <div className="import-ai-suggestion">
          <p>
            <strong>{aiCategoryLabel}</strong>
            {row.aiSuggestion.merchant
              ? ` · ${row.aiSuggestion.merchant}`
              : ""}
            {row.aiSuggestion.confidence < 85
              ? ` · confidenza ${row.aiSuggestion.confidence}%`
              : ""}
          </p>
          {row.aiSuggestion.cleanDescription &&
          row.aiSuggestion.cleanDescription !== row.description ? (
            <p>
              Descrizione proposta: {row.aiSuggestion.cleanDescription}
            </p>
          ) : null}
          {row.aiSuggestion.possibleTransfer ? (
            <p>
              La AI sospetta un trasferimento. Il tipo non è stato cambiato:
              controllalo tu.
            </p>
          ) : null}
        </div>
      ) : null}

      {needsMoreAccounts ? (
        <p className="import-row-hint">
          Per un trasferimento servono due conti. Aggiungili in Patrimonio o
          cambia tipo in Spesa o Entrata.
        </p>
      ) : null}

      {reasons.length > 0 ? (
        <ul className="import-row-issues">
          {Array.from(new Set(reasons)).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {row.originalDescription &&
      row.originalDescription !== row.description ? (
        <details className="import-original">
          <summary>Descrizione originale</summary>
          <p>{row.originalDescription}</p>
        </details>
      ) : null}
    </article>
  );
}
