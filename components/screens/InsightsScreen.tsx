"use client";

import type { BalanceData } from "@/lib/types";
import { buildInsights, insightIntro } from "@/lib/insights";
import { createCategoryCatalog } from "@/lib/categories";
import {
  summarizeBusinessTrips,
  summarizePersonalBalance,
} from "@/lib/trips";
import { formatMoney, formatPercent } from "@/lib/money";
import { monthTitle } from "@/lib/dates";
import { MonthNav } from "../ui/MonthNav";
import { Icon } from "../ui/Icon";
import { RateRing } from "../ui/RateRing";
import { EmptyState } from "../ui/EmptyState";

interface InsightsScreenProps {
  data: BalanceData;
  month: string;
  onMonthChange: (month: string) => void;
  onAddTransaction: () => void;
}

export function InsightsScreen({
  data,
  month,
  onMonthChange,
  onAddTransaction,
}: InsightsScreenProps) {
  const insights = buildInsights({
    month,
    transactions: data.transactions,
    historicalSummaries: data.historicalMonthlySummaries,
    budgets: data.monthlyBudgets,
    accounts: data.accounts,
    snapshots: data.netWorthSnapshots,
    categoryCatalog: createCategoryCatalog(data),
  });
  const { summary } = insights;
  const tripSummary = summarizeBusinessTrips(data.businessTrips);
  const personalSummary = summarizePersonalBalance(data.personalBalanceItems);
  const hasExtraInfo =
    tripSummary.totalCents > 0 ||
    personalSummary.receivableCents > 0 ||
    personalSummary.payableCents > 0;

  return (
    <div className="screen screen--insights">
      <header className="screen-header">
        <div className="screen-header-main">
          <p className="eyebrow">Dati del mese</p>
          <h1 className="screen-title">Insights</h1>
        </div>
      </header>

      <div className="month-toolbar">
        <MonthNav month={month} onChange={onMonthChange} />
        <p className="month-toolbar-caption">{monthTitle(month)}</p>
      </div>

      <p className="screen-lede">{insightIntro(month, insights.hasData, insights.cards)}</p>

      {summary.source === "historical" ? (
        <p className="historical-note">
          <Icon name="info" size={15} />
          Le osservazioni di questo mese si basano sui totali storici aggregati.
        </p>
      ) : null}

      {!insights.hasData ? (
        <EmptyState
          icon="insights"
          title="Nessun movimento in questo mese"
          body="Le osservazioni usano solo i movimenti registrati. Non ci sono numeri inventati."
          action={
            <button
              type="button"
              className="button button--primary button--small"
              onClick={onAddTransaction}
            >
              <Icon name="plus" size={16} />
              Aggiungi movimento
            </button>
          }
        />
      ) : (
        <>
          <section className="insights-hero" aria-labelledby="insights-summary-title">
            <div className="insights-hero-main">
              <p className="eyebrow">Il mese in breve</p>
              <h2 id="insights-summary-title" className="sr-only">
                Riepilogo di {monthTitle(month)}
              </h2>
              <div className="insights-hero-metrics">
                <div>
                  <span>Entrate</span>
                  <strong>{formatMoney(summary.incomeCents)}</strong>
                </div>
                <div>
                  <span>Spese</span>
                  <strong>{formatMoney(summary.expenseCents)}</strong>
                </div>
                <div>
                  <span>Risparmiato</span>
                  <strong>{formatMoney(summary.savingsCents)}</strong>
                </div>
              </div>
              <p className="insights-rate-copy">
                {insights.savingsRate === null
                  ? "Nessuna entrata registrata: il tasso di risparmio non è calcolabile."
                  : insights.savingsRate < 0
                    ? "Le spese hanno superato le entrate. Il tasso è negativo."
                    : `Hai risparmiato il ${formatPercent(insights.savingsRate, 1)} delle entrate del mese.`}
              </p>
            </div>
            {insights.savingsRate !== null ? (
              <div className="insights-rate">
                <RateRing rate={insights.savingsRate} label="Tasso di risparmio" />
                <span>Tasso di risparmio</span>
              </div>
            ) : null}
          </section>

          {insights.cards.length > 0 ? (
            <section className="insight-cards" aria-labelledby="insight-list-title">
              <div className="section-heading section-heading--tight">
                <div>
                  <p className="eyebrow">Osservazioni</p>
                  <h2 id="insight-list-title">Cosa dicono i numeri</h2>
                </div>
              </div>
              <ol className="insight-list">
                {insights.cards.map((card, index) => (
                  <li
                    key={card.id}
                    className={`insight-card${card.tone === "accent" ? " insight-card--accent" : ""}`}
                  >
                    <span className="insight-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="insight-body">
                      <p className="eyebrow">{card.eyebrow}</p>
                      <p>{card.body}</p>
                    </div>
                    {card.value ? (
                      <span className="insight-value">{card.value}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <p className="insight-quiet">
              I dati di {monthTitle(month).toLowerCase()} ci sono, ma servono
              altri movimenti per aggiungere osservazioni.
            </p>
          )}

          <p className="insights-disclaimer">
            <Icon name="info" size={15} />
            Balance descrive ciò che hai registrato. Non dà consigli su
            investimenti, debiti o prodotti finanziari.
          </p>
        </>
      )}

      {hasExtraInfo ? (
        <section className="insight-assets" aria-labelledby="insight-assets-title">
          <div className="section-heading section-heading--tight">
            <div>
              <p className="eyebrow">Fuori dal cash flow</p>
              <h2 id="insight-assets-title">Crediti e trasferte</h2>
            </div>
          </div>
          <ul>
            {personalSummary.receivableCents > 0 ? (
              <li>
                <span>Da ricevere</span>
                <strong>{formatMoney(personalSummary.receivableCents)}</strong>
              </li>
            ) : null}
            {personalSummary.payableCents > 0 ? (
              <li>
                <span>Da dare</span>
                <strong>{formatMoney(personalSummary.payableCents)}</strong>
              </li>
            ) : null}
            {tripSummary.totalCents > 0 ? (
              <li>
                <span>Trasferte aperte</span>
                <strong>{formatMoney(tripSummary.totalCents)}</strong>
              </li>
            ) : null}
          </ul>
          <p className="insight-assets-note">
            <Icon name="info" size={14} />
            Questi importi non modificano entrate, spese, risparmio o tasso di
            risparmio.
          </p>
        </section>
      ) : null}
    </div>
  );
}
