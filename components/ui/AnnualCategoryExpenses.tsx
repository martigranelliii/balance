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
  const catalog = createCategoryCatalog(data);
  const summary = summarizeYear(year, data.transactions, data.historicalMonthlySummaries);
  const categories = categoryTotals(summary.expenseByCategory, summary.expenseCents);
  const detail = categoryId ? annualCategoryDetail(year, categoryId, data.transactions, data.historicalMonthlySummaries) : null;
  const hasHistory = data.historicalMonthlySummaries.some((item) => item.month.startsWith(`${year}-`));

  return (
    <section className={styles.panel} aria-labelledby="annual-categories-title">
      <div className={styles.header}>
        <div><p className="eyebrow">Il tuo anno</p><h2 id="annual-categories-title">Spese per categoria — Anno</h2></div>
        <label className={styles.year}><span className="sr-only">Anno delle spese per categoria</span>
          <select value={year} disabled={years.length === 0} onChange={(event) => { setSelectedYear(event.target.value); setCategoryId(null); }}>
            {years.length === 0 ? <option value={year}>{year}</option> : years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className={styles.total}><span>Totale spese {year}</span><strong>{formatMoney(summary.expenseCents)}</strong></div>
      {hasHistory ? <p className="historical-note">Come negli altri Insight, i mesi senza entrate o spese registrate usano i totali storici importati. I dati dello stesso mese non vengono sommati due volte.</p> : null}
      {categories.length ? <ul className={styles.list} aria-label={`Spese per categoria ${year}`}>
        {categories.map((item) => {
          const label = getCategoryLabel(item.categoryId, "expense", catalog);
          return <li key={item.categoryId}><button type="button" className={styles.row} onClick={() => setCategoryId(item.categoryId)} aria-label={`${label}, ${formatMoney(item.cents)}. Apri dettaglio annuale.`}>
            <CategoryIcon categoryId={item.categoryId} kind="expense" size="sm" catalog={catalog} />
            <span className={styles.body}><span className={styles.label}>{label}</span><ProgressBar value={item.share} tone="ink" label={label} valueText={`${formatPercent(item.share, 1)} delle spese`} /></span>
            <strong className={styles.amount}>{formatMoney(item.cents)}</strong>
          </button></li>;
        })}
      </ul> : <p className={styles.empty}>Nessuna spesa registrata nel {year}.</p>}
      {detail && categoryId ? <Sheet title={getCategoryLabel(categoryId, "expense", catalog)} subtitle={`Spese nell’anno ${year}`} onClose={() => setCategoryId(null)}>
        <dl className={styles.metrics}>
          <div><dt>Totale annuale</dt><dd>{formatMoney(detail.cents)}</dd></div>
          <div><dt>Numero di spese{detail.historicalMonths > 0 ? " registrate" : ""}</dt><dd>{detail.transactions.length}</dd></div>
          <div><dt>Media mensile · 12 mesi</dt><dd>{formatMoney(detail.averageCents)}</dd></div>
        </dl>
        {detail.historicalMonths > 0 ? <p className="historical-note">Il totale include {detail.historicalMonths} mesi di dati storici aggregati, senza movimenti individuali disponibili. Il numero di spese riguarda solo i movimenti registrati.</p> : null}
        <h3 className={styles.detailTitle}>Mesi con maggiore spesa</h3>
        <ul className={styles.list}>{detail.months.slice(0, 3).map((item) => <li className={styles.detailRow} key={item.month}><span>{monthTitle(item.month)}</span><strong className={styles.amount}>{formatMoney(item.cents)}</strong></li>)}</ul>
        <h3 className={styles.detailTitle}>Spese che compongono il totale</h3>
        <ul className={styles.list}>{detail.transactions.map((item) => <li className={styles.detailRow} key={item.id}><span className={styles.description}>{item.description || getCategoryLabel(categoryId, "expense", catalog)}<small>{formatLongDate(item.date)}</small></span><strong className={styles.amount}>{formatMoney(item.amountCents)}</strong></li>)}</ul>
        {detail.transactions.length === 0 ? <p>Nessun movimento individuale disponibile.</p> : null}
      </Sheet> : null}
    </section>
  );
}
