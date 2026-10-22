"use client";

import type { BalanceData } from "@/lib/types";
import {
  calculateBudgetStatus,
  getBudgetForMonth,
  getMonthSummary,
  spendingWithoutBudget,
} from "@/lib/finance";
import {
  allCategoriesForType,
  createCategoryCatalog,
  getCategoryLabel,
} from "@/lib/categories";
import { formatMoney, formatPercent } from "@/lib/money";
import { monthTitle } from "@/lib/dates";
import { MonthNav } from "../ui/MonthNav";
import { Icon } from "../ui/Icon";
import { ProgressBar } from "../ui/ProgressBar";
import { CategoryIcon } from "../ui/CategoryIcon";
import { EmptyState } from "../ui/EmptyState";

interface BudgetScreenProps {
  data: BalanceData;
  month: string;
  onMonthChange: (month: string) => void;
  onEditBudget: () => void;
  onAddTransaction: () => void;
}

export function BudgetScreen({
  data,
  month,
  onMonthChange,
  onEditBudget,
  onAddTransaction,
}: BudgetScreenProps) {
  const summary = getMonthSummary(
    month,
    data.transactions,
    data.historicalMonthlySummaries,
  );
  const budget = getBudgetForMonth(data.monthlyBudgets, month);
  const catalog = createCategoryCatalog(data);
  // Hidden and archived categories stay in budget/history calculations.
  const expenseIds = allCategoriesForType("expense", catalog).map(
    (category) => category.id,
  );
  const status = calculateBudgetStatus(
    budget,
    summary.expenseByCategory,
    expenseIds,
  );
  const unbudgeted = spendingWithoutBudget(
    budget,
    summary.expenseByCategory,
    expenseIds,
  );

  return (
    <div className="screen screen--budget">
      <header className="screen-header">
        <div className="screen-header-main">
          <p className="eyebrow">Spese per categoria</p>
          <h1 className="screen-title">Budget</h1>
        </div>
        <button
          type="button"
          className="button button--soft screen-add"
          onClick={onEditBudget}
        >
          <Icon name="edit" size={16} />
          {status.hasBudget ? "Modifica" : "Imposta"}
        </button>
      </header>

      <div className="month-toolbar">
        <MonthNav month={month} onChange={onMonthChange} />
        <p className="month-toolbar-caption">{monthTitle(month)}</p>
      </div>

      {summary.source === "historical" ? (
        <p className="historical-note">
          <Icon name="info" size={15} />
          Le spese di questo mese vengono dai totali storici importati. Il
          budget le confronta con le categorie corrispondenti.
        </p>
      ) : null}

      {!status.hasBudget ? (
        <EmptyState
          icon="budget"
          title="Nessun budget impostato"
          body="Scegli un limite per una o più categorie di spesa. Il budget non modifica i movimenti."
          action={
            <button
              type="button"
              className="button button--primary button--small"
              onClick={onEditBudget}
            >
              Imposta il primo budget
            </button>
          }
        />
      ) : (
        <>
          <section className="budget-overview" aria-labelledby="budget-overview-title">
            <div className="budget-overview-head">
              <div>
                <p className="eyebrow">
                  {status.isOver ? "Oltre il budget" : "Rimangono"}
                </p>
                <h2 id="budget-overview-title" className="budget-overview-amount">
                  {formatMoney(Math.abs(status.totalRemainingCents))}
                </h2>
              </div>
              <div className="budget-overview-share">
                <span>{formatPercent(status.progress)}</span>
                <small>usato</small>
              </div>
            </div>
            <ProgressBar
              value={status.progress}
              over={status.isOver}
              label="Budget totale del mese"
              valueText={`${formatPercent(status.progress)} del budget usato`}
            />
            <div className="budget-overview-legend">
              <span>
                Speso <strong>{formatMoney(status.totalSpentCents)}</strong>
              </span>
              <span>
                Budget <strong>{formatMoney(status.totalBudgetCents)}</strong>
              </span>
            </div>
          </section>

          <section className="budget-categories" aria-labelledby="budget-categories-title">
            <div className="section-heading section-heading--tight">
              <div>
                <p className="eyebrow">Categorie</p>
                <h2 id="budget-categories-title">Budget per categoria</h2>
              </div>
              <button type="button" className="text-link" onClick={onEditBudget}>
                Modifica
              </button>
            </div>

            <div className="budget-list">
              {status.rows.map((row) => (
                <button
                  key={row.categoryId}
                  type="button"
                  className={`budget-row${row.isOver ? " is-over" : ""}`}
                  onClick={onEditBudget}
                  aria-label={`${getCategoryLabel(row.categoryId, "expense", catalog)}: ${formatMoney(
                    row.spentCents,
                  )} spesi su ${formatMoney(row.budgetCents)}. ${
                    row.isOver
                      ? `${formatMoney(Math.abs(row.remainingCents))} oltre il budget.`
                      : `${formatMoney(row.remainingCents)} rimasti.`
                  } Modifica budget.`}
                >
                  <div className="budget-row-head">
                    <span className="budget-row-title">
                      <CategoryIcon
                        categoryId={row.categoryId}
                        kind="expense"
                        size="sm"
                        catalog={catalog}
                      />
                      <span>{getCategoryLabel(row.categoryId, "expense", catalog)}</span>
                    </span>
                    <span className="budget-row-values">
                      <strong>{formatMoney(row.spentCents)}</strong>
                      <span> / {formatMoney(row.budgetCents)}</span>
                    </span>
                  </div>
                  <ProgressBar
                    value={row.progress}
                    over={row.isOver}
                    label={`Budget ${getCategoryLabel(row.categoryId, "expense", catalog)}`}
                    valueText={`${formatMoney(row.spentCents)} su ${formatMoney(
                      row.budgetCents,
                    )}`}
                  />
                  <div className="budget-row-foot">
                    <span>{formatPercent(row.progress)}</span>
                    <span>
                      {row.isOver
                        ? `${formatMoney(Math.abs(row.remainingCents))} oltre`
                        : `${formatMoney(row.remainingCents)} rimasti`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {unbudgeted.length > 0 ? (
            <section className="panel unbudgeted-panel" aria-labelledby="unbudgeted-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Senza budget</p>
                  <h2 id="unbudgeted-title">Categorie senza budget</h2>
                </div>
                <button type="button" className="text-link" onClick={onEditBudget}>
                  Aggiungi
                </button>
              </div>
              <p className="panel-caption">
                Sono categorie di spesa senza un limite impostato per{" "}
                {monthTitle(month).toLowerCase()}.
              </p>
              <ul className="unbudgeted-list">
                {unbudgeted.map((row) => (
                  <li key={row.categoryId}>
                    <span>
                      <CategoryIcon
                        categoryId={row.categoryId}
                        kind="expense"
                        size="sm"
                        catalog={catalog}
                      />
                      {getCategoryLabel(row.categoryId, "expense", catalog)}
                    </span>
                    <strong>{formatMoney(row.spentCents)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <div className="budget-foot">
        <p>
          <Icon name="info" size={15} />
          Solo le spese consumano il budget. Entrate e trasferimenti non lo
          modificano.
        </p>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={onAddTransaction}
        >
          <Icon name="plus" size={15} />
          Registra una spesa
        </button>
      </div>
    </div>
  );
}
