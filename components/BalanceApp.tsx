"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Account,
  BusinessTrip,
  PersonalBalanceItem,
  Transaction,
} from "@/lib/types";
import {
  addTransaction,
  captureSnapshot,
  deleteAccount,
  deleteBusinessTrip,
  deletePersonalBalanceItem,
  deleteTransaction,
  initializeStore,
  markBusinessTripReimbursed,
  reopenBusinessTrip,
  saveAccount,
  saveBusinessTrip,
  savePersonalBalanceItem,
  setMonthlyBudget,
  settlePersonalBalanceItem,
  updateTransaction,
  useBalanceStore,
} from "@/lib/store";
import {
  currentMonthKey,
  daysInMonth,
  pad2,
  todayISO,
} from "@/lib/dates";
import { getMonthSummary } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { createCategoryCatalog } from "@/lib/categories";
import type {
  BusinessTripInput,
  NewTransactionInput,
  PersonalBalanceInput,
} from "@/lib/store";
import { TodayScreen } from "./screens/TodayScreen";
import { TransactionsScreen } from "./screens/TransactionsScreen";
import { BudgetScreen } from "./screens/BudgetScreen";
import { NetWorthScreen } from "./screens/NetWorthScreen";
import { TripsScreen } from "./screens/TripsScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TransactionSheet } from "./forms/TransactionSheet";
import { BudgetSheet } from "./forms/BudgetSheet";
import { AccountSheet } from "./forms/AccountSheet";
import { TripSheet } from "./forms/TripSheet";
import { SettleTripSheet } from "./forms/SettleTripSheet";
import { PersonalItemSheet } from "./forms/PersonalItemSheet";
import { SettlePersonalItemSheet } from "./forms/SettlePersonalItemSheet";
import { ImportStatementSheet } from "./import/ImportStatementSheet";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Toast } from "./ui/Toast";
import { Icon } from "./ui/Icon";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import type { IconName } from "@/lib/categories";

type Tab =
  | "today"
  | "transactions"
  | "budget"
  | "trips"
  | "networth"
  | "insights";
type View = Tab | "settings";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "today", label: "Oggi", icon: "sun" },
  { id: "transactions", label: "Movimenti", icon: "list" },
  { id: "budget", label: "Budget", icon: "budget" },
  { id: "trips", label: "Trasferte", icon: "briefcase" },
  { id: "networth", label: "Patrimonio", icon: "layers" },
  { id: "insights", label: "Insights", icon: "insights" },
];

function defaultDateForMonth(month: string): string {
  const today = todayISO();
  if (month === currentMonthKey()) return today;
  const day = Math.min(Number(today.slice(8, 10)), daysInMonth(month));
  return `${month}-${pad2(day)}`;
}

function LoadingScreen() {
  return (
    <div className="loading-screen" aria-busy="true" aria-label="Caricamento di Balance">
      <p className="brand-mark" aria-hidden="true">
        balance<span>.</span>
      </p>
      <div className="loading-rule" />
      <p>Apertura dei tuoi dati.</p>
    </div>
  );
}

export function BalanceApp() {
  const { data, hydrated, loadInfo, storageError } = useBalanceStore();
  const [month, setMonth] = useState<string | null>(null);
  const [view, setView] = useState<View>("today");
  const [transactionSheet, setTransactionSheet] = useState<{
    transaction?: Transaction;
  } | null>(null);
  const [budgetSheet, setBudgetSheet] = useState(false);
  const [accountSheet, setAccountSheet] = useState<{ account?: Account } | null>(
    null,
  );
  const [tripSheet, setTripSheet] = useState<{ trip?: BusinessTrip } | null>(
    null,
  );
  const [settleTripCandidate, setSettleTripCandidate] =
    useState<BusinessTrip | null>(null);
  const [deleteTripCandidate, setDeleteTripCandidate] =
    useState<BusinessTrip | null>(null);
  const [personalSheet, setPersonalSheet] = useState<{
    item?: PersonalBalanceItem;
  } | null>(null);
  const [settlePersonalCandidate, setSettlePersonalCandidate] =
    useState<PersonalBalanceItem | null>(null);
  const [deletePersonalCandidate, setDeletePersonalCandidate] =
    useState<PersonalBalanceItem | null>(null);
  const [deleteTransactionCandidate, setDeleteTransactionCandidate] =
    useState<Transaction | null>(null);
  const [deleteAccountCandidate, setDeleteAccountCandidate] =
    useState<Account | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);

  useEffect(() => {
    initializeStore();
    setMonth(currentMonthKey());
  }, []);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [view, month]);

  const showToast = useCallback((message: string) => setToast(message), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const openNewTransaction = useCallback(() => setTransactionSheet({}), []);
  const openImportStatement = useCallback(() => setImportSheetOpen(true), []);
  const openEditTransaction = useCallback(
    (transaction: Transaction) => setTransactionSheet({ transaction }),
    [],
  );
  const openEditTransactionById = useCallback(
    (id: string) => {
      const transaction = data.transactions.find((item) => item.id === id);
      if (transaction) setTransactionSheet({ transaction });
    },
    [data.transactions],
  );

  if (!hydrated || !month) return <LoadingScreen />;

  const selectedMonth = month;
  const categoryCatalog = createCategoryCatalog(data);
  const budget = data.monthlyBudgets.find(
    (item) => item.month === selectedMonth,
  );
  const monthSummary = getMonthSummary(
    month,
    data.transactions,
    data.historicalMonthlySummaries,
  );

  function handleSaveTransaction(input: NewTransactionInput) {
    if (transactionSheet?.transaction) {
      updateTransaction(transactionSheet.transaction.id, input);
      showToast("Movimento aggiornato.");
    } else {
      addTransaction(input);
      showToast("Movimento salvato.");
    }
    setTransactionSheet(null);
  }

  function handleDeleteTransaction() {
    if (!deleteTransactionCandidate) return;
    deleteTransaction(deleteTransactionCandidate.id);
    setDeleteTransactionCandidate(null);
    showToast("Movimento eliminato.");
  }

  function handleSaveBudget(categories: Record<string, number>) {
    setMonthlyBudget(selectedMonth, categories);
    setBudgetSheet(false);
    showToast(
      Object.keys(categories).length > 0
        ? "Budget aggiornato."
        : "Budget del mese rimosso.",
    );
  }

  function handleSaveAccount(input: {
    id?: string;
    name: string;
    type: Account["type"];
    currentBalanceCents: number;
    includeInNetWorth: boolean;
  }) {
    saveAccount(input);
    setAccountSheet(null);
    showToast(input.id ? "Conto aggiornato." : "Conto aggiunto.");
  }

  function handleDeleteAccount() {
    if (!deleteAccountCandidate) return;
    deleteAccount(deleteAccountCandidate.id);
    setDeleteAccountCandidate(null);
    showToast("Conto eliminato.");
  }

  function handleCaptureSnapshot() {
    const saved = captureSnapshot();
    showToast(
      saved
        ? "Fotografia del patrimonio salvata."
        : "Aggiungi almeno un conto incluso nel patrimonio.",
    );
  }

  function handleSaveTrip(input: BusinessTripInput) {
    saveBusinessTrip(input);
    setTripSheet(null);
    showToast(input.id ? "Trasferta aggiornata." : "Trasferta salvata.");
  }

  function handleDeleteTrip() {
    if (!deleteTripCandidate) return;
    deleteBusinessTrip(deleteTripCandidate.id);
    setDeleteTripCandidate(null);
    showToast("Trasferta eliminata.");
  }

  function handleMarkTripReimbursed(linkedSalaryTransactionId?: string) {
    if (!settleTripCandidate) return;
    markBusinessTripReimbursed(
      settleTripCandidate.id,
      linkedSalaryTransactionId,
    );
    setSettleTripCandidate(null);
    showToast("Trasferta segnata come rimborsata.");
  }

  function handleReopenTrip(trip: BusinessTrip) {
    reopenBusinessTrip(trip.id);
    showToast("Trasferta riaperta.");
  }

  function handleSavePersonalItem(input: PersonalBalanceInput) {
    savePersonalBalanceItem(input);
    setPersonalSheet(null);
    showToast(input.id ? "Voce aggiornata." : "Voce salvata.");
  }

  function handleDeletePersonalItem() {
    if (!deletePersonalCandidate) return;
    deletePersonalBalanceItem(deletePersonalCandidate.id);
    setDeletePersonalCandidate(null);
    showToast("Voce eliminata.");
  }

  function handleSettlePersonalItem(linkedTransactionId?: string) {
    if (!settlePersonalCandidate) return;
    settlePersonalBalanceItem(
      settlePersonalCandidate.id,
      linkedTransactionId,
    );
    setSettlePersonalCandidate(null);
    showToast(
      settlePersonalCandidate.direction === "receivable"
        ? "Voce segnata come ricevuta."
        : "Voce segnata come pagata.",
    );
  }

  function handleStatementImported(count: number) {
    setImportSheetOpen(false);
    showToast(
      `${count} ${count === 1 ? "movimento importato" : "movimenti importati"}.`,
    );
  }

  function navigate(next: View) {
    setView(next);
    if (next === "settings") setTransactionSheet(null);
  }

  const activeTab = view === "settings" ? null : view;

  return (
    <div className="app-frame">
      <ServiceWorkerRegister />

      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="brand-mark">
            balance<span>.</span>
          </p>
          <p className="sidebar-tagline">Budgeting, made simple.</p>
        </div>

        <nav className="sidebar-nav" aria-label="Navigazione principale">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`sidebar-nav-item${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => navigate(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <Icon name={tab.icon} size={19} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <button
          type="button"
          className="button button--primary sidebar-add"
          onClick={openNewTransaction}
        >
          <Icon name="plus" size={18} />
          Nuovo movimento
        </button>

        <button
          type="button"
          className={`sidebar-nav-item sidebar-nav-item--settings${view === "settings" ? " is-active" : ""}`}
          onClick={() => navigate("settings")}
          aria-current={view === "settings" ? "page" : undefined}
        >
          <Icon name="settings" size={19} />
          <span>Impostazioni</span>
        </button>

        <p className="sidebar-privacy">
          <Icon name="lock" size={13} />
          I dati sono privati nel tuo account.
        </p>
      </aside>

      <div className="app-content">
        {view !== "settings" ? (
          <header className="mobile-topbar">
            <button
              type="button"
              className="brand-button"
              onClick={() => navigate("today")}
              aria-label="Balance, torna a Oggi"
            >
              <span className="brand-mark" aria-hidden="true">
                balance<span>.</span>
              </span>
            </button>
            <div className="topbar-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => navigate("settings")}
                aria-label="Apri impostazioni"
              >
                <Icon name="settings" size={20} />
              </button>
            </div>
          </header>
        ) : (
          <header className="mobile-topbar mobile-topbar--minimal">
            <button
              type="button"
              className="brand-button"
              onClick={() => navigate("today")}
              aria-label="Balance, torna a Oggi"
            >
              <span className="brand-mark" aria-hidden="true">
                balance<span>.</span>
              </span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => navigate("today")}
              aria-label="Chiudi impostazioni"
            >
              <Icon name="close" size={19} />
            </button>
          </header>
        )}

        <main className="main-content" id="main-content">
          {isOffline ? (
            <div className="offline-strip" role="status">
              <Icon name="info" size={15} />
              Sei offline. Le modifiche potrebbero non essere salvate: torna
              online e riprova.
            </div>
          ) : null}

          {loadInfo?.status === "corrupt" ? (
            <div className="recovery-banner" role="alert">
              <Icon name="info" size={18} />
              <div>
                <strong>I dati salvati non erano leggibili.</strong>
                <p>
                  Balance non li ha cancellati: c’è una copia separata. Apri le
                  impostazioni per scaricarla.
                </p>
              </div>
              <button
                type="button"
                className="button button--soft button--small"
                onClick={() => navigate("settings")}
              >
                Apri
              </button>
            </div>
          ) : null}

          {loadInfo?.status === "recovered" ? (
            <div className="recovery-banner" role="status">
              <Icon name="check" size={18} />
              <div>
                <strong>Recupero completato.</strong>
                <p>
                  Alcuni record non leggibili sono stati messi da parte. Il resto
                  è disponibile.
                </p>
              </div>
              <button
                type="button"
                className="button button--soft button--small"
                onClick={() => navigate("settings")}
              >
                Dettagli
              </button>
            </div>
          ) : null}

          {storageError ? (
            <div className="recovery-banner recovery-banner--error" role="alert">
              <Icon name="info" size={18} />
              <div>
                <strong>Salvataggio non riuscito.</strong>
                <p>{storageError}</p>
              </div>
              <button
                type="button"
                className="button button--soft button--small"
                onClick={() => navigate("settings")}
              >
                Backup
              </button>
            </div>
          ) : null}

          {view === "today" ? (
            <TodayScreen
              data={data}
              month={month}
              onMonthChange={setMonth}
              onAddTransaction={openNewTransaction}
              onEditTransaction={openEditTransaction}
              onOpenBudget={() => navigate("budget")}
              onOpenNetWorth={() => navigate("networth")}
              onOpenTransactions={() => navigate("transactions")}
              onOpenInsights={() => navigate("insights")}
              onOpenTrips={() => navigate("trips")}
              onAddAccount={() => setAccountSheet({})}
            />
          ) : null}

          {view === "transactions" ? (
            <TransactionsScreen
              data={data}
              month={month}
              onMonthChange={setMonth}
              onAddTransaction={openNewTransaction}
              onEditTransaction={openEditTransactionById}
              onImportStatement={openImportStatement}
            />
          ) : null}

          {view === "budget" ? (
            <BudgetScreen
              data={data}
              month={month}
              onMonthChange={setMonth}
              onEditBudget={() => setBudgetSheet(true)}
              onAddTransaction={openNewTransaction}
            />
          ) : null}

          {view === "trips" ? (
            <TripsScreen
              data={data}
              onAddTrip={() => setTripSheet({})}
              onEditTrip={(trip) => setTripSheet({ trip })}
              onMarkReimbursed={(trip) => setSettleTripCandidate(trip)}
              onReopenTrip={handleReopenTrip}
              onDeleteTrip={(trip) => setDeleteTripCandidate(trip)}
            />
          ) : null}

          {view === "networth" ? (
            <NetWorthScreen
              data={data}
              onAddAccount={() => setAccountSheet({})}
              onEditAccount={(account) => setAccountSheet({ account })}
              onCaptureSnapshot={handleCaptureSnapshot}
              onAddPersonalItem={() => setPersonalSheet({})}
              onEditPersonalItem={(item) => setPersonalSheet({ item })}
              onSettlePersonalItem={(item) => setSettlePersonalCandidate(item)}
              onDeletePersonalItem={(item) => setDeletePersonalCandidate(item)}
            />
          ) : null}

          {view === "insights" ? (
            <InsightsScreen
              data={data}
              month={month}
              onMonthChange={setMonth}
              onAddTransaction={openNewTransaction}
            />
          ) : null}

          {view === "settings" ? (
            <SettingsScreen
              data={data}
              loadInfo={loadInfo}
              storageError={storageError}
              onBack={() => navigate("today")}
              onToast={showToast}
              onImportStatement={openImportStatement}
              onDeleted={() => {
                setMonth(currentMonthKey());
                navigate("today");
              }}
            />
          ) : null}
        </main>

        {view !== "settings" ? (
          <nav className="bottom-nav" aria-label="Navigazione principale">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`bottom-nav-item${activeTab === tab.id ? " is-active" : ""}`}
                onClick={() => navigate(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
              >
                <span className="bottom-nav-icon">
                  <Icon name={tab.icon} size={21} />
                </span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      {view !== "settings" ? (
        <button
          type="button"
          className="fab"
          onClick={openNewTransaction}
          aria-label="Nuovo movimento"
        >
          <Icon name="plus" size={20} />
          <span>Movimento</span>
        </button>
      ) : null}

      {transactionSheet ? (
        <TransactionSheet
          transaction={transactionSheet.transaction}
          accounts={data.accounts}
          defaultDate={defaultDateForMonth(selectedMonth)}
          catalog={categoryCatalog}
          onSave={handleSaveTransaction}
          onDelete={
            transactionSheet.transaction
              ? () => {
                  setDeleteTransactionCandidate(transactionSheet.transaction!);
                  setTransactionSheet(null);
                }
              : undefined
          }
          onClose={() => setTransactionSheet(null)}
        />
      ) : null}

      {budgetSheet ? (
        <BudgetSheet
          month={month}
          budget={budget}
          expenseByCategory={monthSummary.expenseByCategory}
          catalog={categoryCatalog}
          onSave={handleSaveBudget}
          onClose={() => setBudgetSheet(false)}
        />
      ) : null}

      {accountSheet ? (
        <AccountSheet
          account={accountSheet.account}
          onSave={handleSaveAccount}
          onDelete={
            accountSheet.account
              ? () => {
                  setDeleteAccountCandidate(accountSheet.account!);
                  setAccountSheet(null);
                }
              : undefined
          }
          onClose={() => setAccountSheet(null)}
        />
      ) : null}

      {tripSheet ? (
        <TripSheet
          trip={tripSheet.trip}
          defaultDate={defaultDateForMonth(selectedMonth)}
          defaultRatePerKmMills={data.settings.defaultRatePerKmMills}
          onSave={handleSaveTrip}
          onDelete={
            tripSheet.trip
              ? () => {
                  setDeleteTripCandidate(tripSheet.trip!);
                  setTripSheet(null);
                }
              : undefined
          }
          onClose={() => setTripSheet(null)}
        />
      ) : null}

      {settleTripCandidate ? (
        <SettleTripSheet
          trip={settleTripCandidate}
          transactions={data.transactions}
          catalog={categoryCatalog}
          onSettle={handleMarkTripReimbursed}
          onClose={() => setSettleTripCandidate(null)}
        />
      ) : null}

      {personalSheet ? (
        <PersonalItemSheet
          item={personalSheet.item}
          defaultDate={defaultDateForMonth(selectedMonth)}
          onSave={handleSavePersonalItem}
          onDelete={
            personalSheet.item
              ? () => {
                  setDeletePersonalCandidate(personalSheet.item!);
                  setPersonalSheet(null);
                }
              : undefined
          }
          onClose={() => setPersonalSheet(null)}
        />
      ) : null}

      {settlePersonalCandidate ? (
        <SettlePersonalItemSheet
          item={settlePersonalCandidate}
          transactions={data.transactions}
          catalog={categoryCatalog}
          onSettle={handleSettlePersonalItem}
          onClose={() => setSettlePersonalCandidate(null)}
        />
      ) : null}

      {importSheetOpen ? (
        <ImportStatementSheet
          data={data}
          onClose={() => setImportSheetOpen(false)}
          onImported={handleStatementImported}
        />
      ) : null}

      {deleteTransactionCandidate ? (
        <ConfirmDialog
          title="Eliminare il movimento?"
          destructive
          confirmLabel="Elimina movimento"
          onClose={() => setDeleteTransactionCandidate(null)}
          onConfirm={handleDeleteTransaction}
          body={
            <p>
              Il movimento del{" "}
              <strong>
                {deleteTransactionCandidate.date.split("-").reverse().join("/")}
              </strong>
              {deleteTransactionCandidate.description
                ? ` (“${deleteTransactionCandidate.description}”)`
                : ""}{" "}
              verrà eliminato. I totali del mese si aggiorneranno subito.
            </p>
          }
        />
      ) : null}

      {deleteAccountCandidate ? (
        <ConfirmDialog
          title="Eliminare il conto?"
          destructive
          confirmLabel="Elimina conto"
          onClose={() => setDeleteAccountCandidate(null)}
          onConfirm={handleDeleteAccount}
          body={
            <>
              <p>
                Il conto <strong>{deleteAccountCandidate.name}</strong> verrà
                rimosso dal patrimonio.
              </p>
              <p>
                I movimenti restano salvati, ma non saranno più associati a
                questo conto.
              </p>
            </>
          }
        />
      ) : null}

      {deleteTripCandidate ? (
        <ConfirmDialog
          title="Eliminare la trasferta?"
          destructive
          confirmLabel="Elimina trasferta"
          onClose={() => setDeleteTripCandidate(null)}
          onConfirm={handleDeleteTrip}
          body={
            <>
              <p>
                La trasferta <strong>{deleteTripCandidate.title}</strong> e le
                sue spese anticipate verranno rimosse.
              </p>
              <p>I movimenti bancari non vengono toccati.</p>
            </>
          }
        />
      ) : null}

      {deletePersonalCandidate ? (
        <ConfirmDialog
          title="Eliminare la voce?"
          destructive
          confirmLabel="Elimina voce"
          onClose={() => setDeletePersonalCandidate(null)}
          onConfirm={handleDeletePersonalItem}
          body={
            <p>
              <strong>{deletePersonalCandidate.person}</strong> ·{" "}
              {deletePersonalCandidate.description} ·{" "}
              {formatMoney(deletePersonalCandidate.amountCents)}. La voce verrà
              eliminata. Nessun movimento bancario cambierà.
            </p>
          }
        />
      ) : null}

      {toast ? <Toast message={toast} onDismiss={dismissToast} /> : null}
    </div>
  );
}
