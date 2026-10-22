"use client";

import { useMemo, useState } from "react";
import type { BalanceData, TransactionType } from "@/lib/types";
import {
  getMonthSummary,
  groupTransactionsByDate,
  transactionsForMonth,
} from "@/lib/finance";
import {
  allCategoriesForType,
  createCategoryCatalog,
  getCategoryLabel,
} from "@/lib/categories";
import {
  currentMonthKey,
  formatDateGroup,
  weekdayLabel,
  monthTitle,
} from "@/lib/dates";
import { formatMoney, sumCents } from "@/lib/money";
import { MonthNav } from "../ui/MonthNav";
import { Icon } from "../ui/Icon";
import { EmptyState } from "../ui/EmptyState";
import { TransactionRow } from "../TransactionRow";

type TypeFilter = "all" | TransactionType;

interface TransactionsScreenProps {
  data: BalanceData;
  month: string;
  onMonthChange: (month: string) => void;
  onAddTransaction: () => void;
  onEditTransaction: (id: string) => void;
  onImportStatement: () => void;
}

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "expense", label: "Spese" },
  { value: "income", label: "Entrate" },
  { value: "transfer", label: "Trasferimenti" },
];

export function TransactionsScreen({
  data,
  month,
  onMonthChange,
  onAddTransaction,
  onEditTransaction,
  onImportStatement,
}: TransactionsScreenProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const summary = getMonthSummary(
    month,
    data.transactions,
    data.historicalMonthlySummaries,
  );
  const catalog = createCategoryCatalog(data);
  const monthTransactions = transactionsForMonth(data.transactions, month);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("it");
    return monthTransactions.filter((transaction) => {
      if (typeFilter !== "all" && transaction.type !== typeFilter) return false;
      if (
        categoryFilter !== "all" &&
        transaction.category !== categoryFilter
      ) {
        return false;
      }
      if (!term) return true;
      const account = data.accounts.find(
        (item) => item.id === transaction.accountId,
      );
      const toAccount = data.accounts.find(
        (item) => item.id === transaction.toAccountId,
      );
      const haystack = [
        transaction.description,
        transaction.notes,
        transaction.subcategory,
        transaction.category
          ? getCategoryLabel(
              transaction.category,
              transaction.type === "income" ? "income" : "expense",
              catalog,
            )
          : "trasferimento",
        account?.name,
        toAccount?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("it");
      return haystack.includes(term);
    });
  }, [
    monthTransactions,
    search,
    typeFilter,
    categoryFilter,
    data.accounts,
    catalog,
  ]);

  const groups = groupTransactionsByDate(filtered);
  const filteredExpenses = sumCents(
    filtered.filter((item) => item.type === "expense").map((item) => item.amountCents),
  );
  const filteredIncome = sumCents(
    filtered.filter((item) => item.type === "income").map((item) => item.amountCents),
  );
  const activeFilters =
    typeFilter !== "all" || categoryFilter !== "all" || search.trim() !== "";

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setCategoryFilter("all");
  }

  return (
    <div className="screen screen--transactions">
      <header className="screen-header">
        <div className="screen-header-main">
          <p className="eyebrow">Elenco</p>
          <h1 className="screen-title">Movimenti</h1>
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

      <div className="month-toolbar">
        <MonthNav month={month} onChange={onMonthChange} />
        <p className="month-toolbar-caption">{monthTitle(month)}</p>
      </div>

      <button
        type="button"
        className="import-entry"
        onClick={onImportStatement}
      >
        <span className="import-entry-icon">
          <Icon name="upload" size={18} />
        </span>
        <span className="import-entry-copy">
          <strong>Importa estratto conto</strong>
          <small>CSV o Excel. Rivedi i movimenti prima di salvarli.</small>
        </span>
        <Icon name="chevronRight" size={18} />
      </button>

      <div className="transaction-summary-strip" aria-label="Totali del periodo filtrato">
        <div>
          <span>Entrate</span>
          <strong>{formatMoney(filteredIncome)}</strong>
        </div>
        <div>
          <span>Spese</span>
          <strong>{formatMoney(filteredExpenses)}</strong>
        </div>
        <div>
          <span>Movimenti</span>
          <strong>{filtered.length}</strong>
        </div>
      </div>

      <div className="filters">
        <div className="search-field">
          <Icon name="search" size={18} />
          <label htmlFor="transaction-search" className="visually-hidden">
            Cerca un movimento
          </label>
          <input
            id="transaction-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca descrizione o categoria"
            autoComplete="off"
          />
          {search ? (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearch("")}
              aria-label="Cancella ricerca"
            >
              <Icon name="close" size={15} />
            </button>
          ) : null}
        </div>

        <div className="filter-row">
          <div className="segmented" role="group" aria-label="Filtra per tipo">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`segmented-item${typeFilter === filter.value ? " is-active" : ""}`}
                onClick={() => setTypeFilter(filter.value)}
                aria-pressed={typeFilter === filter.value}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`filter-toggle${categoryFilter !== "all" ? " has-filter" : ""}`}
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
            aria-controls="category-filter-panel"
          >
            <Icon name="filter" size={16} />
            Categoria
          </button>
        </div>

        {showFilters ? (
          <div className="filter-panel" id="category-filter-panel">
            <label className="field field--inline">
              <span className="field-label">Categoria</span>
              <select
                className="select-input"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">Tutte le categorie</option>
                <optgroup label="Spese">
                  {allCategoriesForType("expense", catalog).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                      {category.hidden || category.archived ? " (non attiva)" : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Entrate">
                  {allCategoriesForType("income", catalog).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                      {category.hidden || category.archived ? " (non attiva)" : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            {activeFilters ? (
              <button type="button" className="text-link" onClick={resetFilters}>
                Azzera filtri
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {summary.source === "historical" ? (
        <p className="historical-note">
          <Icon name="info" size={15} />
          Questo mese contiene solo totali storici aggregati: non ci sono
          movimenti individuali da mostrare.
        </p>
      ) : null}

      {summary.source === "empty" && monthTransactions.length === 0 ? (
        <EmptyState
          icon="list"
          title="Nessun movimento in questo mese"
          body="Aggiungi un movimento o importa l'estratto conto della banca."
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
      ) : groups.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nessun risultato"
          body="Prova a cambiare ricerca o filtri. I movimenti non sono stati modificati."
          action={
            <button type="button" className="button button--soft button--small" onClick={resetFilters}>
              Azzera filtri
            </button>
          }
        />
      ) : (
        <div className="transaction-groups">
          {groups.map((group) => (
            <section key={group.date} className="transaction-group">
              <div className="date-group-heading">
                <h2>{formatDateGroup(group.date)}</h2>
                <span>{weekdayLabel(group.date)}</span>
              </div>
              <div className="movement-list">
                {group.items.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    accounts={data.accounts}
                    catalog={catalog}
                    onClick={() => onEditTransaction(transaction.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="list-footnote">
        {month === currentMonthKey()
          ? "I trasferimenti tra i tuoi conti non alterano entrate e spese."
          : "Stai consultando un mese passato. I totali restano invariati."}
      </p>
    </div>
  );
}
