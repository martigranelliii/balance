"use client";

import type { BalanceData, Transaction } from "@/lib/types";
import {
  calculateBudgetStatus,
  calculateNetWorth,
  getBudgetForMonth,
  getMonthSummary,
  recentTransactions,
  snapshotChange,
  sortSnapshots,
  summarizeYear,
} from "@/lib/finance";
import {
  allCategoriesForType,
  createCategoryCatalog,
  getCategoryLabel,
} from "@/lib/categories";
import {
  summarizeBusinessTrips,
  summarizePersonalBalance,
} from "@/lib/trips";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  currentMonthKey,
  formatShortDate,
  monthProgress,
  monthName,
  monthTitle,
  monthYear,
  todayISO,
} from "@/lib/dates";
import { MonthNav } from "../ui/MonthNav";
import { ProgressBar } from "../ui/ProgressBar";
import { Icon } from "../ui/Icon";
import { CategoryIcon } from "../ui/CategoryIcon";
import { TransactionRow } from "../TransactionRow";
import { EmptyState } from "../ui/EmptyState";
import { Sparkline } from "../ui/Sparkline";
import { AnnualSavings } from "../ui/AnnualSavings";

interface TodayScreenProps {
  data: BalanceData;
  month: string;
  onMonthChange: (month: string) => void;
  onAddTransaction: () => void;
  onEditTransaction: (transaction: Transaction) => void;
  onOpenBudget: () => void;
  onOpenNetWorth: () => void;
  onOpenTransactions: () => void;
  onOpenInsights: () => void;
  onOpenTrips: () => void;
  onAddAccount: () => void;
}

export function TodayScreen({
  data,
  month,
  onMonthChange,
  onAddTransaction,
  onEditTransaction,
  onOpenBudget,
  onOpenNetWorth,
  onOpenTransactions,
  onOpenInsights,
  onOpenTrips,
  onAddAccount,
}: TodayScreenProps) {
  const summary = getMonthSummary(
    month,
    data.transactions,
    data.historicalMonthlySummaries,
  );
  const annual = summarizeYear(
    monthYear(month),
    data.transactions,
    data.historicalMonthlySummaries,
  );
  const budget = getBudgetForMonth(data.monthlyBudgets, month);
  const catalog = createCategoryCatalog(data);
  const budgetStatus = calculateBudgetStatus(
    budget,
    summary.expenseByCategory,
    allCategoriesForType("expense", catalog).map((category) => category.id),
  );
  const netWorth = calculateNetWorth(data.accounts);
  const tripSummary = summarizeBusinessTrips(data.businessTrips);
  const personalSummary = summarizePersonalBalance(data.personalBalanceItems);
  const hasPersonalSummary =
    tripSummary.openCount > 0 ||
    personalSummary.receivableCount > 0 ||
    personalSummary.payableCount > 0;
  const months = recentTransactions(
    data.transactions.filter((item) => item.date.startsWith(month)),
    4,
  );
  const snapshots = sortSnapshots(data.netWorthSnapshots);
  const change = snapshotChange(data.netWorthSnapshots);
  const isCurrent = month === currentMonthKey();
  const progress = monthProgress(month, todayISO());
  const firstRun =
    data.transactions.length === 0 &&
    data.accounts.length === 0 &&
    data.monthlyBudgets.length === 0 &&
    data.historicalMonthlySummaries.length === 0 &&
    data.businessTrips.length === 0 &&
    data.personalBalanceItems.length === 0;

  const savingsCopy =
    summary.source === "empty"
      ? "Nessun movimento in questo mese."
      : summary.savingsCents < 0
        ? `Le spese superano le entrate di ${formatMoney(Math.abs(summary.savingsCents))}.`
        : summary.savingsCents === 0
          ? "Entrate e spese si equivalgono."
          : "Entrate meno spese. I trasferimenti restano fuori dai totali.";

  const headline = firstRun
    ? "Budgeting, made simple."
    : `${monthTitle(month)}: riepilogo.`;

  const topBudgetRows = budgetStatus.rows
    .slice()
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 2);

  return (
    <div className="screen screen--today">
      <header className="screen-header">
        <div className="screen-header-main">
          <p className="eyebrow">Il tuo mese</p>
          <MonthNav month={month} onChange={onMonthChange} variant="large" />
        </div>
        <button
          type="button"
          className="button button--primary screen-add desktop-only-flex"
          onClick={onAddTransaction}
        >
          <Icon name="plus" size={18} />
          Movimento
        </button>
      </header>

      <p className="screen-lede">{headline}</p>

      {firstRun ? (
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <div className="welcome-top">
            <span className="welcome-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <div>
              <p className="eyebrow">Balance</p>
              <h2 id="welcome-title">Inizia da un movimento.</h2>
            </div>
          </div>
          <p className="welcome-copy">
            Registra entrate e spese, imposta un budget e aggiorna i saldi dei
            conti.
          </p>
          <div className="welcome-actions">
            <button type="button" className="welcome-step" onClick={onAddTransaction}>
              <span className="welcome-step-number">01</span>
              <span className="welcome-step-copy">
                <strong>Il primo movimento</strong>
                <span>Inserisci importo e categoria.</span>
              </span>
              <Icon name="arrowRight" size={18} />
            </button>
            <button type="button" className="welcome-step" onClick={onAddAccount}>
              <span className="welcome-step-number">02</span>
              <span className="welcome-step-copy">
                <strong>I conti</strong>
                <span>Banca, contanti, risparmi, investimenti.</span>
              </span>
              <Icon name="arrowRight" size={18} />
            </button>
            <button type="button" className="welcome-step" onClick={onOpenBudget}>
              <span className="welcome-step-number">03</span>
              <span className="welcome-step-copy">
                <strong>Un budget per il mese</strong>
                <span>Scegli un limite per le categorie di spesa.</span>
              </span>
              <Icon name="arrowRight" size={18} />
            </button>
          </div>
          <p className="privacy-note">
            <Icon name="lock" size={14} />
            I tuoi dati sono privati nel tuo account.
          </p>
        </section>
      ) : (
        <section className={`hero-card${summary.savingsCents < 0 ? " hero-card--negative" : ""}`}>
          <div className="hero-top">
            <p className="eyebrow">Risparmiato</p>
            {summary.source === "historical" ? (
              <span className="source-badge">Dati storici</span>
            ) : (
              <span className="hero-month">{monthName(month)}</span>
            )}
          </div>
          <p className="hero-amount">{formatMoney(summary.savingsCents)}</p>
          <p className="hero-copy">{savingsCopy}</p>

          <dl className="hero-metrics">
            <div>
              <dt>Entrate</dt>
              <dd className="money-positive">{formatMoney(summary.incomeCents)}</dd>
            </div>
            <div>
              <dt>Spese</dt>
              <dd>{formatMoney(summary.expenseCents)}</dd>
            </div>
            <div>
              <dt>Movimenti</dt>
              <dd>{summary.source === "historical" ? "—" : summary.transactionCount}</dd>
            </div>
          </dl>

          <AnnualSavings summary={annual} variant="hero" />

          <div className="month-progress">
            <div className="month-progress-label">
              <span>
                {isCurrent
                  ? "Mese in corso"
                  : month < currentMonthKey()
                    ? "Mese concluso"
                    : "Mese futuro"}
              </span>
              <span>
                {progress.elapsed} / {progress.total} giorni
              </span>
            </div>
            <ProgressBar
              value={progress.ratio}
              tone="ink"
              label={`Avanzamento di ${monthTitle(month)}`}
              valueText={`${progress.elapsed} giorni su ${progress.total}`}
            />
          </div>
        </section>
      )}

      {summary.source === "historical" ? (
        <p className="historical-note">
          <Icon name="info" size={15} />
          Questo mese mostra i totali mensili della cronologia. Non contiene
          movimenti individuali.
        </p>
      ) : null}

      <div className="today-grid">
        <section className="panel budget-preview" aria-labelledby="home-budget-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Budget</p>
              <h2 id="home-budget-title">
                {budgetStatus.hasBudget
                  ? budgetStatus.isOver
                    ? "Oltre il budget"
                    : "Rimangono"
                  : "Budget del mese"}
              </h2>
            </div>
            <button type="button" className="text-link" onClick={onOpenBudget}>
              {budgetStatus.hasBudget ? "Dettaglio" : "Imposta"}
            </button>
          </div>

          {budgetStatus.hasBudget ? (
            <>
              <p className="budget-big">
                {formatMoney(Math.abs(budgetStatus.totalRemainingCents))}
                {budgetStatus.isOver ? (
                  <span className="budget-big-note">oltre il budget</span>
                ) : null}
              </p>
              <p className="panel-caption">
                {formatMoney(budgetStatus.totalSpentCents)} spesi di{" "}
                {formatMoney(budgetStatus.totalBudgetCents)}
              </p>
              <ProgressBar
                value={budgetStatus.progress}
                over={budgetStatus.isOver}
                label="Budget complessivo del mese"
                valueText={`${formatPercent(budgetStatus.progress)} usato`}
              />
              <ul className="budget-mini-list">
                {topBudgetRows.map((row) => (
                  <li key={row.categoryId}>
                    <span className="budget-mini-label">
                      <CategoryIcon
                        categoryId={row.categoryId}
                        kind="expense"
                        size="sm"
                        catalog={catalog}
                      />
                      {getCategoryLabel(row.categoryId, "expense", catalog)}
                    </span>
                    <span className="budget-mini-value">
                      {formatMoney(row.spentCents)}
                      <span> / {formatMoney(row.budgetCents)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="panel-footer-link" onClick={onOpenBudget}>
                Apri budget
                <Icon name="arrowRight" size={15} />
              </button>
            </>
          ) : (
            <EmptyState
              compact
              icon="budget"
              title="Nessun budget impostato"
              body="Scegli un limite per le categorie di spesa. Puoi modificarlo quando vuoi."
              action={
                <button type="button" className="button button--soft button--small" onClick={onOpenBudget}>
                  Imposta budget
                </button>
              }
            />
          )}
        </section>

        <section className="panel networth-preview" aria-labelledby="home-networth-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Patrimonio</p>
              <h2 id="home-networth-title">
                {netWorth.hasIncludedAccounts
                  ? formatMoney(netWorth.totalCents)
                  : "Ciò che possiedi"}
              </h2>
            </div>
            <button type="button" className="text-link" onClick={onOpenNetWorth}>
              Apri
            </button>
          </div>

          {data.accounts.length === 0 ? (
            <EmptyState
              compact
              icon="layers"
              title="Nessun conto"
              body="Aggiungi banca, contanti o investimenti per calcolare il patrimonio."
              action={
                <button type="button" className="button button--soft button--small" onClick={onAddAccount}>
                  Aggiungi conto
                </button>
              }
            />
          ) : !netWorth.hasIncludedAccounts ? (
            <EmptyState
              compact
              icon="layers"
              title="Nessun conto incluso"
              body="Tutti i conti sono esclusi dal patrimonio. Puoi riattivarli dai conti."
              action={
                <button type="button" className="button button--soft button--small" onClick={onOpenNetWorth}>
                  Gestisci conti
                </button>
              }
            />
          ) : (
            <>
              <div className="networth-split">
                <div>
                  <span>Liquidità</span>
                  <strong>{formatMoney(netWorth.liquidCents)}</strong>
                </div>
                <div>
                  <span>Investimenti</span>
                  <strong>{formatMoney(netWorth.investmentsCents)}</strong>
                </div>
              </div>
              {snapshots.length >= 2 ? (
                <div className="networth-chart-row">
                  <Sparkline
                    values={snapshots.slice(-8).map((item) => item.totalCents)}
                    label={`Andamento del patrimonio, ultima fotografia ${formatShortDate(snapshots.at(-1)?.date ?? "")}`}
                  />
                  {change ? (
                    <span
                      className={`change-label${change.changeCents > 0 ? " change-label--up" : ""}`}
                    >
                      {change.changeCents > 0 ? "+" : ""}
                      {formatMoney(change.changeCents)}
                      <small> dall’ultimo aggiornamento</small>
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="panel-caption">
                  Aggiorna i saldi per vedere l&apos;andamento.
                </p>
              )}
              <button type="button" className="panel-footer-link" onClick={onOpenNetWorth}>
                Aggiorna il patrimonio
                <Icon name="arrowRight" size={15} />
              </button>
            </>
          )}
        </section>
      </div>

      {hasPersonalSummary ? (
        <section className="home-personal" aria-labelledby="home-personal-title">
          <div className="home-personal-head">
            <div>
              <p className="eyebrow">Fuori dai movimenti</p>
              <h2 id="home-personal-title">Da ricordare</h2>
            </div>
          </div>
          <div className="home-personal-grid">
            <button type="button" onClick={onOpenTrips}>
              <span>Trasferte da recuperare</span>
              <strong>{formatMoney(tripSummary.totalCents)}</strong>
            </button>
            <button type="button" onClick={onOpenNetWorth}>
              <span>Da ricevere</span>
              <strong>{formatMoney(personalSummary.receivableCents)}</strong>
            </button>
            <button type="button" onClick={onOpenNetWorth}>
              <span>Da dare</span>
              <strong>{formatMoney(personalSummary.payableCents)}</strong>
            </button>
          </div>
        </section>
      ) : null}

      <section className="recent-section" aria-labelledby="recent-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Questo mese</p>
            <h2 id="recent-title">Movimenti recenti</h2>
          </div>
          <button type="button" className="text-link" onClick={onOpenTransactions}>
            Vedi tutti
          </button>
        </div>

        {months.length > 0 ? (
          <div className="movement-list movement-list--home">
            {months.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                accounts={data.accounts}
                catalog={catalog}
                onClick={() => onEditTransaction(transaction)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="list"
            title={
              summary.source === "historical"
                ? "Nessun movimento individuale"
                : "Nessun movimento in questo mese"
            }
            body={
              summary.source === "historical"
                ? "Per questo mese ci sono solo i totali storici. I nuovi movimenti compariranno qui."
                : "Aggiungi importo e categoria per iniziare."
            }
            action={
              <button type="button" className="button button--primary button--small" onClick={onAddTransaction}>
                <Icon name="plus" size={16} />
                Aggiungi movimento
              </button>
            }
          />
        )}
      </section>

      {summary.source !== "empty" ? (
        <button type="button" className="insight-teaser" onClick={onOpenInsights}>
          <span className="insight-teaser-icon">
            <Icon name="insights" size={20} />
          </span>
          <span className="insight-teaser-copy">
            <span className="eyebrow">Insights</span>
            <strong>Cosa dicono i numeri</strong>
            <span>
              {monthName(month)} · {monthYear(month)}
            </span>
          </span>
          <Icon name="arrowRight" size={18} />
        </button>
      ) : null}
    </div>
  );
}
