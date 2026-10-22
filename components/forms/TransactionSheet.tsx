"use client";

import { useState, type FormEvent } from "react";
import type {
  Account,
  Reflection,
  Transaction,
  TransactionType,
} from "@/lib/types";
import {
  categoriesForType,
  getCategory,
  getCategoryLabel,
  type CategoryCatalog,
} from "@/lib/categories";
import { formatAmountInput, parseAmountToCents } from "@/lib/money";
import { Sheet } from "../ui/Sheet";
import { Icon } from "../ui/Icon";
import { CategoryIcon } from "../ui/CategoryIcon";
import type { NewTransactionInput } from "@/lib/store";

interface TransactionSheetProps {
  transaction?: Transaction;
  accounts: Account[];
  defaultDate: string;
  catalog?: CategoryCatalog;
  onSave: (input: NewTransactionInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Spesa" },
  { value: "income", label: "Entrata" },
  { value: "transfer", label: "Trasferimento" },
];

const REFLECTION_OPTIONS: { value: Reflection; label: string }[] = [
  { value: "yes", label: "Sì" },
  { value: "neutral", label: "Così così" },
  { value: "no", label: "No" },
];

export function TransactionSheet({
  transaction,
  accounts,
  defaultDate,
  catalog,
  onSave,
  onDelete,
  onClose,
}: TransactionSheetProps) {
  const editing = Boolean(transaction);
  const [type, setType] = useState<TransactionType>(
    transaction?.type ?? "expense",
  );
  const [amount, setAmount] = useState(
    transaction ? formatAmountInput(transaction.amountCents) : "",
  );
  const [category, setCategory] = useState<string | null>(
    transaction?.category ?? null,
  );
  const [date, setDate] = useState(transaction?.date ?? defaultDate);
  const [description, setDescription] = useState(
    transaction?.description ?? "",
  );
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [accountId, setAccountId] = useState(transaction?.accountId ?? "");
  const [toAccountId, setToAccountId] = useState(transaction?.toAccountId ?? "");
  const [reflection, setReflection] = useState<Reflection | undefined>(
    transaction?.reflection,
  );
  const [showNotes, setShowNotes] = useState(Boolean(transaction?.notes));
  const [error, setError] = useState<string | null>(null);

  const activeCategories = categoriesForType(type, catalog);
  const currentCategory =
    editing && category
      ? activeCategories.find((item) => item.id === category) ??
        getCategory(
          category,
          type === "income" ? "income" : "expense",
          catalog,
        )
      : undefined;
  const categories =
    currentCategory &&
    !activeCategories.some((item) => item.id === currentCategory.id)
      ? [...activeCategories, currentCategory]
      : activeCategories;
  const currentCategoryIsUnavailable = Boolean(
    currentCategory && !activeCategories.some((item) => item.id === currentCategory.id),
  );

  function changeType(next: TransactionType) {
    if (next === type) return;
    setType(next);
    setError(null);
    if (next === "transfer") {
      setCategory(null);
      setReflection(undefined);
      return;
    }
    if (
      category &&
      !categoriesForType(next, catalog).some((item) => item.id === category)
    ) {
      setCategory(null);
    }
    if (next === "income") setReflection(undefined);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cents = parseAmountToCents(amount);
    if (cents === null || cents <= 0) {
      setError("Inserisci un importo maggiore di zero, ad esempio 12,50.");
      return;
    }
    if (type !== "transfer" && !category) {
      setError("Scegli una categoria.");
      return;
    }
    if (type === "transfer" && accountId && toAccountId && accountId === toAccountId) {
      setError("I due conti devono essere diversi.");
      return;
    }
    if (!date) {
      setError("Scegli una data.");
      return;
    }

    try {
      onSave({
        type,
        amountCents: cents,
        date,
        category: type === "transfer" ? null : category,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        accountId: accountId || undefined,
        toAccountId: type === "transfer" ? toAccountId || undefined : undefined,
        reflection: type === "expense" ? reflection : undefined,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Non è stato possibile salvare il movimento.",
      );
    }
  }

  const accountOptions = accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name}
    </option>
  ));

  return (
    <Sheet
      title={editing ? "Modifica movimento" : "Nuovo movimento"}
      subtitle={
        type === "transfer"
          ? "Sposta denaro tra i tuoi conti. Non cambia entrate o spese."
          : "Importo e categoria bastano. Il resto è facoltativo."
      }
      onClose={onClose}
    >
      <form className="transaction-form" onSubmit={handleSubmit}>
        <div className="segmented segmented--type" role="group" aria-label="Tipo di movimento">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`segmented-item${type === option.value ? " is-active" : ""}`}
              onClick={() => changeType(option.value)}
              aria-pressed={type === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className={`amount-field${error && !amount ? " has-error" : ""}`}>
          <span className="field-label">Importo</span>
          <span className="amount-input-wrap">
            <span className="amount-currency" aria-hidden="true">
              €
            </span>
            <input
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              placeholder="0,00"
              autoComplete="off"
              aria-label="Importo in euro"
              data-autofocus
            />
          </span>
        </label>

        {type !== "transfer" ? (
          <fieldset className="category-fieldset">
            <legend className="field-label">Categoria</legend>
            <div className="category-grid">
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`category-choice${category === item.id ? " is-selected" : ""}`}
                  onClick={() => {
                    setCategory(item.id);
                    setError(null);
                  }}
                  aria-pressed={category === item.id}
                >
                  <CategoryIcon
                    categoryId={item.id}
                    kind={type === "income" ? "income" : "expense"}
                    type={type}
                    size="sm"
                    catalog={catalog}
                  />
                  <span>{item.shortLabel ?? item.label}</span>
                </button>
              ))}
            </div>
            {currentCategoryIsUnavailable ? (
              <p className="inline-note">
                <Icon name="info" size={15} />
                Questa categoria non è più attiva. Resta sul movimento per non
                modificarne lo storico.
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {type === "transfer" ? (
          <div className="transfer-fields">
            {accounts.length >= 2 ? (
              <>
                <label className="field">
                  <span className="field-label">Dal conto</span>
                  <select
                    className="select-input"
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                  >
                    <option value="">Nessun conto</option>
                    {accountOptions}
                  </select>
                </label>
                <span className="transfer-arrow" aria-hidden="true">
                  <Icon name="arrowDown" size={18} />
                </span>
                <label className="field">
                  <span className="field-label">Al conto</span>
                  <select
                    className="select-input"
                    value={toAccountId}
                    onChange={(event) => setToAccountId(event.target.value)}
                  >
                    <option value="">Nessun conto</option>
                    {accountOptions}
                  </select>
                </label>
              </>
            ) : (
              <p className="inline-note">
                <Icon name="info" size={15} />
                Aggiungi almeno due conti in Patrimonio per indicare da dove a
                dove si sposta il denaro. Puoi comunque salvare il trasferimento.
              </p>
            )}
          </div>
        ) : null}

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Data</span>
            <span className="input-with-icon">
              <Icon name="calendar" size={16} />
              <input
                type="date"
                className="text-input"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </span>
          </label>
          <label className="field">
            <span className="field-label">Descrizione (facoltativa)</span>
            <input
              type="text"
              className="text-input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={type === "transfer" ? "Es. Giroconto" : "Es. Pranzo"}
              maxLength={120}
              autoComplete="off"
            />
          </label>
        </div>

        {type !== "transfer" && accounts.length > 0 ? (
          <label className="field">
            <span className="field-label">Conto (facoltativo)</span>
            <select
              className="select-input"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Nessun conto</option>
              {accountOptions}
            </select>
          </label>
        ) : null}

        {type === "expense" ? (
          <fieldset className="reflection-fieldset">
            <legend className="field-label">
              Ne è valsa la pena? <span>Facoltativo</span>
            </legend>
            <div className="reflection-options">
              {REFLECTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`reflection-choice${reflection === option.value ? " is-selected" : ""}`}
                  aria-pressed={reflection === option.value}
                  onClick={() =>
                    setReflection(
                      reflection === option.value ? undefined : option.value,
                    )
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {!showNotes ? (
          <button
            type="button"
            className="disclosure-link"
            onClick={() => setShowNotes(true)}
          >
            <Icon name="plus" size={15} />
            Aggiungi una nota
          </button>
        ) : (
          <label className="field">
            <span className="field-label">Nota (facoltativa)</span>
            <textarea
              className="text-input text-area"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Un contesto, se ti serve più avanti."
            />
          </label>
        )}

        {error ? (
          <p className="form-error" role="alert">
            <Icon name="info" size={15} />
            {error}
          </p>
        ) : null}

        <div className="sheet-actions">
          {editing && onDelete ? (
            <button
              type="button"
              className="button button--danger-ghost button--small"
              onClick={onDelete}
            >
              <Icon name="trash" size={16} />
              Elimina
            </button>
          ) : (
            <button type="button" className="button button--ghost" onClick={onClose}>
              Annulla
            </button>
          )}
          <button type="submit" className="button button--primary">
            {editing ? "Salva modifiche" : "Salva movimento"}
          </button>
        </div>

        {category && type !== "transfer" ? (
          <p className="form-footnote">
            {type === "expense" ? "Spesa" : "Entrata"} in{" "}
            {getCategoryLabel(
              category,
              type === "expense" ? "expense" : "income",
              catalog,
            )}.
            {type === "expense"
              ? " Entrerà nel budget della categoria."
              : " Non consuma il budget."}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
