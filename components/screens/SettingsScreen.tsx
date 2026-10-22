"use client";

import { useEffect, useRef, useState } from "react";
import type {
  BackupSummary,
  BalanceData,
  LoadResult,
} from "@/lib/types";
import {
  backupFileName,
  parseBackup,
  serializeBackup,
} from "@/lib/backup";
import { downloadTextFile } from "@/lib/download";
import { getRecoveryRaw } from "@/lib/storage";
import {
  deleteAllData,
  deleteCategoryRule,
  mergeImportedData,
  replaceAllData,
  updateCategoryRule,
  updateSettings,
} from "@/lib/store";
import { todayISO, timestampToLocalLabel } from "@/lib/dates";
import {
  categoriesForType,
  createCategoryCatalog,
} from "@/lib/categories";
import { formatRateInput, parseRateToMills } from "@/lib/trips";
import { CategorySettings } from "../CategorySettings";
import { useAuth } from "../auth/AuthContext";
import { Sheet } from "../ui/Sheet";
import { Icon } from "../ui/Icon";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface SettingsScreenProps {
  data: BalanceData;
  loadInfo: LoadResult | null;
  storageError: string | null;
  onBack: () => void;
  onToast: (message: string) => void;
  onImportStatement: () => void;
  onDeleted: () => void;
}

interface ImportPreview {
  data: BalanceData;
  summary: BackupSummary;
  fileName: string;
  exportedAt?: string;
}

function DataStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="data-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function SettingsScreen({
  data,
  loadInfo,
  storageError,
  onBack,
  onToast,
  onImportStatement,
  onDeleted,
}: SettingsScreenProps) {
  const auth = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultRateInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
    setIsIOS(
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !("MSStream" in window),
    );
  }, []);

  const recoveryRaw =
    loadInfo?.status === "corrupt" || loadInfo?.status === "recovered"
      ? getRecoveryRaw()
      : null;

  function exportBackup() {
    downloadTextFile(
      backupFileName(todayISO()),
      serializeBackup(data),
    );
    onToast("Backup esportato. Conservalo in un posto sicuro.");
  }

  async function onFileSelected(file: File | undefined) {
    if (!file) return;
    setImportErrors([]);
    setReplaceConfirmed(false);
    try {
      if (file.size > 20 * 1024 * 1024) {
        setImportErrors(["Il file è troppo grande per essere un backup Balance."]);
        return;
      }
      const text = await file.text();
      const result = parseBackup(text);
      if (!result.ok) {
        setImportErrors(result.errors);
        return;
      }
      setImportPreview({
        data: result.data,
        summary: result.summary,
        fileName: file.name,
        exportedAt: result.exportedAt,
      });
    } catch {
      setImportErrors([
        "Non è stato possibile leggere il file. Nessun dato è stato modificato.",
      ]);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function performMerge() {
    if (!importPreview) return;
    mergeImportedData(importPreview.data);
    setImportPreview(null);
    onToast("Backup unito. I doppioni sono stati ignorati.");
  }

  function performReplace() {
    if (!importPreview || !replaceConfirmed) return;
    replaceAllData(importPreview.data);
    setImportPreview(null);
    setReplaceConfirmed(false);
    onToast("Backup importato. I dati precedenti sono stati sostituiti.");
  }

  function performDeleteAll() {
    deleteAllData();
    setConfirmDelete(false);
    onToast("Tutti i dati del tuo account sono stati eliminati.");
    onDeleted();
  }

  function saveDefaultRate() {
    const mills = parseRateToMills(defaultRateInputRef.current?.value ?? "");
    if (mills === null) {
      setRateError("Inserisci una tariffa valida, ad esempio 0,488.");
      return;
    }
    updateSettings({ defaultRatePerKmMills: mills });
    setRateError(null);
    onToast(
      mills > 0 ? "Tariffa predefinita salvata." : "Tariffa predefinita rimossa.",
    );
  }

  const lastUpdated = data.updatedAt
    ? timestampToLocalLabel(data.updatedAt)
    : "—";
  const catalog = createCategoryCatalog(data);

  return (
    <div className="screen screen--settings">
      <header className="settings-header">
        <button
          type="button"
          className="icon-button icon-button--quiet"
          onClick={onBack}
          aria-label="Torna indietro"
        >
          <Icon name="chevronLeft" size={20} />
        </button>
        <div>
          <p className="eyebrow">Balance</p>
          <h1 className="screen-title">Impostazioni</h1>
        </div>
      </header>

      {storageError ? (
        <div className="alert alert--warning" role="alert">
          <Icon name="info" size={18} />
          <div>
            <strong>Salvataggio non riuscito</strong>
            <p>{storageError}</p>
          </div>
        </div>
      ) : null}

      {loadInfo?.status === "corrupt" ? (
        <div className="alert alert--warning" role="alert">
          <Icon name="info" size={18} />
          <div>
            <strong>I dati salvati non erano leggibili</strong>
            <p>
              Balance non li ha cancellati: ne ha conservato una copia separata.{" "}
              {recoveryRaw
                ? "Puoi scaricarla qui sotto prima di ricominciare."
                : "La copia non è accessibile in questo browser."}
            </p>
          </div>
        </div>
      ) : null}

      {loadInfo?.status === "recovered" ? (
        <div className="alert" role="status">
          <Icon name="check" size={18} />
          <div>
            <strong>Recupero completato</strong>
            <p>
              Alcuni dati non erano leggibili e sono stati ignorati. Il resto è
              disponibile. La copia originale è conservata.
            </p>
          </div>
        </div>
      ) : null}

      {auth ? (
        <section className="settings-section" aria-labelledby="account-title">
          <p className="eyebrow">Account</p>
          <div className="settings-card account-card">
            <div>
              <h2 id="account-title">Sei connesso</h2>
              <p>{auth.email}</p>
            </div>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => void auth.signOut()}
            >
              <Icon name="logout" size={16} />
              Esci
            </button>
          </div>
        </section>
      ) : null}

      <section className="settings-section" aria-labelledby="privacy-title">
        <p className="eyebrow">Privacy</p>
        <div className="privacy-card">
          <span className="privacy-icon">
            <Icon name="lock" size={22} />
          </span>
          <div>
            <h2 id="privacy-title">I tuoi dati sono privati nel tuo account.</h2>
            <p>
              Balance salva i dati in Supabase e li separa per account con Row
              Level Security. Solo tu puoi leggere e modificare i tuoi
              movimenti. Non usiamo analytics né tracker.
            </p>
            <p className="privacy-emphasis">
              Esporta un backup ogni tanto per avere una copia indipendente.
            </p>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="trips-settings-title">
        <p className="eyebrow">Trasferte</p>
        <div className="settings-card">
          <h2 id="trips-settings-title">Tariffa chilometrica</h2>
          <p>
            Viene proposta quando crei una nuova trasferta. Puoi sempre
            cambiarla nella singola trasferta.
          </p>
          <div className="settings-rate-row">
            <label className="field">
              <span className="field-label">Tariffa predefinita €/km</span>
              <span className="input-with-icon input-with-icon--money">
                <span aria-hidden="true">€</span>
                <input
                  key={data.settings.defaultRatePerKmMills}
                  ref={defaultRateInputRef}
                  type="text"
                  className="text-input"
                  inputMode="decimal"
                  defaultValue={formatRateInput(
                    data.settings.defaultRatePerKmMills,
                  )}
                  onChange={() => setRateError(null)}
                  placeholder="0,488"
                  autoComplete="off"
                />
              </span>
            </label>
            <button
              type="button"
              className="button button--soft button--small"
              onClick={saveDefaultRate}
            >
              Salva tariffa
            </button>
          </div>
          {rateError ? (
            <p className="form-error" role="alert">
              <Icon name="info" size={15} />
              {rateError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="categories-title">
        <p className="eyebrow">Categorie</p>
        <div className="settings-card">
          <h2 id="categories-title">Le tue categorie</h2>
          <p>
            Aggiungi categorie personali, nascondi quelle predefinite che non usi
            e ripristinale quando vuoi. I movimenti già registrati non cambiano
            mai categoria.
          </p>
          <CategorySettings data={data} onToast={onToast} />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="data-title">
        <p className="eyebrow">Dati e backup</p>
        <div className="settings-card">
          <div className="settings-card-heading">
            <div>
              <h2 id="data-title">Il tuo archivio</h2>
              <p>Ultimo aggiornamento: {lastUpdated}</p>
            </div>
          </div>
          <div className="data-stats">
            <DataStat value={data.transactions.length} label="movimenti" />
            <DataStat value={data.accounts.length} label="conti" />
            <DataStat value={data.monthlyBudgets.length} label="budget mensili" />
            <DataStat value={data.netWorthSnapshots.length} label="fotografie" />
            <DataStat
              value={data.historicalMonthlySummaries.length}
              label="mesi storici"
            />
            <DataStat value={data.importBatches.length} label="estratti importati" />
            <DataStat value={data.categoryRules.length} label="regole apprese" />
            <DataStat
              value={data.customCategories.length}
              label="categorie personalizzate"
            />
            <DataStat
              value={data.hiddenDefaultCategories.length}
              label="categorie nascoste"
            />
            <DataStat value={data.businessTrips.length} label="trasferte" />
            <DataStat
              value={data.personalBalanceItems.length}
              label="voci personali"
            />
          </div>

          <div className="settings-actions">
            <button type="button" className="action-row" onClick={exportBackup}>
              <span className="action-row-icon">
                <Icon name="download" size={19} />
              </span>
              <span className="action-row-copy">
                <strong>Esporta backup</strong>
                <span>Un file JSON con tutti i tuoi dati Balance.</span>
              </span>
              <Icon name="chevronRight" size={17} />
            </button>

            <input
              ref={fileInputRef}
              id="import-backup"
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={(event) => onFileSelected(event.target.files?.[0])}
            />
            <button
              type="button"
              className="action-row"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="action-row-icon">
                <Icon name="upload" size={19} />
              </span>
              <span className="action-row-copy">
                <strong>Importa backup</strong>
                <span>Controlla il contenuto prima di sostituire o unire.</span>
              </span>
              <Icon name="chevronRight" size={17} />
            </button>

            <button
              type="button"
              className="action-row"
              onClick={onImportStatement}
            >
              <span className="action-row-icon">
                <Icon name="upload" size={19} />
              </span>
              <span className="action-row-copy">
                <strong>Importa estratto conto</strong>
                <span>CSV o Excel. Rivedi i movimenti prima di salvarli.</span>
              </span>
              <Icon name="chevronRight" size={17} />
            </button>
          </div>

          <p className="settings-note">
            Il backup contiene movimenti, budget, conti, fotografie del
            patrimonio, cronologia mensile, regole di categorizzazione,
            estratti importati, categorie personalizzate e nascoste, trasferte e
            voci da ricevere/da dare. Non contiene dati di accesso perché
            Balance non ne ha.
          </p>

          <div className="settings-subsection">
            <p className="eyebrow">Cronologia Excel</p>
            <p>
              I totali mensili del tuo vecchio file possono convivere con i nuovi
              movimenti. L’importazione del foglio reale è un passaggio separato:
              nessun dato storico viene inventato o creato in automatico.
            </p>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="imports-title">
        <p className="eyebrow">Estratti conto</p>
        <div className="settings-card">
          <h2 id="imports-title">Importazioni</h2>
          {data.importBatches.length === 0 ? (
            <p>Nessun estratto conto importato.</p>
          ) : (
            <ul className="settings-list">
              {[...data.importBatches]
                .reverse()
                .slice(0, 8)
                .map((batch) => (
                  <li key={batch.id} className="settings-list-row">
                    <div>
                      <strong>{batch.fileName}</strong>
                      <span>
                        {timestampToLocalLabel(batch.importedAt)} ·{" "}
                        {batch.transactionCount}{" "}
                        {batch.transactionCount === 1
                          ? "movimento"
                          : "movimenti"}
                      </span>
                    </div>
                    <span className="badge">{batch.fileType.toUpperCase()}</span>
                  </li>
                ))}
            </ul>
          )}
          <p className="settings-note">
            Ogni riga resta tracciata con il file da cui proviene. Non c'è un
            annullamento automatico: puoi eliminare i singoli movimenti da
            Movimenti.
          </p>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="rules-title">
        <p className="eyebrow">Categorizzazione</p>
        <div className="settings-card">
          <h2 id="rules-title">Regole apprese</h2>
          <p className="settings-note">
            Le regole cambiano solo i suggerimenti dei prossimi import. Non
            modificano i movimenti già salvati.
          </p>
          {data.categoryRules.length === 0 ? (
            <p>Nessuna regola appresa.</p>
          ) : (
            <ul className="settings-list">
              {data.categoryRules.map((rule) => (
                <li key={rule.id} className="settings-list-row rule-row">
                  <div>
                    <strong>{rule.pattern}</strong>
                    <span>{rule.kind === "income" ? "Entrate" : "Spese"}</span>
                  </div>
                  <label className="field field--inline">
                    <span className="visually-hidden">Categoria per {rule.pattern}</span>
                    <select
                      className="select-input"
                      value={rule.category}
                      onChange={(event) => {
                        try {
                          updateCategoryRule(rule.id, event.target.value);
                          onToast("Regola aggiornata.");
                        } catch {
                          onToast("Categoria non valida per questa regola.");
                        }
                      }}
                    >
                      {(() => {
                        const active = categoriesForType(rule.kind, catalog);
                        const selected = catalog.find(
                          (category) => category.id === rule.category,
                        );
                        const options =
                          selected &&
                          !active.some((category) => category.id === selected.id)
                            ? [...active, selected]
                            : active;
                        return options.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                            {category.hidden || category.archived
                              ? " (non attiva)"
                              : ""}
                          </option>
                        ));
                      })()}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="icon-button icon-button--quiet"
                    aria-label={`Elimina la regola ${rule.pattern}`}
                    onClick={() => {
                      deleteCategoryRule(rule.id);
                      onToast("Regola eliminata.");
                    }}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {importErrors.length > 0 ? (
        <div className="alert alert--danger" role="alert">
          <Icon name="info" size={18} />
          <div>
            <strong>Importazione non eseguita</strong>
            <ul>
              {importErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            <p>I tuoi dati attuali non sono stati modificati.</p>
          </div>
        </div>
      ) : null}

      {recoveryRaw ? (
        <section className="settings-section" aria-labelledby="recovery-title">
          <p className="eyebrow">Recupero</p>
          <div className="settings-card">
            <h2 id="recovery-title">Copia dei dati originali</h2>
            <p>
              Il file originale non leggibile è conservato separatamente. Puoi
              scaricarlo per tentare un recupero manuale o conservarlo.
            </p>
            <button
              type="button"
              className="button button--soft button--small"
              onClick={() => {
                downloadTextFile("balance-dati-originali.json", recoveryRaw);
                onToast("Copia originale scaricata.");
              }}
            >
              <Icon name="download" size={16} />
              Scarica dati originali
            </button>
          </div>
        </section>
      ) : null}

      <section className="settings-section" aria-labelledby="install-title">
        <p className="eyebrow">Sul tuo iPhone</p>
        <div className="settings-card install-card">
          <div className="install-heading">
            <span className="install-icon">
              <Icon name="plus" size={20} />
            </span>
            <div>
              <h2 id="install-title">Aggiungi alla schermata Home</h2>
              <p>Balance funziona anche offline.</p>
            </div>
          </div>
          {isStandalone ? (
            <p className="installed-note">
              <Icon name="check" size={16} />
              Balance è già installata su questo dispositivo.
            </p>
          ) : isIOS ? (
            <ol className="install-steps">
              <li>Apri Balance in Safari.</li>
              <li>Tocca il pulsante Condividi.</li>
              <li>Scegli “Aggiungi alla schermata Home”.</li>
              <li>Apri Balance dall’icona blu.</li>
            </ol>
          ) : (
            <ol className="install-steps">
              <li>Apri il menu del browser.</li>
              <li>Scegli “Installa app” o “Aggiungi alla schermata Home”.</li>
              <li>Apri Balance dall’icona creata.</li>
            </ol>
          )}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="danger-title">
        <p className="eyebrow">Dati</p>
        <div className="settings-card danger-card">
          <h2 id="danger-title">Elimina tutti i dati</h2>
          <p>
            Rimuove dal tuo account movimenti, budget, conti, fotografie,
            cronologia, categorie personalizzate, trasferte e voci personali.
            L’operazione non può essere annullata.
          </p>
          <button
            type="button"
            className="button button--danger-ghost button--small"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" size={16} />
            Elimina tutti i dati
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="about-title">
        <p className="eyebrow">Informazioni</p>
        <div className="about-block">
          <p className="brand-mark brand-mark--small" aria-hidden="true">
            balance<span>.</span>
          </p>
          <h2 id="about-title">Movimenti, budget e patrimonio.</h2>
          <p>
            Balance non è un’app bancaria e non dà consigli finanziari. Mostra
            solo i dati che registri. Versione 0.1.
          </p>
          <p className="about-privacy">
            <Icon name="lock" size={14} /> Account privato. Nessun tracciamento.
          </p>
        </div>
      </section>

      {importPreview ? (
        <Sheet
          title="Controlla il backup"
          subtitle="Nessun dato è ancora stato modificato."
          onClose={() => {
            setImportPreview(null);
            setReplaceConfirmed(false);
          }}
        >
          <div className="import-summary">
            <p className="import-file">
              <Icon name="download" size={17} />
              <span>{importPreview.fileName}</span>
            </p>
            {importPreview.exportedAt ? (
              <p className="panel-caption">
                Esportato il {timestampToLocalLabel(importPreview.exportedAt)}
              </p>
            ) : null}
            <div className="import-stats">
              <DataStat
                value={importPreview.summary.transactionCount}
                label="movimenti"
              />
              <DataStat value={importPreview.summary.accountCount} label="conti" />
              <DataStat
                value={importPreview.summary.budgetMonthCount}
                label="budget mensili"
              />
              <DataStat
                value={importPreview.summary.snapshotCount}
                label="fotografie"
              />
              <DataStat
                value={importPreview.summary.historicalMonthCount}
                label="mesi storici"
              />
              <DataStat
                value={importPreview.summary.importBatchCount}
                label="estratti importati"
              />
              <DataStat
                value={importPreview.summary.ruleCount}
                label="regole apprese"
              />
              <DataStat
                value={importPreview.summary.customCategoryCount}
                label="categorie personalizzate"
              />
              <DataStat
                value={importPreview.summary.hiddenCategoryCount}
                label="categorie nascoste"
              />
              <DataStat
                value={importPreview.summary.businessTripCount}
                label="trasferte"
              />
              <DataStat
                value={importPreview.summary.personalBalanceCount}
                label="voci personali"
              />
            </div>
            <p className="panel-caption">
              Ultimo aggiornamento del backup:{" "}
              {importPreview.summary.updatedAt
                ? timestampToLocalLabel(importPreview.summary.updatedAt)
                : "—"}
            </p>
            <div className="import-options">
              <div>
                <strong>Unisci ai dati attuali</strong>
                <p>
                  Aggiunge solo i record nuovi. Gli ID già presenti vengono
                  ignorati: nessun doppione.
                </p>
                <button
                  type="button"
                  className="button button--soft button--small"
                  onClick={performMerge}
                >
                  Unisci
                </button>
              </div>
              <div className="import-replace">
                <strong>Sostituisci tutto</strong>
                <p>
                  Cancella i dati attuali e usa quelli del backup. I dati attuali
                  non saranno recuperabili senza un altro backup.
                </p>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={replaceConfirmed}
                    onChange={(event) => setReplaceConfirmed(event.target.checked)}
                  />
                  <span>Confermo di voler sostituire i dati attuali.</span>
                </label>
                <button
                  type="button"
                  className="button button--danger button--small"
                  onClick={performReplace}
                  disabled={!replaceConfirmed}
                >
                  Sostituisci tutto
                </button>
              </div>
            </div>
          </div>
        </Sheet>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Eliminare tutti i dati?"
          destructive
          requireTyping="ELIMINA"
          confirmLabel="Elimina tutto"
          onClose={() => setConfirmDelete(false)}
          onConfirm={performDeleteAll}
          body={
            <>
              <p>
                Verranno eliminati <strong>tutti</strong> i movimenti, i budget,
                i conti, le fotografie del patrimonio, la cronologia, le
                categorie personalizzate, le trasferte e le voci personali dal
                tuo account.
              </p>
              <p>Questa azione non può essere annullata.</p>
              <p className="confirm-hint">
                Se non hai un backup, chiudi questa finestra ed esportane uno
                prima.
              </p>
            </>
          }
        />
      ) : null}
    </div>
  );
}
