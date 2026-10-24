"use client";

import { useState } from "react";
import type { BalanceData } from "@/lib/types";
import { annualCategoryDetail, categoryTotals, resolveInsightYear, transactionYears } from "@/lib/insights";
import { summarizeYear } from "@/lib/finance";
import { createCategoryCatalog, getCategoryLabel } from "@/lib/categories";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatLongDate, monthTitle } from "@/lib/dates";
import { CategoryIcon } from "./CategoryIcon";
import { ProgressBar } from "./ProgressBar";
import { Sheet } from "./Sheet";
import styles from "./AnnualCategoryExpenses.module.css";

export function AnnualCategoryExpenses({ data }: { data: BalanceData }) {
  const years = transactionYears(data.transactions);
  const [selectedYear, setSelectedYear] = useState<string>();
  const year = resolveInsightYear(years, selectedYear);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const isIncome = kind === "income";
  const label = isIncome ? "Entrate" : "Spese";
  const catalog = createCategoryCatalog(data);
  const summary = summarizeYear(year, data.transactions, data.historicalMonthlySummaries);
  const categories = categoryTotals(isIncome ? summary.incomeByCategory : summary.expenseByCategory, isIncome ? summary.incomeCents : summary.expenseCents);
  const detail = categoryId ? annualCategoryDetail(year, categoryId, data.transactions, data.historicalMonthlySummaries, kind) : null;
  const hasHistory = data.historicalMonthlySummaries.some((item) => item.month.startsWith(`${year}-`));

  return (
    <section className={styles.panel} aria-labelledby="annual-categories-title">
      <div className={styles.header}>
        <div><p className="eyebrow">Il tuo anno</p><h2 id="annual-categories-title">{label} per categoria — Anno</h2></div>
        <label className={styles.year}><span className="sr-only">Anno delle categorie</span>
          <select value={year} disabled={years.length === 0} onChange={(event) => { setSelectedYear(event.target.value); setCategoryId(null); }}>
            {years.length === 0 ? <option value={year}>{year}</option> : years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="segmented" role="group" aria-label="Tipo di movimento annuale">
        {(["expense", "income"] as const).map((value) => <button key={value} type="button" className={`segmented-item${kind === value ? " is-active" : ""}`} aria-pressed={kind === value} onClick={() => { setKind(value); setCategoryId(null); }}>{value === "income" ? "Entrate" : "Spese"}</button>)}
      </div>
      <div className={styles.total}><span>Totale {label.toLowerCase()} {year}</span><strong>{formatMoney(isIncome ? summary.incomeCents : summary.expenseCents)}</strong></div>
      {hasHistory ? <p className="historical-note">Come negli altri Insight, i mesi senza entrate o spese registrate usano i totali storici importati. I dati dello stesso mese non vengono sommati due volte.</p> : null}
      {categories.length ? <ul className={styles.list} aria-label={`${label} per categoria ${year}`}>
        {categories.map((item) => {
          const label = getCategoryLabel(item.categoryId, kind, catalog);
          return <li key={item.categoryId}><button type="button" className={styles.row} onClick={() => setCategoryId(item.categoryId)} aria-label={`${label}, ${formatMoney(item.cents)}. Apri dettaglio annuale.`}>
            <CategoryIcon categoryId={item.categoryId} kind={kind} size="sm" catalog={catalog} />
            <span className={styles.body}><span className={styles.label}>{label}</span><ProgressBar value={item.share} tone={isIncome ? "warm" : "ink"} label={label} valueText={`${formatPercent(item.share, 1)} delle ${isIncome ? "entrate" : "spese"}`} /></span>
            <strong className={styles.amount}>{formatMoney(item.cents)}</strong>
          </button></li>;
        })}
      </ul> : <p className={styles.empty}>{isIncome ? "Nessuna entrata registrata" : "Nessuna spesa registrata"} nel {year}.</p>}
      {detail && categoryId ? <Sheet title={getCategoryLabel(categoryId, kind, catalog)} subtitle={`${label} nell’anno ${year}`} onClose={() => setCategoryId(null)}>
        <dl className={styles.metrics}>
          <div><dt>Totale annuale</dt><dd>{formatMoney(detail.cents)}</dd></div>
          <div><dt>Numero di {label.toLowerCase()}{detail.historicalMonths > 0 ? " registrate" : ""}</dt><dd>{detail.transactions.length}</dd></div>
          <div><dt>Media mensile · 12 mesi</dt><dd>{formatMoney(detail.averageCents)}</dd></div>
        </dl>
        {detail.historicalMonths > 0 ? <p className="historical-note">Il totale include {detail.historicalMonths} mesi di dati storici aggregati, senza movimenti individuali disponibili. Il conteggio riguarda solo i movimenti registrati.</p> : null}
        <h3 className={styles.detailTitle}>Mesi con {isIncome ? "maggiori entrate" : "maggiore spesa"}</h3>
        <ul className={styles.list}>{detail.months.slice(0, 3).map((item) => <li className={styles.detailRow} key={item.month}><span>{monthTitle(item.month)}</span><strong className={styles.amount}>{formatMoney(item.cents)}</strong></li>)}</ul>
        <h3 className={styles.detailTitle}>{label} che compongono il totale</h3>
        <ul className={styles.list}>{detail.transactions.map((item) => <li className={styles.detailRow} key={item.id}><span className={styles.description}>{item.description || getCategoryLabel(categoryId, kind, catalog)}<small>{formatLongDate(item.date)}</small></span><strong className={styles.amount}>{formatMoney(item.amountCents)}</strong></li>)}</ul>
        {detail.transactions.length === 0 ? <p>Nessun movimento individuale disponibile.</p> : null}
      </Sheet> : null}
    </section>
  );
}
